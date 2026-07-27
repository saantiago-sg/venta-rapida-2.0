import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { Product, ProductFormValue } from './models';

interface ProductRow {
  id: string;
  business_id: string;
  category_id: string | null;
  name: string;
  barcode: string | null;
  sale_type: 'unit' | 'weight';
  price: number;
  cost: number;
  stock: number;
  track_stock: boolean;
  active: boolean;
  categories: { name: string } | { name: string }[] | null;
}

const SELECT_COLUMNS = 'id, business_id, category_id, name, barcode, sale_type, price, cost, stock, track_stock, active, categories(name)';

function mapRow(row: ProductRow): Product {
  const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  return {
    id: row.id,
    businessId: row.business_id,
    categoryId: row.category_id,
    categoryName: category?.name ?? null,
    name: row.name,
    barcode: row.barcode,
    saleType: row.sale_type,
    price: row.price,
    cost: row.cost,
    stock: row.stock,
    trackStock: row.track_stock,
    active: row.active
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
        name: input.name,
        barcode: input.barcode || null,
        sale_type: input.saleType,
        price: input.price,
        cost: input.cost,
        track_stock: input.trackStock
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw error;

    const product = mapRow(data as unknown as ProductRow);

    if (input.trackStock && input.initialStock) {
      await this.adjustStock(businessId, product.id, input.initialStock, 'initial', 'Stock inicial de carga');
      product.stock = input.initialStock;
    }

    return product;
  }

  async update(id: string, input: ProductFormValue): Promise<void> {
    const { error } = await this.supabase
      .from('products')
      .update({
        category_id: input.categoryId,
        name: input.name,
        barcode: input.barcode || null,
        sale_type: input.saleType,
        price: input.price,
        cost: input.cost,
        track_stock: input.trackStock
      })
      .eq('id', id);
    if (error) throw error;
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
}
