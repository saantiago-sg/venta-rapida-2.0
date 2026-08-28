import { WeightedBarcodeConfig } from '../../settings/data-access/models';

export interface WeightedBarcodeMatch {
  // Codigo que hay que buscar en products.barcode -- el comerciante carga ahi el codigo corto
  // que configuro en su balanza, no el barcode completo escaneado (que cambia con cada pesada).
  productBarcode: string;
  weightGrams: number;
}

// Las balanzas imprimen un EAN-13 (u otro largo, segun la marca) con el codigo del producto y
// el peso codificados adentro del numero -- no hay estandar unico, por eso prefix/digitos son
// configurables por negocio (ver WeightedBarcodeConfig). Si el escaneo no matchea el patron
// configurado, devuelve null y el llamador cae al lookup normal por codigo exacto.
export function parseWeightedBarcode(scanned: string, config: WeightedBarcodeConfig): WeightedBarcodeMatch | null {
  if (!config.enabled) return null;

  const digits = scanned.trim();
  const minLength = config.prefix.length + config.productCodeDigits + config.weightDigits;
  if (!digits || !/^\d+$/.test(digits) || digits.length < minLength || !digits.startsWith(config.prefix)) {
    return null;
  }

  let cursor = config.prefix.length;
  const productBarcode = digits.slice(cursor, cursor + config.productCodeDigits);
  cursor += config.productCodeDigits;
  const weightGrams = Number(digits.slice(cursor, cursor + config.weightDigits));

  if (!weightGrams || weightGrams <= 0) return null;
  return { productBarcode, weightGrams };
}
