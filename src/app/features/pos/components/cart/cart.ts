import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputNumberModule } from 'primeng/inputnumber';

import { CartItem } from '../../data-access/models';
import { PosStore } from '../../state/pos.store';

const GRAMS_PER_KG = 1000;

@Component({
  selector: 'app-cart',
  imports: [DecimalPipe, FormsModule, InputNumberModule],
  templateUrl: './cart.html'
})
export class Cart {
  protected readonly store = inject(PosStore);

  // Los productos por peso se cargan en la caja/balanza en gramos (numero entero), pero el
  // precio es por kilo y toda la logica de venta (subtotal, RPC de confirmar venta) trabaja
  // en kilos -- esta es solo la conversion de presentacion para este input, item.quantity
  // sigue siendo kilos en el store.
  protected displayQuantity(item: CartItem): number {
    return item.product.saleType === 'weight' ? Math.round(item.quantity * GRAMS_PER_KG) : item.quantity;
  }

  protected onQuantityChange(item: CartItem, value: number): void {
    const quantity = item.product.saleType === 'weight' ? (value || 0) / GRAMS_PER_KG : value;
    this.store.updateQuantity(item.product.id, quantity);
  }

  protected onRemove(productId: string): void {
    this.store.removeFromCart(productId);
  }
}
