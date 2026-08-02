import { Component } from '@angular/core';
import { TabsModule } from 'primeng/tabs';

import { BusinessForm } from '../business-form/business-form';
import { DeliveryTypeList } from '../delivery-type-list/delivery-type-list';
import { EmployeeList } from '../employee-list/employee-list';
import { PaymentMethodList } from '../payment-method-list/payment-method-list';
import { TaxList } from '../tax-list/tax-list';

@Component({
  selector: 'app-settings-page',
  imports: [TabsModule, BusinessForm, TaxList, PaymentMethodList, DeliveryTypeList, EmployeeList],
  template: `
    <h1 class="text-xl font-semibold tracking-tight mb-4">Configuración</h1>

    <p-tabs value="0">
      <p-tablist>
        <p-tab value="0">Negocio</p-tab>
        <p-tab value="1">Impuestos</p-tab>
        <p-tab value="2">Medios de pago</p-tab>
        <p-tab value="3">Tipos de entrega</p-tab>
        <p-tab value="4">Empleados</p-tab>
      </p-tablist>
      <p-tabpanels>
        <p-tabpanel value="0"><app-business-form /></p-tabpanel>
        <p-tabpanel value="1"><app-tax-list /></p-tabpanel>
        <p-tabpanel value="2"><app-payment-method-list /></p-tabpanel>
        <p-tabpanel value="3"><app-delivery-type-list /></p-tabpanel>
        <p-tabpanel value="4"><app-employee-list /></p-tabpanel>
      </p-tabpanels>
    </p-tabs>
  `
})
export class SettingsPage {}
