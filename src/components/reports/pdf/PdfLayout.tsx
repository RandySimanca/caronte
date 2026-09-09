import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatDate } from './formatters';

// Standard colors
export const pdfColors = {
  emerald: '#059669',
  red: '#dc2626',
  blue: '#2563eb',
  brand: '#3b82f6', // primary brand color
  slate800: '#1e293b',
  slate500: '#64748b',
  slate200: '#e2e8f0',
  slate50: '#f8fafc'
};

export const pdfStyles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: pdfColors.slate800,
    backgroundColor: '#ffffff'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: pdfColors.slate200
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: pdfColors.brand,
    marginBottom: 4
  },
  subtitle: {
    fontSize: 10,
    color: pdfColors.slate500
  },
  metadataContainer: {
    alignItems: 'flex-end'
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: pdfColors.slate200
  },
  footerText: {
    fontSize: 8,
    color: pdfColors.slate500
  },
  pageNumber: {
    fontSize: 8,
    color: pdfColors.slate500
  },
  section: {
    marginBottom: 15
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    color: pdfColors.slate800,
    backgroundColor: pdfColors.slate50,
    padding: 5
  },
  table: {
    width: '100%',
    flexDirection: 'column',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: pdfColors.slate200,
    minHeight: 24,
    alignItems: 'center',
  },
  tableHeader: {
    backgroundColor: pdfColors.slate50,
    fontWeight: 'bold',
  },
  tableCol: {
    padding: 4,
  },
  textRight: {
    textAlign: 'right'
  },
  textCenter: {
    textAlign: 'center'
  },
  textBold: {
    fontWeight: 'bold'
  },
  textEmerald: { color: pdfColors.emerald },
  textRed: { color: pdfColors.red },
  textBlue: { color: pdfColors.blue },
});

interface PdfLayoutProps {
  title: string;
  subtitle?: string;
  dateRange?: string;
  children: React.ReactNode;
  orientation?: 'portrait' | 'landscape';
}

export function PdfLayout({ title, subtitle, dateRange, children, orientation = 'portrait' }: PdfLayoutProps) {
  const generatedAt = formatDate(new Date().toISOString(), "dd MMM yyyy, HH:mm");

  return (
    <Document>
      <Page size="A4" orientation={orientation} style={pdfStyles.page}>
        
        {/* Header - Fixed to top of every page if wrapped properly, but @react-pdf/renderer handles fixed headers specifically */}
        <View style={pdfStyles.header} fixed>
          <View>
            <Text style={pdfStyles.title}>{title}</Text>
            {subtitle && <Text style={pdfStyles.subtitle}>{subtitle}</Text>}
          </View>
          <View style={pdfStyles.metadataContainer}>
            <Text style={pdfStyles.subtitle}>CobraDiario PWA</Text>
            {dateRange && <Text style={pdfStyles.subtitle}>{dateRange}</Text>}
          </View>
        </View>

        {/* Content */}
        {children}

        {/* Footer - Fixed to bottom of every page */}
        <View style={pdfStyles.footer} fixed>
          <Text style={pdfStyles.footerText}>Generado el {generatedAt}</Text>
          <Text style={pdfStyles.pageNumber} render={({ pageNumber, totalPages }) => (
            `Página ${pageNumber} de ${totalPages}`
          )} />
        </View>
      </Page>
    </Document>
  );
}
