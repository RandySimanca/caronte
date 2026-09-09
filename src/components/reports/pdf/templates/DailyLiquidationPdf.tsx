import { View, Text } from '@react-pdf/renderer';
import { PdfLayout, pdfStyles, pdfColors } from '../PdfLayout';
import { formatCurrency } from '../formatters';

interface DailyLiquidationPdfProps {
  dateStr: string;
  routeName: string;
  collectorName: string;
  detail: {
    totalCobrado: number;
    totalGastos: number;
    viaticoDia: number;
    prestamosNuevos: number;
    totalPrestado: number;
    totalEntregar: number;
    detalleGastos: { amount: number; category: { name: string } }[];
  };
  baseAmount: number;
}

export function DailyLiquidationPdf({ dateStr, routeName, collectorName, detail, baseAmount }: DailyLiquidationPdfProps) {
  const totalEsperadoFinal = detail.totalEntregar + baseAmount;

  return (
    <PdfLayout 
      title="Liquidación Diaria de Ruta" 
      subtitle={`Ruta: ${routeName} | Cobrador: ${collectorName}`}
      dateRange={dateStr}
    >
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Resumen de Liquidación</Text>
        <View style={pdfStyles.table}>
          <View style={[pdfStyles.tableRow, pdfStyles.tableHeader]}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>Concepto</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={pdfStyles.textRight}>Valor</Text></View>
          </View>
          
          <View style={pdfStyles.tableRow}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>(+) Base Inicial Entregada</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight]}>{formatCurrency(baseAmount)}</Text></View>
          </View>

          <View style={pdfStyles.tableRow}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>(+) Total Recaudado</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textEmerald]}>{formatCurrency(detail.totalCobrado)}</Text></View>
          </View>
          
          <View style={pdfStyles.tableRow}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>(-) Gastos Operativos</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textRed]}>- {formatCurrency(detail.totalGastos)}</Text></View>
          </View>
          
          <View style={pdfStyles.tableRow}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>(-) Viático Asignado</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textRed]}>- {formatCurrency(detail.viaticoDia)}</Text></View>
          </View>

          <View style={pdfStyles.tableRow}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>(-) Préstamos Nuevos ({detail.prestamosNuevos})</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textBlue]}>- {formatCurrency(detail.totalPrestado)}</Text></View>
          </View>
          
          <View style={[pdfStyles.tableRow, { backgroundColor: pdfColors.slate50 }]}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={pdfStyles.textBold}>TOTAL ESPERADO A ENTREGAR</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}>
              <Text style={[pdfStyles.textRight, pdfStyles.textBold, totalEsperadoFinal >= 0 ? pdfStyles.textEmerald : pdfStyles.textRed]}>
                {formatCurrency(totalEsperadoFinal)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Detalle de Gastos Operativos</Text>
        <View style={pdfStyles.table}>
          <View style={[pdfStyles.tableRow, pdfStyles.tableHeader]}>
            <View style={[pdfStyles.tableCol, { width: '70%' }]}><Text>Categoría</Text></View>
            <View style={[pdfStyles.tableCol, { width: '30%' }]}><Text style={pdfStyles.textRight}>Valor</Text></View>
          </View>
          
          {detail.detalleGastos.map((gasto, i) => (
            <View style={pdfStyles.tableRow} key={i}>
              <View style={[pdfStyles.tableCol, { width: '70%' }]}><Text>{gasto.category?.name || 'Otros'}</Text></View>
              <View style={[pdfStyles.tableCol, { width: '30%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textRed]}>{formatCurrency(gasto.amount)}</Text></View>
            </View>
          ))}
          
          {detail.detalleGastos.length === 0 && (
            <View style={pdfStyles.tableRow}>
              <View style={[pdfStyles.tableCol, { width: '100%' }]}><Text style={pdfStyles.textCenter}>No se registraron gastos en este día.</Text></View>
            </View>
          )}
        </View>
      </View>
    </PdfLayout>
  );
}
