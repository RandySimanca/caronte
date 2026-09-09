import { View, Text } from '@react-pdf/renderer';
import { PdfLayout, pdfStyles, pdfColors } from '../PdfLayout';
import { formatCurrency } from '../formatters';

interface PortfolioReportPdfProps {
  routeName: string;
  stats: {
    capitalColocado: number;
    capitalRecuperado: number;
    carteraActiva: number;
    carteraVencida: number;
  };
  arrearsByRange: {
    range: string;
    amount: number;
    count: number;
  }[];
  topDefaulters: {
    clientName: string;
    phone: string;
    arrearsAmount: number;
    daysLate: number;
  }[];
}

export function PortfolioReportPdf({ routeName, stats, arrearsByRange, topDefaulters }: PortfolioReportPdfProps) {
  return (
    <PdfLayout 
      title="Estado de Cartera" 
      subtitle={`Ruta: ${routeName}`}
    >
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Resumen de Cartera</Text>
        <View style={pdfStyles.table}>
          <View style={[pdfStyles.tableRow, pdfStyles.tableHeader]}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>Indicador</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={pdfStyles.textRight}>Valor</Text></View>
          </View>
          
          <View style={pdfStyles.tableRow}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>Capital Colocado (Histórico Activo)</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textBold]}>{formatCurrency(stats.capitalColocado)}</Text></View>
          </View>
          
          <View style={pdfStyles.tableRow}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>Capital Recuperado</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textEmerald, pdfStyles.textBold]}>{formatCurrency(stats.capitalRecuperado)}</Text></View>
          </View>
          
          <View style={[pdfStyles.tableRow, { backgroundColor: pdfColors.slate50 }]}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={pdfStyles.textBold}>Cartera Activa (Saldo por cobrar)</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textBlue, pdfStyles.textBold]}>{formatCurrency(stats.carteraActiva)}</Text></View>
          </View>

          <View style={pdfStyles.tableRow}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>Cartera Vencida (Mora)</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textRed, pdfStyles.textBold]}>{formatCurrency(stats.carteraVencida)}</Text></View>
          </View>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Análisis de Morosidad por Rangos</Text>
        <View style={pdfStyles.table}>
          <View style={[pdfStyles.tableRow, pdfStyles.tableHeader]}>
            <View style={[pdfStyles.tableCol, { width: '40%' }]}><Text>Rango de Mora</Text></View>
            <View style={[pdfStyles.tableCol, { width: '30%' }]}><Text style={pdfStyles.textCenter}>Nº Préstamos</Text></View>
            <View style={[pdfStyles.tableCol, { width: '30%' }]}><Text style={pdfStyles.textRight}>Saldo Vencido</Text></View>
          </View>
          {arrearsByRange.map((range, i) => (
            <View style={pdfStyles.tableRow} key={i}>
              <View style={[pdfStyles.tableCol, { width: '40%' }]}><Text>{range.range}</Text></View>
              <View style={[pdfStyles.tableCol, { width: '30%' }]}><Text style={pdfStyles.textCenter}>{range.count}</Text></View>
              <View style={[pdfStyles.tableCol, { width: '30%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textRed]}>{formatCurrency(range.amount)}</Text></View>
            </View>
          ))}
          {arrearsByRange.length === 0 && (
            <View style={pdfStyles.tableRow}>
              <View style={[pdfStyles.tableCol, { width: '100%' }]}><Text style={pdfStyles.textCenter}>No hay cartera vencida registrada</Text></View>
            </View>
          )}
        </View>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Top Clientes en Mora</Text>
        <View style={pdfStyles.table}>
          <View style={[pdfStyles.tableRow, pdfStyles.tableHeader]}>
            <View style={[pdfStyles.tableCol, { width: '40%' }]}><Text>Cliente</Text></View>
            <View style={[pdfStyles.tableCol, { width: '25%' }]}><Text>Teléfono</Text></View>
            <View style={[pdfStyles.tableCol, { width: '15%' }]}><Text style={pdfStyles.textCenter}>Días</Text></View>
            <View style={[pdfStyles.tableCol, { width: '20%' }]}><Text style={pdfStyles.textRight}>Saldo Mora</Text></View>
          </View>
          {topDefaulters.map((client, i) => (
            <View style={pdfStyles.tableRow} key={i}>
              <View style={[pdfStyles.tableCol, { width: '40%' }]}><Text>{client.clientName}</Text></View>
              <View style={[pdfStyles.tableCol, { width: '25%' }]}><Text>{client.phone || 'N/A'}</Text></View>
              <View style={[pdfStyles.tableCol, { width: '15%' }]}><Text style={pdfStyles.textCenter}>{client.daysLate}</Text></View>
              <View style={[pdfStyles.tableCol, { width: '20%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textRed]}>{formatCurrency(client.arrearsAmount)}</Text></View>
            </View>
          ))}
          {topDefaulters.length === 0 && (
            <View style={pdfStyles.tableRow}>
              <View style={[pdfStyles.tableCol, { width: '100%' }]}><Text style={pdfStyles.textCenter}>No hay clientes con atrasos</Text></View>
            </View>
          )}
        </View>
      </View>
    </PdfLayout>
  );
}
