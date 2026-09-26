import React, { useState } from 'react';
import { X, FileSpreadsheet, Download, Upload, CheckCircle2, AlertCircle, RefreshCw, ArrowRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { AdminService } from '@/services/AdminService';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

interface ExcelMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  routeStates: { id: string; ruta: string }[];
  onSuccess: () => void;
}

interface ParsedRow {
  rowNum: number;
  fullName: string;
  documentId: string;
  phone: string;
  address: string;
  amountRequested: number;
  interestRate: number;
  termDays: number;
  sundaysCount: number;
  receiptFee: number;
  disbursementDate: string;
  paidQuotasCount: number;
  observation: string;
  isValid: boolean;
  errorMsg: string;
}

export function downloadExcelMigrationTemplate() {
  const sampleData = [
    {
      "nombre_cliente": "Carlos Pérez",
      "cedula": "1098765432",
      "telefono": "3001234567",
      "direccion": "Calle 10 # 5-20",
      "monto_prestado": 1000000,
      "tasa_interes": 20,
      "plazo_dias": 40,
      "domingos_descuento": 0,
      "valor_boleta": 0,
      "fecha_desembolso": "2026-08-01",
      "cuotas_pagadas": 10,
      "observacion": "Cliente migrado"
    },
    {
      "nombre_cliente": "María Gómez",
      "cedula": "1087654321",
      "telefono": "3109876543",
      "direccion": "Carrera 4 # 12-30",
      "monto_prestado": 500000,
      "tasa_interes": 20,
      "plazo_dias": 40,
      "domingos_descuento": 0,
      "valor_boleta": 0,
      "fecha_desembolso": "2026-08-10",
      "cuotas_pagadas": 5,
      "observacion": "Cliente migrado"
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Migracion_Ruta");
  XLSX.writeFile(wb, "Plantilla_Migracion_Ruta.xlsx");
}

export function ExcelMigrationModal({ isOpen, onClose, routeStates, onSuccess }: ExcelMigrationModalProps) {
  const user = useAuthStore(state => state.user);

  const [routeId, setRouteId] = useState<string>('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);

  if (!isOpen) return null;

  const validRows = rows.filter(r => r.isValid);
  const invalidRows = rows.filter(r => !r.isValid);

  const totalCapital = validRows.reduce((sum, r) => sum + r.amountRequested, 0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

        if (!data || data.length === 0) {
          toast.error("El archivo Excel está vacío.");
          return;
        }

        const parsedRows: ParsedRow[] = data.map((row, idx) => {
          const getVal = (keys: string[]) => {
            for (const key of Object.keys(row)) {
              const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
              if (keys.some(k => cleanKey.includes(k))) {
                return row[key];
              }
            }
            return "";
          };

          const fullName = String(getVal(['nombre', 'cliente', 'name']) || "").trim();
          const documentId = String(getVal(['cedula', 'documento', 'id']) || "").trim();
          const phone = String(getVal(['telefono', 'celular', 'phone']) || "").trim();
          const address = String(getVal(['direccion', 'address']) || "").trim();
          
          const rawAmount = getVal(['monto', 'valor', 'prestamo', 'amount']);
          const amountRequested = typeof rawAmount === 'number' ? rawAmount : parseFloat(String(rawAmount).replace(/\D/g, '')) || 0;
          
          const rawRate = getVal(['tasa', 'interes', 'rate']);
          let interestRate = typeof rawRate === 'number' ? rawRate : parseFloat(String(rawRate)) || 20;
          if (interestRate > 1) interestRate = interestRate / 100;
          if (interestRate <= 0) interestRate = 0.20;

          const rawTerm = getVal(['plazo', 'dias', 'term']);
          const termDays = typeof rawTerm === 'number' ? rawTerm : parseInt(String(rawTerm).replace(/\D/g, '')) || 40;

          const rawSundays = getVal(['domingo', 'sundays']);
          const sundaysCount = typeof rawSundays === 'number' ? rawSundays : parseInt(String(rawSundays).replace(/\D/g, '')) || 0;

          const rawReceipt = getVal(['boleta', 'fee']);
          const receiptFee = typeof rawReceipt === 'number' ? rawReceipt : parseFloat(String(rawReceipt).replace(/\D/g, '')) || 0;

          let rawDate = getVal(['fecha', 'desembolso', 'date']);
          let disbursementDate = "";
          
          if (typeof rawDate === 'number') {
            const jsDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
            disbursementDate = jsDate.toISOString().split('T')[0];
          } else if (typeof rawDate === 'string' && rawDate.trim()) {
            const str = rawDate.trim();
            if (str.includes('/')) {
              const parts = str.split('/');
              if (parts.length === 3) {
                if (parts[0].length === 4) {
                  disbursementDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                } else {
                  disbursementDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
              }
            } else if (str.includes('-')) {
              disbursementDate = str;
            }
          }

          if (!disbursementDate) {
            disbursementDate = new Date().toISOString().split('T')[0];
          }

          const rawQuotas = getVal(['cuotas', 'pagadas', 'paid']);
          const paidQuotasCount = typeof rawQuotas === 'number' ? rawQuotas : parseInt(String(rawQuotas).replace(/\D/g, '')) || 0;

          const observation = String(getVal(['observacion', 'nota', 'obs']) || "Migración Excel").trim();

          const errors: string[] = [];
          if (!fullName) errors.push("Nombre requerido");
          if (!documentId) errors.push("Cédula requerida");
          if (amountRequested <= 0) errors.push("Monto inválido");

          return {
            rowNum: idx + 2,
            fullName,
            documentId,
            phone,
            address,
            amountRequested,
            interestRate,
            termDays,
            sundaysCount,
            receiptFee,
            disbursementDate,
            paidQuotasCount,
            observation,
            isValid: errors.length === 0,
            errorMsg: errors.join(", ")
          };
        });

        setRows(parsedRows);
        toast.success(`Se cargaron ${parsedRows.length} filas del archivo.`);
      } catch (err: any) {
        toast.error("Error al leer el archivo Excel: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const addDays = (date: Date, days: number) => {
    const res = new Date(date);
    res.setDate(res.getDate() + days);
    return res;
  };

  const handleStartImport = async () => {
    if (!user) return;
    if (!routeId) return toast.error("Selecciona la ruta de destino");
    if (validRows.length === 0) return toast.error("No hay filas válidas para importar");

    setIsProcessing(true);
    setProgressIndex(0);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      setProgressIndex(i + 1);

      try {
        // Generate historical payments array
        const historicalPayments = [];
        if (row.paidQuotasCount > 0) {
          const parts = row.disbursementDate.split('-').map(Number);
          const baseDate = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date();
          const obligation = row.amountRequested * (1 + row.interestRate);
          const dailyQuota = Math.round(row.termDays > 0 ? obligation / row.termDays : 0);

          let sundaysCount = 0;
          let dayOffset = 1;

          while (historicalPayments.length < row.paidQuotasCount && dayOffset <= 365) {
            const current = addDays(baseDate, dayOffset);
            const isSun = current.getDay() === 0;

            if (isSun && sundaysCount < row.sundaysCount) {
              sundaysCount++;
              dayOffset++;
              continue;
            }

            const dateStr = current.toISOString().split('T')[0];
            historicalPayments.push({
              amount: dailyQuota,
              paymentDate: dateStr,
              observation: `Cuota ${historicalPayments.length + 1} (Migración Excel)`
            });

            dayOffset++;
          }
        }

        await AdminService.createAdminLoan({
          clientId: null,
          clientData: {
            full_name: row.fullName,
            document_id: row.documentId,
            phone: row.phone || '',
            address: row.address || ''
          },
          routeId,
          adminId: user.id,
          amountRequested: row.amountRequested,
          interestRate: row.interestRate,
          termDays: row.termDays,
          sundaysPrepaidCount: row.sundaysCount,
          receiptFee: row.receiptFee,
          wantsRaffle: false,
          disbursementDate: row.disbursementDate,
          historicalPayments
        });

        successCount++;
      } catch (err: any) {
        console.error(`Error importando fila ${row.rowNum}:`, err);
        failCount++;
      }
    }

    setIsProcessing(false);
    toast.success(`Migración completada: ${successCount} clientes creados (${failCount} fallidos).`);
    onSuccess();
    onClose();
    setRows([]);
    setRouteId('');
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Migración Masiva de Ruta (Excel)</h3>
              <p className="text-xs font-medium text-slate-500">Carga la lista de clientes con sus préstamos y cuotas pasadas</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Step 1 & 2 controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Route Selector & Template Download */}
            <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  1. Ruta de Destino *
                </label>
                <select
                  required
                  value={routeId}
                  onChange={e => setRouteId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">Selecciona la ruta para migrar</option>
                  {routeStates.map(r => (
                    <option key={r.id} value={r.id}>{r.ruta}</option>
                  ))}
                </select>
              </div>

              <div className="pt-2 border-t border-slate-200">
                <p className="text-xs text-slate-600 mb-2">
                  Descarga la plantilla con el formato exacto para llenar en Excel:
                </p>
                <button
                  type="button"
                  onClick={downloadExcelMigrationTemplate}
                  className="w-full py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <Download className="w-4 h-4 text-emerald-600" />
                  Descargar Plantilla (.xlsx)
                </button>
              </div>
            </div>

            {/* File Upload Box */}
            <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-emerald-900 mb-2">
                  2. Cargar Archivo Excel (.xlsx)
                </label>
                <p className="text-xs text-emerald-700 mb-4">
                  Selecciona el archivo con la lista de clientes llenada.
                </p>
              </div>

              <div className="relative">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="excel-upload-input"
                />
                <label
                  htmlFor="excel-upload-input"
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 active:scale-[0.98]"
                >
                  <Upload className="w-4 h-4" />
                  Seleccionar Archivo Excel
                </label>
              </div>
            </div>

          </div>

          {/* Rows Preview Table */}
          {rows.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-4 text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                    <CheckCircle2 className="w-4 h-4" />
                    {validRows.length} Válidas
                  </span>
                  {invalidRows.length > 0 && (
                    <span className="flex items-center gap-1.5 text-red-700 bg-red-100 px-3 py-1 rounded-full">
                      <AlertCircle className="w-4 h-4" />
                      {invalidRows.length} Errores
                    </span>
                  )}
                </div>
                <div className="text-xs font-bold text-slate-700">
                  Total Capital: <span className="text-emerald-700 text-sm font-black">{formatCurrency(totalCapital)}</span>
                </div>
              </div>

              {/* Table */}
              <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3">Cliente</th>
                      <th className="p-3">Cédula</th>
                      <th className="p-3">Monto</th>
                      <th className="p-3">Desembolso</th>
                      <th className="p-3">Cuotas Pagadas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r, i) => (
                      <tr key={i} className={r.isValid ? "hover:bg-slate-50" : "bg-red-50/60"}>
                        <td className="p-3 font-semibold text-slate-500">{r.rowNum}</td>
                        <td className="p-3">
                          {r.isValid ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Ok
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600 font-bold" title={r.errorMsg}>
                              <AlertCircle className="w-3.5 h-3.5" /> {r.errorMsg}
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-bold text-slate-800">{r.fullName || "—"}</td>
                        <td className="p-3 text-slate-600 font-mono">{r.documentId || "—"}</td>
                        <td className="p-3 font-bold text-slate-900">{formatCurrency(r.amountRequested)}</td>
                        <td className="p-3 text-slate-600">{r.disbursementDate}</td>
                        <td className="p-3 font-bold text-amber-700">{r.paidQuotasCount} cuotas</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-white shrink-0 space-y-3">
          {isProcessing && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-emerald-800">
                <span>Migrando clientes...</span>
                <span>{progressIndex} / {validRows.length}</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300"
                  style={{ width: `${(progressIndex / validRows.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleStartImport}
            disabled={isProcessing || validRows.length === 0 || !routeId}
            className={`w-full py-3.5 rounded-xl text-white font-bold text-base shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
              isProcessing || validRows.length === 0 || !routeId
                ? 'bg-slate-300 shadow-none cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/30'
            }`}
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Importando Ruta... ({progressIndex}/{validRows.length})
              </>
            ) : (
              <>
                <ArrowRight className="w-5 h-5" />
                Importar {validRows.length} Clientes a la Ruta
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
