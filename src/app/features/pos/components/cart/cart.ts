import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputNumberModule } from 'primeng/inputnumber';

import { PosStore } from '../../state/pos.store';

@Component({
  selector: 'app-cart',
  imports: [DecimalPipe, FormsModule, InputNumberModule],
  templateUrl: './cart.html'
})
export class Cart {
  protected readonly store = inject(PosStore);

  protected onQuantityChange(productId: string, quantity: number): void {
    this.store.updateQuantity(productId, quantity);
  }

  protected onRemove(productId: string): void {
    this.store.removeFromCart(productId);
  }
}
