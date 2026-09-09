import { View, Text } from '@react-pdf/renderer';
import { PdfLayout, pdfStyles } from '../PdfLayout';
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
}

export function LedgerReportPdf({ dateRange, routeName, transactions }: LedgerReportPdfProps) {
  // Calculate running balance for the period
  let runningBalance = 0;
  const dataWithBalance = transactions.map(t => {
    runningBalance += t.amount;
    return { ...t, runningBalance };
  });

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
    </PdfLayout>
  );
}
