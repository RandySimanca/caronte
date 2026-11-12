import { View, Text } from '@react-pdf/renderer';
import { PdfLayout, pdfStyles, pdfColors } from '../PdfLayout';
import { formatCurrency, formatDate } from '../formatters';

interface LedgerReportPdfProps {
  dateRange: string;
  routeName: string;
  transactions: {
    id: string;
    date: string;
    type: 'GASTO' | 'INGRESO' | 'DESEMBOLSO';
    description: string;
    amount: number;
    observation?: string;
  }[];
  baseByDay?: {
    date: string;
    baseAmount: number;
    routeName: string;
  }[];
}

export function LedgerReportPdf({ dateRange, routeName, transactions, baseByDay = [] }: LedgerReportPdfProps) {
  // Calculate running balance for the period
  let runningBalance = 0;
  const dataWithBalance = transactions.map(t => {
    runningBalance += t.amount;
    return { ...t, runningBalance };
  });

  // Totales por tipo de transaccion
  const totalRecaudos = transactions
    .filter(t => t.type === 'INGRESO')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalDesembolsos = transactions
    .filter(t => t.type === 'DESEMBOLSO')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalGastos = transactions
    .filter(t => t.type === 'GASTO')
    .reduce((sum, t) => sum + t.amount, 0);

  // Base recibida total (suma de base_amount de todos los cierres del período)
  const totalBase = baseByDay.reduce((sum, d) => sum + d.baseAmount, 0);
  const isSingleDay = baseByDay.length === 1;

  return (
    <PdfLayout
      title="Libro Auxiliar de Transacciones"
      subtitle={`Ruta: ${routeName}`}
      dateRange={dateRange}
      orientation="landscape"
    >
      <View style={pdfStyles.section}>
        <View style={pdfStyles.table}>
          <View style={[pdfStyles.tableRow, pdfStyles.tableHeader]}>
            <View style={[pdfStyles.tableCol, { width: '15%' }]}><Text>Fecha</Text></View>
            <View style={[pdfStyles.tableCol, { width: '12%' }]}><Text>Tipo</Text></View>
            <View style={[pdfStyles.tableCol, { width: '38%' }]}><Text>Descripción / Observación</Text></View>
            <View style={[pdfStyles.tableCol, { width: '15%' }]}><Text style={pdfStyles.textRight}>Valor</Text></View>
            <View style={[pdfStyles.tableCol, { width: '20%' }]}><Text style={pdfStyles.textRight}>Saldo Acumulado</Text></View>
          </View>

          {dataWithBalance.map((t) => (
            <View style={pdfStyles.tableRow} key={t.id}>
              <View style={[pdfStyles.tableCol, { width: '15%' }]}>
                <Text>{formatDate(t.date, 'dd/MM/yyyy HH:mm')}</Text>
              </View>
              <View style={[pdfStyles.tableCol, { width: '12%' }]}>
                <Text style={
                  t.type === 'INGRESO' ? pdfStyles.textEmerald :
                    t.type === 'DESEMBOLSO' ? pdfStyles.textBlue : pdfStyles.textRed
                }>
                  {t.type}
                </Text>
              </View>
              <View style={[pdfStyles.tableCol, { width: '38%' }]}>
                <Text>{t.description}</Text>
                {t.observation ? <Text style={pdfStyles.subtitle}>{t.observation}</Text> : null}
              </View>
              <View style={[pdfStyles.tableCol, { width: '15%' }]}>
                <Text style={[pdfStyles.textRight, t.amount > 0 ? pdfStyles.textEmerald : pdfStyles.textRed]}>
                  {formatCurrency(t.amount)}
                </Text>
              </View>
              <View style={[pdfStyles.tableCol, { width: '20%' }]}>
                <Text style={[pdfStyles.textRight, pdfStyles.textBold]}>
                  {formatCurrency(t.runningBalance)}
                </Text>
              </View>
            </View>
          ))}

          {dataWithBalance.length === 0 && (
            <View style={pdfStyles.tableRow}>
              <View style={[pdfStyles.tableCol, { width: '100%' }]}><Text style={pdfStyles.textCenter}>No hay transacciones registradas en este período</Text></View>
            </View>
          )}
        </View>
      </View>

      {/* Totals summary */}
      {transactions.length > 0 && (
        <View style={{ marginTop: 16, borderTopWidth: 2, borderTopColor: pdfColors.slate200, paddingTop: 10 }}>
          <Text style={[pdfStyles.sectionTitle, { marginBottom: 8 }]}>Resumen de Totales</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>

            {/* Recaudos */}
            <View style={{ flex: 1, borderWidth: 1, borderColor: '#059669', borderRadius: 4, padding: 10, backgroundColor: '#f0fdf4' }}>
              <Text style={[pdfStyles.subtitle, { marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }]}>Total Recaudos</Text>
              <Text style={[pdfStyles.textBold, { fontSize: 14, color: '#059669' }]}>{formatCurrency(totalRecaudos)}</Text>
              <Text style={[pdfStyles.subtitle, { marginTop: 4 }]}>
                {transactions.filter(t => t.type === 'INGRESO').length} transacción(es)
              </Text>
            </View>

            {/* Desembolsos */}
            <View style={{ flex: 1, borderWidth: 1, borderColor: '#2563eb', borderRadius: 4, padding: 10, backgroundColor: '#eff6ff' }}>
              <Text style={[pdfStyles.subtitle, { marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }]}>Total Desembolsos</Text>
              <Text style={[pdfStyles.textBold, { fontSize: 14, color: '#2563eb' }]}>{formatCurrency(totalDesembolsos)}</Text>
              <Text style={[pdfStyles.subtitle, { marginTop: 4 }]}>
                {transactions.filter(t => t.type === 'DESEMBOLSO').length} transacción(es)
              </Text>
            </View>

            {/* Gastos */}
            <View style={{ flex: 1, borderWidth: 1, borderColor: '#dc2626', borderRadius: 4, padding: 10, backgroundColor: '#fef2f2' }}>
              <Text style={[pdfStyles.subtitle, { marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }]}>Total Gastos</Text>
              <Text style={[pdfStyles.textBold, { fontSize: 14, color: '#dc2626' }]}>{formatCurrency(totalGastos)}</Text>
              <Text style={[pdfStyles.subtitle, { marginTop: 4 }]}>
                {transactions.filter(t => t.type === 'GASTO').length} transacción(es)
              </Text>
            </View>

            {/* Saldo neto */}
            <View style={{ flex: 1, borderWidth: 1, borderColor: pdfColors.slate500, borderRadius: 4, padding: 10, backgroundColor: pdfColors.slate50 }}>
              <Text style={[pdfStyles.subtitle, { marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }]}>Saldo Neto</Text>
              <Text style={[pdfStyles.textBold, { fontSize: 14, color: pdfColors.slate800 }]}>{formatCurrency(runningBalance)}</Text>
              <Text style={[pdfStyles.subtitle, { marginTop: 4 }]}>
                {transactions.length} transacción(es) total
              </Text>
            </View>

          </View>

          {/* Base recibida — solo si hay datos de cierres */}
          {totalBase > 0 && (
            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: pdfColors.slate200, paddingTop: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>

                {/* Tarjeta base total */}
                <View style={{ borderWidth: 1.5, borderColor: '#d97706', borderRadius: 4, padding: 10, backgroundColor: '#fffbeb', minWidth: 160 }}>
                  <Text style={[pdfStyles.subtitle, { marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1, color: '#92400e' }]}>
                    {isSingleDay ? 'Base Recibida del Día' : 'Base Total del Período'}
                  </Text>
                  <Text style={[pdfStyles.textBold, { fontSize: 16, color: '#b45309' }]}>{formatCurrency(totalBase)}</Text>
                  <Text style={[pdfStyles.subtitle, { marginTop: 4, color: '#78350f' }]}>
                    Dinero entregado al cobrador
                  </Text>
                </View>

                {/* Verificación: recaudos vs (base + saldo neto esperado) */}
                <View style={{ flex: 1, padding: 8, backgroundColor: pdfColors.slate50, borderRadius: 4, borderWidth: 1, borderColor: pdfColors.slate200 }}>
                  <Text style={[pdfStyles.textBold, { marginBottom: 6, fontSize: 10, color: pdfColors.slate800 }]}>Verificación de cuadre con el cierre</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={pdfStyles.subtitle}>Base recibida</Text>
                    <Text style={[pdfStyles.subtitle, pdfStyles.textBold]}>{formatCurrency(totalBase)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={pdfStyles.subtitle}>(+) Recaudos</Text>
                    <Text style={[pdfStyles.subtitle, { color: '#059669', fontWeight: 'bold' }]}>{formatCurrency(totalRecaudos)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={pdfStyles.subtitle}>(−) Desembolsos</Text>
                    <Text style={[pdfStyles.subtitle, { color: '#dc2626', fontWeight: 'bold' }]}>{formatCurrency(Math.abs(totalDesembolsos))}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={pdfStyles.subtitle}>(−) Gastos</Text>
                    <Text style={[pdfStyles.subtitle, { color: '#dc2626', fontWeight: 'bold' }]}>{formatCurrency(Math.abs(totalGastos))}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: pdfColors.slate200 }}>
                    <Text style={[pdfStyles.textBold, { fontSize: 10 }]}>Total a entregar al admin</Text>
                    <Text style={[pdfStyles.textBold, { fontSize: 11, color: pdfColors.slate800 }]}>
                      {formatCurrency(totalBase + totalRecaudos + totalDesembolsos + totalGastos)}
                    </Text>
                  </View>
                </View>

              </View>

              {/* Detalle por día si el período es multi-día */}
              {!isSingleDay && baseByDay.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={[pdfStyles.subtitle, { marginBottom: 4, fontWeight: 'bold' }]}>Detalle de base por día:</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {baseByDay.map((d) => (
                      <View key={d.date} style={{ borderWidth: 1, borderColor: '#d97706', borderRadius: 3, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#fffbeb' }}>
                        <Text style={[pdfStyles.subtitle, { color: '#78350f' }]}>
                          {formatDate(d.date, 'dd/MM/yyyy')}{d.routeName ? ` · ${d.routeName}` : ''}: <Text style={pdfStyles.textBold}>{formatCurrency(d.baseAmount)}</Text>
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </PdfLayout>
  );
}
