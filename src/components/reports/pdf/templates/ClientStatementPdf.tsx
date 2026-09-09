import { View, Text } from '@react-pdf/renderer';
import { PdfLayout, pdfStyles } from '../PdfLayout';
import { formatCurrency, formatDate } from '../formatters';

interface ClientStatementPdfProps {
  client: {
    full_name: string;
    document_id?: string;
    phone?: string;
    address?: string;
  };
  loan: {
    amount_requested: number;
    initial_obligation: number;
    amount_delivered: number;
    term_days: number;
    daily_installment: number;
    start_date: string;
    status: string;
    receipt_fee: number;
  };
  installments: any[];
  payments: any[]; // Optionally passed if we have real payment records, though installments might be enough
}

export function ClientStatementPdf({ client, loan, installments }: ClientStatementPdfProps) {
  const paidCount = installments.filter(i => ['PAGADA', 'PAGADA_ANTICIPADAMENTE'].includes(i.status)).length;
  const totalPaidAmount = installments.reduce((sum, i) => sum + (Number(i.paid_amount) || 0), 0);
  const currentBalance = loan.initial_obligation - totalPaidAmount;

  return (
    <PdfLayout 
      title="Estado de Cuenta" 
      subtitle={`Cliente: ${client.full_name}`}
    >
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Datos del Cliente</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
          <View style={{ width: '50%', marginBottom: 5 }}>
            <Text style={pdfStyles.textBold}>Nombre:</Text>
            <Text>{client.full_name}</Text>
          </View>
          <View style={{ width: '50%', marginBottom: 5 }}>
            <Text style={pdfStyles.textBold}>Documento:</Text>
            <Text>{client.document_id || 'N/A'}</Text>
          </View>
          <View style={{ width: '50%', marginBottom: 5 }}>
            <Text style={pdfStyles.textBold}>Teléfono:</Text>
            <Text>{client.phone || 'N/A'}</Text>
          </View>
          <View style={{ width: '50%', marginBottom: 5 }}>
            <Text style={pdfStyles.textBold}>Dirección:</Text>
            <Text>{client.address || 'N/A'}</Text>
          </View>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Detalles del Préstamo</Text>
        <View style={pdfStyles.table}>
          <View style={pdfStyles.tableRow}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>Monto Solicitado (Capital)</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textBold]}>{formatCurrency(loan.amount_requested)}</Text></View>
          </View>
          <View style={pdfStyles.tableRow}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>Obligación Total (+20%)</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textBold]}>{formatCurrency(loan.initial_obligation)}</Text></View>
          </View>
          <View style={pdfStyles.tableRow}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>Plazo y Cuota Diaria</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight]}>{loan.term_days} días a {formatCurrency(loan.daily_installment)}</Text></View>
          </View>
          <View style={pdfStyles.tableRow}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text>Estado Actual</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textBold, loan.status === 'ACTIVO' ? pdfStyles.textEmerald : {}]}>{loan.status}</Text></View>
          </View>
          <View style={[pdfStyles.tableRow, { backgroundColor: pdfStyles.slate50 }]}>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={pdfStyles.textBold}>Saldo Restante por Pagar</Text></View>
            <View style={[pdfStyles.tableCol, { width: '50%' }]}><Text style={[pdfStyles.textRight, pdfStyles.textBold, pdfStyles.textBlue]}>{formatCurrency(currentBalance)}</Text></View>
          </View>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Historial de Pagos y Cuotas</Text>
        <View style={pdfStyles.table}>
          <View style={[pdfStyles.tableRow, pdfStyles.tableHeader]}>
            <View style={[pdfStyles.tableCol, { width: '15%' }]}><Text>No.</Text></View>
            <View style={[pdfStyles.tableCol, { width: '25%' }]}><Text>Fecha Prog.</Text></View>
            <View style={[pdfStyles.tableCol, { width: '20%' }]}><Text>Estado</Text></View>
            <View style={[pdfStyles.tableCol, { width: '20%' }]}><Text style={pdfStyles.textRight}>Pagado</Text></View>
            <View style={[pdfStyles.tableCol, { width: '20%' }]}><Text style={pdfStyles.textRight}>Saldo Cuota</Text></View>
          </View>
          
          {installments.map((inst) => (
            <View style={pdfStyles.tableRow} key={inst.id}>
              <View style={[pdfStyles.tableCol, { width: '15%' }]}><Text>{inst.installment_number}</Text></View>
              <View style={[pdfStyles.tableCol, { width: '25%' }]}><Text>{formatDate(inst.scheduled_date, 'dd/MM/yyyy')}</Text></View>
              <View style={[pdfStyles.tableCol, { width: '20%' }]}>
                <Text style={
                  inst.status.includes('PAGADA') ? pdfStyles.textEmerald : 
                  inst.status === 'ATRASADA' ? pdfStyles.textRed : {}
                }>
                  {inst.status === 'PAGADA_ANTICIPADAMENTE' ? 'ANTICIPADA' : inst.status}
                </Text>
              </View>
              <View style={[pdfStyles.tableCol, { width: '20%' }]}><Text style={pdfStyles.textRight}>{formatCurrency(inst.paid_amount || 0)}</Text></View>
              <View style={[pdfStyles.tableCol, { width: '20%' }]}><Text style={pdfStyles.textRight}>{formatCurrency(inst.balance)}</Text></View>
            </View>
          ))}
        </View>
      </View>
    </PdfLayout>
  );
}
