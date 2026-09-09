import { useState, useEffect, useMemo } from 'react';
import { BarChart3, Calendar, Filter, TrendingDown, DollarSign, Activity, FileDown, FileSpreadsheet, Briefcase, BookOpen, Download } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import toast from 'react-hot-toast';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  Legend, Cell, PieChart, Pie
} from 'recharts';
import { pdf } from '@react-pdf/renderer';
import { PeriodReportPdf } from '@/components/reports/pdf/templates/PeriodReportPdf';
import { PortfolioReportPdf } from '@/components/reports/pdf/templates/PortfolioReportPdf';
import { LedgerReportPdf } from '@/components/reports/pdf/templates/LedgerReportPdf';
import { downloadExcel } from '@/components/reports/excel/ExcelExporter';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

type TabType = 'RESUMEN' | 'CARTERA' | 'LIBRO_AUXILIAR';

export function ReportsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('RESUMEN');
  
  const [data, setData] = useState<{ payments: any[], expenses: any[], loans: any[] }>({ payments: [], expenses: [], loans: [] });
  const [portfolioData, setPortfolioData] = useState<{ loans: any[], arrearsInstallments: any[] }>({ loans: [], arrearsInstallments: [] });
  const [ledgerData, setLedgerData] = useState<any[]>([]);
  
  const [routeStates, setRouteStates] = useState<any[]>([]);
  
  // Filters
  const [selectedRoute, setSelectedRoute] = useState<string>('all');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  useEffect(() => {
    AdminService.getRouteStates()
      .then(setRouteStates)
      .catch(() => toast.error('Error cargando rutas'));
  }, []);

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const [resumen, cartera, ledger] = await Promise.all([
        AdminService.getReportsData(startDate, endDate, selectedRoute),
        AdminService.getPortfolioState(selectedRoute),
        AdminService.getLedgerTransactions(startDate, endDate, selectedRoute)
      ]);
      setData(resumen);
      setPortfolioData(cartera);
      setLedgerData(ledger);
    } catch (error: any) {
      toast.error('Error al cargar datos del reporte');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [startDate, endDate, selectedRoute]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
  };

  const getRouteName = () => {
    if (selectedRoute === 'all') return 'Todas las rutas';
    return routeStates.find(r => r.id === selectedRoute)?.ruta || 'Ruta seleccionada';
  };
  const dateRangeStr = `${format(parseISO(startDate), 'dd MMM yyyy')} al ${format(parseISO(endDate), 'dd MMM yyyy')}`;

  // ─── AGGREGATIONS RESUMEN ───
  const { totalRecaudo, totalGastos, totalPrestado, gananciaProyectada } = useMemo(() => {
    const totalRecaudo = data.payments.reduce((sum, p) => sum + Number(p.total_amount), 0);
    const totalGastos = data.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const totalPrestado = data.loans.reduce((sum, l) => sum + Number(l.amount_delivered), 0);
    const interesProyectado = data.loans.reduce((sum, l) => sum + Number(l.interest_amount), 0);
    return { totalRecaudo, totalGastos, totalPrestado, gananciaProyectada: interesProyectado };
  }, [data]);

  const dailyRecaudoData = useMemo(() => {
    const grouped: Record<string, number> = {};
    data.payments.forEach(p => {
      const date = p.collected_at.split('T')[0];
      grouped[date] = (grouped[date] || 0) + Number(p.total_amount);
    });
    return Object.entries(grouped)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(item => ({ ...item, displayDate: format(parseISO(item.date), 'MMM dd') }));
  }, [data.payments]);

  const expensesByCategory = useMemo(() => {
    const grouped: Record<string, number> = {};
    data.expenses.forEach(e => {
      const cat = e.category?.name || 'Otros';
      grouped[cat] = (grouped[cat] || 0) + Number(e.amount);
    });
    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [data.expenses]);

  // ─── AGGREGATIONS CARTERA ───
  const portfolioStats = useMemo(() => {
    const capitalColocado = portfolioData.loans.reduce((s, l) => s + Number(l.amount_delivered), 0);
    const carteraActiva = portfolioData.loans.reduce((s, l) => s + Number(l.current_balance), 0);
    const capitalRecuperado = portfolioData.loans.reduce((s, l) => s + (Number(l.initial_obligation) - Number(l.current_balance)), 0);
    const carteraVencida = portfolioData.arrearsInstallments.reduce((s, i) => s + Number(i.balance), 0);
    return { capitalColocado, capitalRecuperado, carteraActiva, carteraVencida };
  }, [portfolioData]);

  const arrearsByRange = useMemo(() => {
    const today = new Date().getTime();
    let r1 = { range: '1 - 15 días', amount: 0, count: 0 };
    let r2 = { range: '16 - 30 días', amount: 0, count: 0 };
    let r3 = { range: 'Más de 30 días', amount: 0, count: 0 };
    
    portfolioData.arrearsInstallments.forEach(inst => {
      const days = Math.floor((today - new Date(inst.scheduled_date).getTime()) / (1000 * 3600 * 24));
      if (days <= 15) { r1.amount += Number(inst.balance); r1.count++; }
      else if (days <= 30) { r2.amount += Number(inst.balance); r2.count++; }
      else { r3.amount += Number(inst.balance); r3.count++; }
    });
    return [r1, r2, r3].filter(r => r.amount > 0);
  }, [portfolioData.arrearsInstallments]);

  const topDefaulters = useMemo(() => {
    const grouped: any = {};
    portfolioData.arrearsInstallments.forEach(inst => {
      if (!grouped[inst.loan_id]) grouped[inst.loan_id] = { arrearsAmount: 0, earliestDate: inst.scheduled_date };
      grouped[inst.loan_id].arrearsAmount += Number(inst.balance);
      if (new Date(inst.scheduled_date) < new Date(grouped[inst.loan_id].earliestDate)) {
         grouped[inst.loan_id].earliestDate = inst.scheduled_date;
      }
    });
    const today = new Date().getTime();
    return Object.entries(grouped).map(([loanId, d]: any) => {
      const loan = portfolioData.loans.find(l => l.id === loanId);
      const daysLate = Math.floor((today - new Date(d.earliestDate).getTime()) / (1000 * 3600 * 24));
      return {
        clientName: loan?.client?.full_name || 'Desconocido',
        phone: loan?.client?.phone || '',
        arrearsAmount: d.arrearsAmount,
        daysLate
      };
    }).sort((a, b) => b.arrearsAmount - a.arrearsAmount).slice(0, 10);
  }, [portfolioData]);

  // ─── EXPORTS ───
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    try {
      toast.loading('Generando PDF...', { id: 'pdf' });
      let blob;
      let filename = '';
      if (activeTab === 'RESUMEN') {
        blob = await pdf(<PeriodReportPdf dateRange={dateRangeStr} routeName={getRouteName()} stats={{ totalRecaudo, totalGastos, totalPrestado, gananciaProyectada }} dailyRecaudoData={dailyRecaudoData} expensesByCategory={expensesByCategory} />).toBlob();
        filename = `Resumen_${getRouteName()}_${startDate}_${endDate}.pdf`;
      } else if (activeTab === 'CARTERA') {
        blob = await pdf(<PortfolioReportPdf routeName={getRouteName()} stats={portfolioStats} arrearsByRange={arrearsByRange} topDefaulters={topDefaulters} />).toBlob();
        filename = `Cartera_${getRouteName()}.pdf`;
      } else {
        blob = await pdf(<LedgerReportPdf dateRange={dateRangeStr} routeName={getRouteName()} transactions={ledgerData} />).toBlob();
        filename = `LibroAuxiliar_${getRouteName()}_${startDate}_${endDate}.pdf`;
      }
      downloadBlob(blob, filename);
      toast.success('PDF generado exitosamente', { id: 'pdf' });
    } catch (error) {
      toast.error('Error al generar PDF', { id: 'pdf' });
    }
  };

  const exportExcel = () => {
    try {
      if (activeTab === 'RESUMEN') {
        downloadExcel([
          { sheetName: 'Resumen Financiero', data: [
            { Concepto: 'Recaudo Total', Monto: totalRecaudo },
            { Concepto: 'Gastos Operativos', Monto: totalGastos },
            { Concepto: 'Préstamos Entregados', Monto: totalPrestado },
            { Concepto: 'Flujo Neto', Monto: totalRecaudo - totalGastos - totalPrestado },
            { Concepto: 'Utilidad Proyectada', Monto: gananciaProyectada },
          ]},
          { sheetName: 'Gastos por Categoría', data: expensesByCategory.map(e => ({ Categoría: e.name, Monto: e.value })) },
          { sheetName: 'Recaudo Diario', data: dailyRecaudoData.map(d => ({ Fecha: d.displayDate, Monto: d.amount })) }
        ], `Resumen_${getRouteName()}_${startDate}_${endDate}`);
      } else if (activeTab === 'CARTERA') {
        downloadExcel([
          { sheetName: 'Resumen Cartera', data: [
            { Indicador: 'Capital Colocado', Valor: portfolioStats.capitalColocado },
            { Indicador: 'Capital Recuperado', Valor: portfolioStats.capitalRecuperado },
            { Indicador: 'Cartera Activa', Valor: portfolioStats.carteraActiva },
            { Indicador: 'Cartera Vencida', Valor: portfolioStats.carteraVencida },
          ]},
          { sheetName: 'Mora por Rangos', data: arrearsByRange.map(r => ({ Rango: r.range, Prestamos: r.count, Monto: r.amount })) },
          { sheetName: 'Top Morosos', data: topDefaulters.map(d => ({ Cliente: d.clientName, Telefono: d.phone, DiasAtraso: d.daysLate, SaldoMora: d.arrearsAmount })) }
        ], `Cartera_${getRouteName()}`);
      } else {
        let runningBalance = 0;
        const data = ledgerData.map(t => {
          runningBalance += t.amount;
          return {
            Fecha: format(new Date(t.date), 'yyyy-MM-dd HH:mm'),
            Tipo: t.type,
            Descripcion: t.description,
            Observacion: t.observation || '',
            Valor: t.amount,
            SaldoAcumulado: runningBalance
          };
        });
        downloadExcel([{ sheetName: 'Transacciones', data }], `LibroAuxiliar_${getRouteName()}_${startDate}_${endDate}`);
      }
      toast.success('Excel generado exitosamente');
    } catch (error) {
      toast.error('Error al generar Excel');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      
      {/* Header & Filters */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
              <BarChart3 className="w-6 h-6" />
            </div>
            Reportes Financieros
          </h1>
          <p className="text-slate-500 mt-1 ml-12 text-sm">Analiza el rendimiento general y tendencias.</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium outline-none focus:border-brand-500"
            />
            <span className="text-slate-400">-</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium outline-none focus:border-brand-500"
            />
          </div>
          
          <div className="h-6 w-px bg-slate-300 hidden sm:block"></div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedRoute}
              onChange={(e) => setSelectedRoute(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium outline-none focus:border-brand-500 min-w-[150px]"
            >
              <option value="all">Todas las rutas</option>
              {routeStates.map(r => (
                <option key={r.id} value={r.id}>{r.ruta}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabs & Export Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-slate-200 pb-4">
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('RESUMEN')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'RESUMEN' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Resumen Período
          </button>
          <button
            onClick={() => setActiveTab('CARTERA')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'CARTERA' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Estado Cartera
          </button>
          <button
            onClick={() => setActiveTab('LIBRO_AUXILIAR')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'LIBRO_AUXILIAR' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Libro Auxiliar
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={exportPdf}
            className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg font-bold text-sm transition-colors"
          >
            <FileDown className="w-4 h-4" />
            Exportar PDF
          </button>
          <button
            onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg font-bold text-sm transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar Excel
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
        </div>
      ) : (
        <>
          {activeTab === 'RESUMEN' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group hover:border-emerald-200 transition-colors">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-50 rounded-full blur-2xl group-hover:bg-emerald-100 transition-colors"></div>
                  <div className="flex items-center gap-2 text-emerald-600 font-bold mb-4 relative z-10">
                    <div className="p-2 bg-emerald-100 rounded-lg"><Download className="w-5 h-5" /></div>
                    Recaudo Total
                  </div>
                  <div className="text-3xl font-black text-slate-800 relative z-10">{formatCurrency(totalRecaudo)}</div>
                  <p className="text-xs text-slate-400 mt-2 relative z-10">En el período seleccionado</p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group hover:border-red-200 transition-colors">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-red-50 rounded-full blur-2xl group-hover:bg-red-100 transition-colors"></div>
                  <div className="flex items-center gap-2 text-red-600 font-bold mb-4 relative z-10">
                    <div className="p-2 bg-red-100 rounded-lg"><TrendingDown className="w-5 h-5" /></div>
                    Gastos Totales
                  </div>
                  <div className="text-3xl font-black text-slate-800 relative z-10">{formatCurrency(totalGastos)}</div>
                  <p className="text-xs text-slate-400 mt-2 relative z-10">En el período seleccionado</p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group hover:border-blue-200 transition-colors">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-50 rounded-full blur-2xl group-hover:bg-blue-100 transition-colors"></div>
                  <div className="flex items-center gap-2 text-blue-600 font-bold mb-4 relative z-10">
                    <div className="p-2 bg-blue-100 rounded-lg"><DollarSign className="w-5 h-5" /></div>
                    Préstamos (Capital)
                  </div>
                  <div className="text-3xl font-black text-slate-800 relative z-10">{formatCurrency(totalPrestado)}</div>
                  <p className="text-xs text-slate-400 mt-2 relative z-10">{data.loans.length} nuevos préstamos</p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group hover:border-brand-200 transition-colors">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-brand-50 rounded-full blur-2xl group-hover:bg-brand-100 transition-colors"></div>
                  <div className="flex items-center gap-2 text-brand-600 font-bold mb-4 relative z-10">
                    <div className="p-2 bg-brand-100 rounded-lg"><Activity className="w-5 h-5" /></div>
                    Interés Proyectado
                  </div>
                  <div className="text-3xl font-black text-slate-800 relative z-10">{formatCurrency(gananciaProyectada)}</div>
                  <p className="text-xs text-slate-400 mt-2 relative z-10">Ganancia esperada</p>
                </div>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-6">Tendencia de Recaudo</h3>
                  <div className="h-[300px] w-full">
                    {dailyRecaudoData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dailyRecaudoData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(val) => `$${(val / 1000000).toFixed(1)}M`} />
                          <RechartsTooltip formatter={(value) => [formatCurrency(Number(value)), 'Recaudo']} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                          <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-400">No hay datos de recaudo para este período.</div>
                    )}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col">
                  <h3 className="text-lg font-bold text-slate-800 mb-2">Distribución de Gastos</h3>
                  <div className="flex-1 min-h-[250px]">
                    {expensesByCategory.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={expensesByCategory} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                            {expensesByCategory.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                          </Pie>
                          <RechartsTooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                          <Legend verticalAlign="bottom" height={36} iconType="circle" />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-400">No hay gastos en este período.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary table */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-6">Flujo de Caja del Período</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-3 px-4 font-semibold text-slate-500">Concepto</th>
                        <th className="text-right py-3 px-4 font-semibold text-slate-500">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      <tr className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium">Recaudo Total</td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-600">{formatCurrency(totalRecaudo)}</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium">Gastos Operativos</td>
                        <td className="py-3 px-4 text-right font-bold text-red-600">- {formatCurrency(totalGastos)}</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium">Préstamos Nuevos (Capital)</td>
                        <td className="py-3 px-4 text-right font-bold text-blue-600">- {formatCurrency(totalPrestado)}</td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td className="py-4 px-4 font-black text-slate-800">Flujo Neto del Período</td>
                        <td className={`py-4 px-4 text-right font-black text-lg ${(totalRecaudo - totalGastos - totalPrestado) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatCurrency(totalRecaudo - totalGastos - totalPrestado)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'CARTERA' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                  <div className="text-slate-500 font-bold mb-2">Capital Colocado</div>
                  <div className="text-3xl font-black text-slate-800">{formatCurrency(portfolioStats.capitalColocado)}</div>
                  <p className="text-xs text-slate-400 mt-2">Préstamos activos</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                  <div className="text-emerald-600 font-bold mb-2">Capital Recuperado</div>
                  <div className="text-3xl font-black text-slate-800">{formatCurrency(portfolioStats.capitalRecuperado)}</div>
                  <p className="text-xs text-slate-400 mt-2">Pagos realizados a capital</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-blue-200 bg-blue-50 shadow-sm relative overflow-hidden group">
                  <div className="text-blue-700 font-bold mb-2">Cartera Activa (Saldo)</div>
                  <div className="text-3xl font-black text-blue-900">{formatCurrency(portfolioStats.carteraActiva)}</div>
                  <p className="text-xs text-blue-600 mt-2">Dinero en la calle por cobrar</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-red-200 bg-red-50 shadow-sm relative overflow-hidden group">
                  <div className="text-red-700 font-bold mb-2">Cartera Vencida (Mora)</div>
                  <div className="text-3xl font-black text-red-900">{formatCurrency(portfolioStats.carteraVencida)}</div>
                  <p className="text-xs text-red-600 mt-2">Saldo en cuotas atrasadas</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-6">Mora por Rangos</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-2 text-slate-500">Rango</th>
                        <th className="text-center py-2 text-slate-500">Préstamos</th>
                        <th className="text-right py-2 text-slate-500">Saldo en Mora</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {arrearsByRange.map((r, i) => (
                        <tr key={i}>
                          <td className="py-3 font-medium">{r.range}</td>
                          <td className="py-3 text-center">{r.count}</td>
                          <td className="py-3 text-right font-bold text-red-600">{formatCurrency(r.amount)}</td>
                        </tr>
                      ))}
                      {arrearsByRange.length === 0 && (
                        <tr><td colSpan={3} className="py-4 text-center text-slate-400">No hay cartera en mora</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-6">Top Morosos</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-2 text-slate-500">Cliente</th>
                        <th className="text-center py-2 text-slate-500">Días</th>
                        <th className="text-right py-2 text-slate-500">Saldo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {topDefaulters.map((c, i) => (
                        <tr key={i}>
                          <td className="py-3">
                            <div className="font-medium text-slate-800">{c.clientName}</div>
                            <div className="text-xs text-slate-400">{c.phone}</div>
                          </td>
                          <td className="py-3 text-center">
                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">{c.daysLate}</span>
                          </td>
                          <td className="py-3 text-right font-bold text-red-600">{formatCurrency(c.arrearsAmount)}</td>
                        </tr>
                      ))}
                      {topDefaulters.length === 0 && (
                        <tr><td colSpan={3} className="py-4 text-center text-slate-400">No hay clientes morosos</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'LIBRO_AUXILIAR' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm animate-in fade-in duration-300">
              <h3 className="text-lg font-bold text-slate-800 mb-6">Libro Auxiliar de Transacciones</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-3 px-4 font-semibold text-slate-500">Fecha</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-500">Tipo</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-500">Descripción</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-500">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {ledgerData.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{format(new Date(t.date), 'dd MMM yyyy, HH:mm')}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                            t.type === 'INGRESO' ? 'bg-emerald-100 text-emerald-700' : 
                            t.type === 'DESEMBOLSO' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {t.type}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-800">{t.description}</p>
                          {t.observation && <p className="text-xs text-slate-500 mt-1">{t.observation}</p>}
                        </td>
                        <td className={`py-3 px-4 text-right font-bold ${t.amount > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                          {formatCurrency(t.amount)}
                        </td>
                      </tr>
                    ))}
                    {ledgerData.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400">No hay transacciones en este período</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
