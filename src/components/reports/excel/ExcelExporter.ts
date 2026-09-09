import * as XLSX from 'xlsx';

export interface ExcelSheetData {
  sheetName: string;
  data: any[];
}

/**
 * Generates and downloads an Excel file from JSON data
 * @param sheets Array of sheets to include
 * @param filename Name of the file (without extension)
 */
export const downloadExcel = (sheets: ExcelSheetData[], filename: string) => {
  const wb = XLSX.utils.book_new();

  sheets.forEach(({ sheetName, data }) => {
    // If data is empty, add a dummy row so the sheet isn't completely empty
    const sheetData = data.length > 0 ? data : [{ Mensaje: 'No hay datos para mostrar' }];
    const ws = XLSX.utils.json_to_sheet(sheetData);
    
    // Auto-size columns (basic implementation)
    const colWidths = getAutoColumnWidths(sheetData);
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31)); // max 31 chars
  });

  XLSX.writeFile(wb, `${filename}.xlsx`);
};

/**
 * Calculates auto width for columns based on data length
 */
const getAutoColumnWidths = (data: any[]) => {
  if (!data || data.length === 0) return [];
  
  const headers = Object.keys(data[0]);
  const colWidths = headers.map(header => {
    let maxLength = header.length;
    
    // Check first 50 rows for max length
    for (let i = 0; i < Math.min(data.length, 50); i++) {
      const val = data[i][header];
      if (val !== null && val !== undefined) {
        const valStr = String(val);
        if (valStr.length > maxLength) {
          maxLength = valStr.length;
        }
      }
    }
    
    // Add some padding, max width 50
    return { wch: Math.min(maxLength + 2, 50) };
  });
  
  return colWidths;
};
