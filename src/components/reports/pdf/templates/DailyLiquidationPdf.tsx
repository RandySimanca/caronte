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
    totalTransferencias?: number;
    detalleGastos: { amount: number; category: { name: string } }[];
    detallePrestamos?: { cliente: string; monto: number }[];
  };
  baseAmount: number;
  /** 'snapshot' = respaldo guardado al aprobar; 'legacy' = recalculado sin respaldo; 'live' = día abierto */
  source?: 'live' | 'snapshot' | 'legacy';
  approvedAt?: string | null;
  /** Total aprobado guardado en el cierre (solo días liquidados) */
  approvedTotal?: number | null;
}

export function DailyLiquidationPdf({ dateStr, routeName, collectorName, detail, baseAmount, source = 'live', approvedAt = null, approvedTotal = null }: DailyLiquidationPdfProps) {
  const totalEsperadoFinal = detail.totalEntregar + baseAmount;
  const approvedAtLabel = approvedAt
    ? new Date(approvedAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
    : null;
  const statusNote =
    source === 'snapshot'
      ? `Liquidación aprobada${approvedAtLabel ? ` el ${approvedAtLabel}` : ''}. Valores tomados del respaldo guardado al aprobar.`
      : source === 'legacy'
        ? `Liquidación aprobada${approvedAtLabel ? ` el ${approvedAtLabel}` : ''} sin respaldo detallado: valores recalculados con los datos actuales.${
            approvedTotal != null && approvedTotal !== totalEsperadoFinal ? ` Total aprobado en su momento: ${formatCurrency(approvedTotal)}.` : ''
          }`
        : 'Borrador: la liquidación aún no ha sido aprobada.';

  return (
    <PdfLayout 
      title="Liquidación Diaria de Ruta" 
      subtitle={`Ruta: ${routeName} | Cobrador: ${collectorName}`}
      dateRange={dateStr}
    >
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Resumen de Liquidación</Text>
        <Text style={{ fontSize: 9, marginBottom: 6 }}>{statusNote}</Text>
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
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>(-) Cobros por Transferencia</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textRed]}>- {formatCurrency(detail.totalTransferencias || 0)}</Text></View>
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

      {(detail.detallePrestamos?.length ?? 0) > 0 && (
        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle}>Detalle de Préstamos Nuevos</Text>
          <View style={pdfStyles.table}>
            <View style={[pdfStyles.tableRow, pdfStyles.tableHeader]}>
              <View style={[pdfStyles.tableCol, { width: '70%' }]}><Text>Cliente</Text></View>
              <View style={[pdfStyles.tableCol, { width: '30%' }]}><Text style={pdfStyles.textRight}>Valor</Text></View>
            </View>
            {detail.detallePrestamos!.map((l, i) => (
              <View style={pdfStyles.tableRow} key={i}>
                <View style={[pdfStyles.tableCol, { width: '70%' }]}><Text>{l.cliente}</Text></View>
                <View style={[pdfStyles.tableCol, { width: '30%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textBlue]}>{formatCurrency(l.monto)}</Text></View>
              </View>
            ))}
          </View>
        </View>
      )}
    </PdfLayout>
  );
}
