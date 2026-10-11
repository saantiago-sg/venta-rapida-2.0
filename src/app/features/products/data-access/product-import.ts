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
  // El producto que coincidio estaba desactivado -- al confirmar se actualiza y se reactiva.
  reactivate: boolean;
  errors: string[];
  // No bloquean la fila (se importa igual), solo avisan algo que conviene revisar.
  warnings: string[];
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

// Para matchear por nombre: "Milanesa  de Pollo " == "milanesa de pollo", "Jamón" == "jamon".
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function describeProduct(product: Product): string {
  const parts = [product.barcode ? `código ${product.barcode}` : 'sin código', `$${product.price}`];
  if (!product.active) parts.push('desactivado');
  return `"${product.name}" (${parts.join(', ')})`;
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
  const seenNames = new Map<string, number>(); // nombre normalizado -> primera fila sin codigo donde aparecio
  const matchedRows = new Map<string, number>(); // producto -> fila que ya lo actualiza

  // Incluye desactivados (list() solo excluye los eliminados) -- si coincide uno, se reactiva.
  const productsByName = new Map<string, Product[]>();
  for (const product of products) {
    const key = normalizeName(product.name);
    productsByName.set(key, [...(productsByName.get(key) ?? []), product]);
  }

  return rawRows.map((raw) => {
    const errors: string[] = [];
    const warnings: string[] = [];

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
    let matched: Product | null = null;

    // 1) Por codigo de barras. 2) Si la fila no trae codigo, o trae uno que no existe, por nombre.
    if (barcode) {
      const firstSeenRow = seenBarcodes.get(barcode);
      if (firstSeenRow !== undefined) {
        errors.push(`Código de barras duplicado en el archivo (ya aparece en la fila ${firstSeenRow})`);
      } else {
        seenBarcodes.set(barcode, raw.rowNumber);
        matched = products.find((p) => p.barcode === barcode) ?? null;
      }
    } else if (name) {
      const firstSeenRow = seenNames.get(normalizeName(name));
      if (firstSeenRow !== undefined) {
        errors.push(`Nombre repetido en el archivo sin código de barras (ya aparece en la fila ${firstSeenRow})`);
      } else {
        seenNames.set(normalizeName(name), raw.rowNumber);
      }
    }

    if (!matched && name && errors.length === 0) {
      const candidates = productsByName.get(normalizeName(name)) ?? [];
      if (candidates.length > 1) {
        errors.push(
          `Hay ${candidates.length} productos cargados con este nombre: ${candidates.map(describeProduct).join('; ')}. ` +
            'Eliminá los duplicados y volvé a importar.'
        );
      } else if (candidates.length === 1) {
        const candidate = candidates[0];
        if (!candidate.isCombo && barcode && candidate.barcode && candidate.barcode !== barcode) {
          warnings.push(`Ya existe ${describeProduct(candidate)} con otro código: se creará aparte`);
        } else {
          matched = candidate;
        }
      }
    }

    // El import pisa isCombo/componentes -- un combo se romperia, asi que no se toca desde aca.
    if (matched?.isCombo) {
      errors.push(`"${matched.name}" es un combo: los combos se editan a mano desde Productos, no por importación`);
      matched = null;
    }

    if (matched && errors.length === 0) {
      const otherRow = matchedRows.get(matched.id);
      if (otherRow !== undefined) {
        errors.push(`La fila ${otherRow} ya actualiza el producto "${matched.name}"`);
        matched = null;
      } else {
        matchedRows.set(matched.id, raw.rowNumber);
      }
    }

    const action: ProductImportRowAction = errors.length > 0 ? 'error' : matched ? 'update' : 'create';

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
      matchedProductId: action === 'update' ? matched!.id : null,
      reactivate: action === 'update' && !matched!.active,
      errors,
      warnings
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
