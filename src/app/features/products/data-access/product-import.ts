import { Category, Product, SaleType } from './models';

// Orden fijo de columnas, tanto para la plantilla que se descarga como para el parseo del
// archivo subido -- mas simple y menos propenso a errores que matchear headers por nombre.
const TEMPLATE_HEADERS = [
  'Nombre',
  'Código de barras',
  'Categoría',
  'Precio',
  'Costo',
  'Tipo de venta (Unidad/Peso)',
  'Impuesto',
  'Stock inicial',
  'Trackea stock (Sí/No)'
];

const TEMPLATE_EXAMPLE_ROW = [
  'Coca-Cola 1.5L',
  '7790895000782',
  'Bebidas',
  1200,
  700,
  'Unidad',
  '',
  10,
  'Sí'
];

export interface ProductImportRawRow {
  rowNumber: number;
  name: string;
  barcode: string | null;
  categoryName: string | null;
  price: number | null;
  cost: number | null;
  saleTypeRaw: string | null;
  taxName: string | null;
  initialStock: number | null;
  trackStockRaw: string | null;
}

export type ProductImportRowAction = 'create' | 'update' | 'error';

export interface ProductImportPreviewRow {
  rowNumber: number;
  name: string;
  barcode: string | null;
  categoryName: string | null;
  categoryId: string | null;
  categoryIsNew: boolean;
  taxName: string | null;
  taxId: string | null;
  price: number;
  cost: number;
  saleType: SaleType;
  initialStock: number;
  trackStock: boolean;
  action: ProductImportRowAction;
  matchedProductId: string | null;
  errors: string[];
}

function cellText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function cellNumber(value: unknown): number | null {
  // Si la celda ya es numerica (formato "Numero" en Excel), exceljs entrega un number real --
  // usarlo tal cual. Solo se parsea como texto con formato AR ("1.200,50") cuando la celda vino
  // como texto: si acá se hiciera String(1200.5) y se le sacaran los puntos pensando que son
  // separador de miles, "1200.5" se corromperia a 12005.
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const text = cellText(value);
  if (text === null) return null;
  const normalized = text.replace(/\./g, '').replace(',', '.'); // admite "1.200,50" ademas de "1200.50"
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

// Excel/exceljs entregan cada celda como Cell, no como valor plano -- se lee .value y se
// castea con las funciones de arriba. eachRow con includeEmpty:false salta filas totalmente
// vacias (ej. al final del archivo).
export async function parseProductImportFile(file: File): Promise<ProductImportRawRow[]> {
  // exceljs se importa via su build de browser (UMD), que esbuild solo expone como default
  // export -- destructurar { Workbook } de la promesa del import da undefined y "new Workbook()"
  // explota en runtime con "X is not a constructor" (el chequeo de tipos no lo detecta porque
  // los .d.ts de exceljs listan Workbook como named export).
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('El archivo no tiene ninguna hoja.');

  const rows: ProductImportRawRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // fila de encabezados

    const values = row.values as unknown[]; // indice 0 vacio, las columnas arrancan en 1
    const name = cellText(values[1]);
    if (!name && !cellText(values[2]) && cellNumber(values[4]) === null) return; // fila vacia intermedia

    rows.push({
      rowNumber,
      name: name ?? '',
      barcode: cellText(values[2]),
      categoryName: cellText(values[3]),
      price: cellNumber(values[4]),
      cost: cellNumber(values[5]),
      saleTypeRaw: cellText(values[6]),
      taxName: cellText(values[7]),
      initialStock: cellNumber(values[8]),
      trackStockRaw: cellText(values[9])
    });
  });

  return rows;
}

function parseSaleType(raw: string | null, errors: string[]): SaleType {
  if (!raw) return 'unit';
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'unidad' || normalized === 'unit') return 'unit';
  if (normalized === 'peso' || normalized === 'weight') return 'weight';
  errors.push(`Tipo de venta no reconocido: "${raw}" (usar "Unidad" o "Peso")`);
  return 'unit';
}

function parseTrackStock(raw: string | null, errors: string[]): boolean {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  if (['si', 'sí', 'yes', 'true'].includes(normalized)) return true;
  if (['no', 'false'].includes(normalized)) return false;
  errors.push(`Valor no reconocido en "Trackea stock": "${raw}" (usar "Sí" o "No")`);
  return false;
}

function findCategoryId(name: string, categories: Category[]): string | null {
  const match = categories.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
  return match?.id ?? null;
}

function findTaxId(name: string, taxes: { id: string; name: string }[]): string | null {
  const match = taxes.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());
  return match?.id ?? null;
}

// Construye la previsualizacion: valida cada fila y resuelve categoria/impuesto/match contra
// el estado actual (categorias, impuestos y productos ya cargados) -- no escribe nada en la
// base, eso pasa recien al confirmar (ver ProductImportDialog.onConfirm).
export function buildProductImportPreview(
  rawRows: ProductImportRawRow[],
  products: Product[],
  categories: Category[],
  taxes: { id: string; name: string }[]
): ProductImportPreviewRow[] {
  const seenBarcodes = new Map<string, number>(); // barcode -> primera fila donde aparecio

  return rawRows.map((raw) => {
    const errors: string[] = [];

    const name = raw.name.trim();
    if (!name) errors.push('Falta el nombre');

    const price = raw.price ?? 0;
    if (raw.price === null) errors.push('Falta el precio');
    else if (price < 0) errors.push('El precio no puede ser negativo');

    const cost = raw.cost ?? 0;
    if (cost < 0) errors.push('El costo no puede ser negativo');

    const saleType = parseSaleType(raw.saleTypeRaw, errors);
    const trackStock = parseTrackStock(raw.trackStockRaw, errors);

    const initialStock = raw.initialStock ?? 0;
    if (initialStock < 0) errors.push('El stock inicial no puede ser negativo');

    const categoryName = raw.categoryName;
    const categoryId = categoryName ? findCategoryId(categoryName, categories) : null;
    const categoryIsNew = categoryName !== null && categoryId === null;

    const taxName = raw.taxName;
    const taxId = taxName ? findTaxId(taxName, taxes) : null;

    const barcode = raw.barcode;
    let action: ProductImportRowAction = 'create';
    let matchedProductId: string | null = null;

    if (barcode) {
      const firstSeenRow = seenBarcodes.get(barcode);
      if (firstSeenRow !== undefined) {
        errors.push(`Código de barras duplicado en el archivo (ya aparece en la fila ${firstSeenRow})`);
      } else {
        seenBarcodes.set(barcode, raw.rowNumber);
        const existing = products.find((p) => p.barcode === barcode);
        if (existing) {
          action = 'update';
          matchedProductId = existing.id;
        }
      }
    }

    if (errors.length > 0) action = 'error';

    return {
      rowNumber: raw.rowNumber,
      name,
      barcode,
      categoryName,
      categoryId,
      categoryIsNew,
      taxName,
      taxId,
      price,
      cost,
      saleType,
      initialStock,
      trackStock,
      action,
      matchedProductId,
      errors
    };
  });
}

export async function buildProductImportTemplate(): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Productos');

  const headerRow = sheet.addRow(TEMPLATE_HEADERS);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
  });
  sheet.addRow(TEMPLATE_EXAMPLE_ROW);

  sheet.columns.forEach((column) => {
    column.width = 22;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
