// Reglas de armado de comprobantes ARCA (letra, codigos fijos de AFIP, calculo de IVA) --
// compartidas entre invoice-sale (facturacion automatica atada a una venta del POS) e
// issue-standalone-invoice (facturador suelto, sin venta). Extraido de invoice-sale/index.ts
// para no duplicar esta logica entre las dos funciones.

import * as forge from "node-forge";

// ---------------------------------------------------------------------------
// Letra del comprobante segun condicion IVA del emisor (el negocio) y del receptor (el
// cliente, o "Consumidor Final" si no hay uno cargado):
//   - Emisor Responsable Inscripto + receptor Responsable Inscripto -> Factura A (discrimina IVA)
//   - Emisor Responsable Inscripto + receptor NO Responsable Inscripto (Monotributo/Exento/
//     Consumidor Final) -> Factura B (discrimina IVA)
//   - Emisor Monotributo o Exento, cualquier receptor -> Factura C (no discrimina IVA -- un
//     monotributista no es agente de IVA, por eso ImpNeto = ImpTotal, ImpIVA = 0, sin
//     desglose de Iva[] en el request, ver buildImporte)
// ---------------------------------------------------------------------------

export const CBTE_TIPO_FACTURA_A = 1;
export const CBTE_TIPO_FACTURA_B = 6;
export const CBTE_TIPO_FACTURA_C = 11;

export function determineCbteTipo(emisorCondicionIva: string, receptorCondicionIva: string): number {
  if (emisorCondicionIva === "RI") {
    return receptorCondicionIva === "RI" ? CBTE_TIPO_FACTURA_A : CBTE_TIPO_FACTURA_B;
  }
  return CBTE_TIPO_FACTURA_C;
}

// CondicionIVAReceptorId que exige AFIP en el detalle del comprobante desde la RG 5616 (sin
// esto, AFIP rechaza el comprobante) -- codigos fijos de FEParamGetCondicionIvaReceptor.
export const CONDICION_IVA_RECEPTOR_ID: Record<string, number> = { RI: 1, E: 4, CF: 5, M: 6 };

// DocTipo que exige AFIP para identificar al receptor -- codigos fijos de FEParamGetTiposDoc.
// 99 = "Consumidor Final sin identificar" (sin DocNro real, se manda 0).
export const DOC_TIPO_BY_TYPE: Record<string, number> = { DNI: 96, CUIT: 80, CUIL: 86 };
export const DOC_TIPO_CONSUMIDOR_FINAL = 99;

// Alicuota de IVA -> Id que espera AFIP en Iva[].AlicIva.Id (codigos fijos de
// FEParamGetTiposIva). Las tasas que no esten en esta tabla no se pueden facturar todavia -- se
// rechaza explicitamente en vez de mandar un Id inventado.
export const ALICUOTA_ID_BY_RATE: Record<string, number> = { "0": 3, "10.5": 4, "21": 5, "27": 6 };

// ---------------------------------------------------------------------------

export function todayYYYYMMDD(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

// "20260913" -> "2026-09-13". Formato que usa WSFEv1 en fechas de respuesta.
export function yyyymmddToIso(value: string | undefined): string | null {
  if (!value || !/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

// El certificado de ARCA trae el CUIT del negocio en subject.serialNumber, formato
// "CUIT 20421955965" (ver README de arca-direct-test) -- se extrae de ahi en vez de pedirle al
// dueno que lo tipee a mano y arriesgarse a que no coincida con el certificado real.
export function extractCuitFromCert(certPem: string): number {
  const cert = forge.pki.certificateFromPem(certPem);
  const attr = cert.subject.attributes.find((a) => a.shortName === "serialNumber" || a.name === "serialNumber");
  const match = String(attr?.value ?? "").match(/CUIT\s+(\d+)/i);
  if (!match) {
    throw new Error("No se pudo extraer el CUIT del certificado (subject.serialNumber no tiene el formato esperado).");
  }
  return Number(match[1]);
}

function priceWithoutTax(grossAmount: number, taxRate: number): number {
  return Math.round((grossAmount / (1 + taxRate / 100)) * 100) / 100;
}

export interface TaxableLine {
  // Monto con impuesto incluido (mismo criterio de precios de todo VentaRapida) de esta linea.
  grossAmount: number;
  taxRate: number;
}

export interface ImporteBreakdown {
  impNeto: number;
  impIVA: number;
  iva?: { AlicIva: { Id: number; BaseImp: number; Importe: number } }[];
}

// ImpNeto/ImpIVA/Iva[] segun la letra del comprobante -- ver la nota de "Letra del comprobante"
// arriba sobre por que Factura C no discrimina IVA. `lines` puede ser una sola linea (facturador
// suelto, monto total + una tasa) o varias (sale_items de una venta) -- se agrupan por alicuota
// igual en los dos casos.
export function buildImporte(cbteTipo: number, lines: TaxableLine[], total: number): ImporteBreakdown {
  if (cbteTipo === CBTE_TIPO_FACTURA_C) {
    return { impNeto: total, impIVA: 0, iva: undefined };
  }

  const groups = new Map<number, { baseImp: number; importe: number }>();
  for (const line of lines) {
    const alicuotaId = ALICUOTA_ID_BY_RATE[String(line.taxRate)];
    if (alicuotaId === undefined) {
      throw new Error(`Tasa de IVA sin mapear a un codigo de AFIP: ${line.taxRate}%.`);
    }
    const neto = priceWithoutTax(line.grossAmount, line.taxRate);
    const iva = Math.round((line.grossAmount - neto) * 100) / 100;
    const group = groups.get(alicuotaId) ?? { baseImp: 0, importe: 0 };
    group.baseImp = Math.round((group.baseImp + neto) * 100) / 100;
    group.importe = Math.round((group.importe + iva) * 100) / 100;
    groups.set(alicuotaId, group);
  }

  const iva = [...groups.entries()].map(([Id, g]) => ({ AlicIva: { Id, BaseImp: g.baseImp, Importe: g.importe } }));
  const impNeto = Math.round(iva.reduce((sum, g) => sum + g.AlicIva.BaseImp, 0) * 100) / 100;
  const impIVA = Math.round(iva.reduce((sum, g) => sum + g.AlicIva.Importe, 0) * 100) / 100;
  return { impNeto, impIVA, iva };
}
