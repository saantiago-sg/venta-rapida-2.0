import { Component, signal } from '@angular/core';

import { BusinessForm } from '../business-form/business-form';
import { DeliveryTypeList } from '../delivery-type-list/delivery-type-list';
import { EmployeeList } from '../employee-list/employee-list';
import { PaymentMethodList } from '../payment-method-list/payment-method-list';
import { TaxList } from '../tax-list/tax-list';

type SettingsSectionId = 'negocio' | 'impuestos' | 'medios-pago' | 'entrega' | 'empleados';

interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  icon: string;
}

const SECTIONS: SettingsSection[] = [
  { id: 'negocio', label: 'Negocio', icon: 'pi pi-building' },
  { id: 'impuestos', label: 'Impuestos', icon: 'pi pi-percentage' },
  { id: 'medios-pago', label: 'Medios de pago', icon: 'pi pi-wallet' },
  { id: 'entrega', label: 'Tipos de entrega', icon: 'pi pi-truck' },
  { id: 'empleados', label: 'Empleados', icon: 'pi pi-users' }
];

@Component({
  selector: 'app-settings-page',
  imports: [BusinessForm, TaxList, PaymentMethodList, DeliveryTypeList, EmployeeList],
  templateUrl: './settings-page.html'
})
export class SettingsPage {
  protected readonly sections = SECTIONS;
  protected readonly activeSection = signal<SettingsSectionId>('negocio');
}
