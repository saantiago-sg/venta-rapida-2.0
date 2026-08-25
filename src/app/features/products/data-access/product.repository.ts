import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { Product, ProductComponent, ProductFormValue } from './models';

interface ProductRow {
  id: string;
  business_id: string;
  category_id: string | null;
  tax_id: string | null;
  name: string;
  barcode: string | null;
  sale_type: 'unit' | 'weight';
  price: number;
  cost: number;
  stock: number;
  track_stock: boolean;
  active: boolean;
  is_combo: boolean;
  categories: { name: string } | { name: string }[] | null;
  taxes: { name: string; rate: number } | { name: string; rate: number }[] | null;
}

interface ProductComponentRow {
  component_product_id: string;
  quantity: number;
  products: { name: string } | { name: string }[] | null;
}

const SELECT_COLUMNS =
  'id, business_id, category_id, tax_id, name, barcode, sale_type, price, cost, stock, track_stock, active, is_combo, categories(name), taxes(name, rate)';

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapRow(row: ProductRow): Product {
  const category = first(row.categories);
  const tax = first(row.taxes);
  return {
    id: row.id,
    businessId: row.business_id,
    categoryId: row.category_id,
    categoryName: category?.name ?? null,
    taxId: row.tax_id,
    taxName: tax?.name ?? null,
    taxRate: tax?.rate ?? null,
    name: row.name,
    barcode: row.barcode,
    saleType: row.sale_type,
    price: row.price,
    cost: row.cost,
    stock: row.stock,
    trackStock: row.track_stock,
    active: row.active,
    isCombo: row.is_combo,
    components: []
  };
}

@Injectable({ providedIn: 'root' })
export class ProductRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  async list(businessId: string): Promise<Product[]> {
    const { data, error } = await this.supabase
      .from('products')
      .select(SELECT_COLUMNS)
      .eq('business_id', businessId)
      .order('name');
    if (error) throw error;
    return (data as unknown as ProductRow[]).map(mapRow);
  }

  async create(businessId: string, input: ProductFormValue): Promise<Product> {
    const { data, error } = await this.supabase
      .from('products')
      .insert({
        business_id: businessId,
        category_id: input.categoryId,
        tax_id: input.taxId,
        name: input.name,
        barcode: input.barcode || null,
        sale_type: input.saleType,
        price: input.price,
        cost: input.cost,
        track_stock: input.trackStock,
        is_combo: input.isCombo
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw error;

    const product = mapRow(data as unknown as ProductRow);

    if (input.isCombo) {
      await this.saveComponents(businessId, product.id, input.components);
    } else if (input.trackStock && input.initialStock) {
      await this.adjustStock(businessId, product.id, input.initialStock, 'initial', 'Stock inicial de carga');
      product.stock = input.initialStock;
    }

    return product;
  }

  async update(id: string, businessId: string, input: ProductFormValue, previousStock: number): Promise<void> {
    const { error } = await this.supabase
      .from('products')
      .update({
        category_id: input.categoryId,
        tax_id: input.taxId,
        name: input.name,
        barcode: input.barcode || null,
        sale_type: input.saleType,
        price: input.price,
        cost: input.cost,
        track_stock: input.trackStock,
        is_combo: input.isCombo
      })
      .eq('id', id);
    if (error) throw error;

    if (input.isCombo) {
      await this.saveComponents(businessId, id, input.components);
    } else if (input.trackStock) {
      const delta = input.initialStock - previousStock;
      if (delta !== 0) {
        await this.adjustStock(businessId, id, delta, 'adjustment', 'Ajuste de stock');
      }
    }
  }

  async setActive(id: string, active: boolean): Promise<void> {
    const { error } = await this.supabase.from('products').update({ active }).eq('id', id);
    if (error) throw error;
  }

  async adjustStock(
    businessId: string,
    productId: string,
    delta: number,
    type: 'initial' | 'adjustment' = 'adjustment',
    notes?: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('stock_movements')
      .insert({ business_id: businessId, product_id: productId, type, quantity: delta, notes });
    if (error) throw error;
  }

  // delete+insert atomico via RPC (save_product_components) -- evita que la receta quede a
  // medio guardar si algo falla a mitad de camino.
  async saveComponents(
    businessId: string,
    productId: string,
    components: { componentProductId: string; quantity: number }[]
  ): Promise<void> {
    const { error } = await this.supabase.rpc('save_product_components', {
      p_product_id: productId,
      p_business_id: businessId,
      p_components: components.map((c) => ({ component_product_id: c.componentProductId, quantity: c.quantity }))
    });
    if (error) throw error;
  }

  // Solo se llama al abrir el modal de edicion de un combo -- list() no trae esto para no
  // cargar el listado general con datos que casi nunca hacen falta.
  async getComponents(productId: string): Promise<ProductComponent[]> {
    const { data, error } = await this.supabase
      .from('product_components')
      .select('component_product_id, quantity, products!component_product_id(name)')
      .eq('parent_product_id', productId);
    if (error) throw error;

    return (data as unknown as ProductComponentRow[]).map((row) => ({
      componentProductId: row.component_product_id,
      componentProductName: first(row.products)?.name ?? '',
      quantity: row.quantity
    }));
  }
}
