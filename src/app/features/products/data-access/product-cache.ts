import { DBSchema, IDBPDatabase, openDB } from 'idb';

import { Product } from './models';

// Copia local del catalogo, una entrada por negocio. En IndexedDB y no en localStorage (ver
// local-cache.ts) porque con miles de productos se pasa de la cuota de ~5MB y, ademas,
// localStorage serializa sincronico y trabaria la UI al guardar. Ver ProductsStore.load().
interface ProductCacheEntry {
  businessId: string;
  products: Product[];
  savedAt: string;
}

interface ProductCacheDb extends DBSchema {
  products: {
    key: string;
    value: ProductCacheEntry;
  };
}

const DB_NAME = 'venta-rapida-catalog';
const DB_VERSION = 1;
const STORE_NAME = 'products';

let dbPromise: Promise<IDBPDatabase<ProductCacheDb>> | null = null;

function getDb(): Promise<IDBPDatabase<ProductCacheDb>> {
  if (!dbPromise) {
    dbPromise = openDB<ProductCacheDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME, { keyPath: 'businessId' });
      }
    });
  }
  return dbPromise;
}

// IndexedDB puede fallar (modo privado estricto, cuota llena) -- en ese caso se comporta
// como si no hubiera cache: el catalogo se sigue pidiendo a Supabase como siempre.
export async function readProductCache(businessId: string): Promise<Product[] | null> {
  try {
    const entry = await (await getDb()).get(STORE_NAME, businessId);
    return entry?.products ?? null;
  } catch {
    return null;
  }
}

export async function writeProductCache(businessId: string, products: Product[]): Promise<void> {
  try {
    await (await getDb()).put(STORE_NAME, { businessId, products, savedAt: new Date().toISOString() });
  } catch {
    // Ver readProductCache.
  }
}

// Al cerrar sesion -- ver clearLocalCaches en core/offline/local-cache.ts.
export async function clearProductCache(): Promise<void> {
  try {
    await (await getDb()).clear(STORE_NAME);
  } catch {
    // Ver readProductCache.
  }
}
