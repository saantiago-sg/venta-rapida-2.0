import { SaleListItem } from './models';

const HEADERS = ['#', 'Fecha', 'Cliente', 'Medio de pago', 'Total', 'Estado'];

function formatMoney(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function saleRow(sale: SaleListItem): (string | number)[] {
  return [
    sale.saleNumber,
    new Date(sale.createdAt).toLocaleString('es-AR'),
    sale.customerName || 'Consumidor final',
    sale.paymentMethodName,
    formatMoney(sale.total),
    sale.status === 'completed' ? 'Completada' : 'Cancelada'
  ];
}

// dateFrom/dateTo llegan en el mismo formato 'yyyy-mm-dd' que usa el store -- se muestran
// como dd/mm/yyyy pero se usan tal cual (sin barras) para el nombre de archivo.
function displayDate(isoLocalDate: string): string {
  const [y, m, d] = isoLocalDate.split('-');
  return `${d}/${m}/${y}`;
}

export function dateRangeTitle(dateFrom: string | null, dateTo: string | null): string {
  if (!dateFrom && !dateTo) return 'Todas las fechas';
  if (dateFrom && dateTo && dateFrom === dateTo) return displayDate(dateFrom);
  if (dateFrom && dateTo) return `${displayDate(dateFrom)} al ${displayDate(dateTo)}`;
  if (dateFrom) return `Desde ${displayDate(dateFrom)}`;
  return `Hasta ${displayDate(dateTo!)}`;
}

function dateRangeFilenamePart(dateFrom: string | null, dateTo: string | null): string {
  if (!dateFrom && !dateTo) return 'todas';
  if (dateFrom && dateTo && dateFrom === dateTo) return dateFrom;
  if (dateFrom && dateTo) return `${dateFrom}_a_${dateTo}`;
  if (dateFrom) return `desde_${dateFrom}`;
  return `hasta_${dateTo}`;
}

function exportFilename(dateFrom: string | null, dateTo: string | null, extension: string): string {
  return `ventas_${dateRangeFilenamePart(dateFrom, dateTo)}.${extension}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportSalesCsv(sales: SaleListItem[], dateFrom: string | null, dateTo: string | null): void {
  const title = `Historial de ventas - ${dateRangeTitle(dateFrom, dateTo)}`;
  const lines = [
    csvCell(title),
    '',
    HEADERS.map(csvCell).join(';'),
    ...sales.map((sale) => saleRow(sale).map(csvCell).join(';'))
  ];
  // BOM al inicio: sin esto Excel interpreta el UTF-8 como Latin-1 y rompe los acentos.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, exportFilename(dateFrom, dateTo, 'csv'));
}

export async function exportSalesExcel(
  sales: SaleListItem[],
  dateFrom: string | null,
  dateTo: string | null
): Promise<void> {
  // Ver comentario en product-import.ts: exceljs solo expone default export en el bundle de
  // browser, destructurar { Workbook } directo da undefined.
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Ventas');

  sheet.mergeCells(1, 1, 1, HEADERS.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `Historial de ventas - ${dateRangeTitle(dateFrom, dateTo)}`;
  titleCell.font = { bold: true, size: 13 };

  sheet.addRow([]);
  const headerRow = sheet.addRow(HEADERS);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
  });

  for (const sale of sales) {
    sheet.addRow(saleRow(sale));
  }

  sheet.columns.forEach((column) => {
    column.width = 16;
  });
  sheet.getColumn(2).width = 20;
  sheet.getColumn(3).width = 24;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  triggerDownload(blob, exportFilename(dateFrom, dateTo, 'xlsx'));
}

export async function exportSalesPdf(
  sales: SaleListItem[],
  dateFrom: string | null,
  dateTo: string | null
): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(14);
  doc.text('Historial de ventas', 14, 15);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(dateRangeTitle(dateFrom, dateTo), 14, 21);

  autoTable(doc, {
    startY: 26,
    head: [HEADERS],
    body: sales.map((sale) => saleRow(sale).map(String)),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [249, 115, 22] }
  });

  doc.save(exportFilename(dateFrom, dateTo, 'pdf'));
}
