import { View, Text } from '@react-pdf/renderer';
import { PdfLayout, pdfStyles, pdfColors } from '../PdfLayout';
import { formatCurrency } from '../formatters';

interface PeriodReportPdfProps {
  dateRange: string;
  routeName: string;
  stats: {
    totalRecaudo: number;
    totalGastos: number;
    totalPrestado: number;
    gananciaProyectada: number;
  };
  dailyRecaudoData: { displayDate: string; amount: number }[];
  expensesByCategory: { name: string; value: number }[];
}

export function PeriodReportPdf({ dateRange, routeName, stats, dailyRecaudoData, expensesByCategory }: PeriodReportPdfProps) {
  const flujoNeto = stats.totalRecaudo - stats.totalGastos - stats.totalPrestado;

  return (
    <PdfLayout 
      title="Resumen de Recaudo y Gastos" 
      subtitle={`Ruta: ${routeName}`}
      dateRange={dateRange}
    >
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Resumen Financiero del Período</Text>
        <View style={pdfStyles.table}>
          <View style={[pdfStyles.tableRow, pdfStyles.tableHeader]}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>Concepto</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={pdfStyles.textRight}>Monto</Text></View>
          </View>
          
          <View style={pdfStyles.tableRow}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>Recaudo Total</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textEmerald, pdfStyles.textBold]}>{formatCurrency(stats.totalRecaudo)}</Text></View>
          </View>
          
          <View style={pdfStyles.tableRow}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>Gastos Operativos</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textRed, pdfStyles.textBold]}>{formatCurrency(stats.totalGastos)}</Text></View>
          </View>
          
          <View style={pdfStyles.tableRow}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>Préstamos (Capital Entregado)</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textBlue, pdfStyles.textBold]}>{formatCurrency(stats.totalPrestado)}</Text></View>
          </View>
          
          <View style={[pdfStyles.tableRow, { backgroundColor: pdfColors.slate50 }]}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={pdfStyles.textBold}>Flujo Neto del Período</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textBold, flujoNeto >= 0 ? pdfStyles.textEmerald : pdfStyles.textRed]}>{formatCurrency(flujoNeto)}</Text></View>
          </View>

          <View style={pdfStyles.tableRow}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>Utilidad Proyectada (Intereses)</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, { color: pdfColors.brand }, pdfStyles.textBold]}>{formatCurrency(stats.gananciaProyectada)}</Text></View>
          </View>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Desglose de Gastos por Categoría</Text>
        <View style={pdfStyles.table}>
          <View style={[pdfStyles.tableRow, pdfStyles.tableHeader]}>
            <View style={[pdfStyles.tableCol, { width: '70%' }]}><Text>Categoría</Text></View>
            <View style={[pdfStyles.tableCol, { width: '30%' }]}><Text style={pdfStyles.textRight}>Monto</Text></View>
          </View>
          {expensesByCategory.map((exp, i) => (
            <View style={pdfStyles.tableRow} key={i}>
              <View style={[pdfStyles.tableCol, { width: '70%' }]}><Text>{exp.name}</Text></View>
              <View style={[pdfStyles.tableCol, { width: '30%' }]}><Text style={pdfStyles.textRight}>{formatCurrency(exp.value)}</Text></View>
            </View>
          ))}
          {expensesByCategory.length === 0 && (
            <View style={pdfStyles.tableRow}>
              <View style={[pdfStyles.tableCol, { width: '100%' }]}><Text style={pdfStyles.textCenter}>No hay gastos registrados en el período</Text></View>
            </View>
          )}
        </View>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Recaudo Diario (Consolidado)</Text>
        <View style={pdfStyles.table}>
          <View style={[pdfStyles.tableRow, pdfStyles.tableHeader]}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>Fecha</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={pdfStyles.textRight}>Monto</Text></View>
          </View>
          {dailyRecaudoData.map((day, i) => (
            <View style={pdfStyles.tableRow} key={i}>
              <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>{day.displayDate}</Text></View>
              <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={pdfStyles.textRight}>{formatCurrency(day.amount)}</Text></View>
            </View>
          ))}
          {dailyRecaudoData.length === 0 && (
            <View style={pdfStyles.tableRow}>
              <View style={[pdfStyles.tableCol, { width: '100%' }]}><Text style={pdfStyles.textCenter}>No hay recaudos registrados en el período</Text></View>
            </View>
          )}
        </View>
      </View>
    </PdfLayout>
  );
}
