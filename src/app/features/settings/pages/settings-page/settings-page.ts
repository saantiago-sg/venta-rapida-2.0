import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { BusinessForm } from '../business-form/business-form';
import { DeliveryTypeList } from '../delivery-type-list/delivery-type-list';
import { EmployeeList } from '../employee-list/employee-list';
import { PaymentMethodList } from '../payment-method-list/payment-method-list';
import { ScaleSettingsPage } from '../scale-settings/scale-settings';
import { TaxList } from '../tax-list/tax-list';
import { TicketSettingsPage } from '../ticket-settings/ticket-settings';

type SettingsSectionId =
  | 'negocio'
  | 'impuestos'
  | 'medios-pago'
  | 'entrega'
  | 'balanza'
  | 'empleados'
  | 'ticket';

interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  icon: string;
}

// La seccion 'facturacion' (FiscalSettingsPage) esta deshabilitada a proposito -- no se lanza
// en la primera version. El feature sigue completo por debajo, solo desconectado de esta lista;
// reactivar es agregar de vuelta la entrada y el import de FiscalSettingsPage.
const SECTIONS: SettingsSection[] = [
  { id: 'negocio', label: 'Negocio', icon: 'pi pi-building' },
  { id: 'impuestos', label: 'Impuestos', icon: 'pi pi-percentage' },
  { id: 'medios-pago', label: 'Medios de pago', icon: 'pi pi-wallet' },
  { id: 'entrega', label: 'Tipos de entrega', icon: 'pi pi-truck' },
  { id: 'balanza', label: 'Balanza', icon: 'pi pi-barcode' },
  { id: 'empleados', label: 'Empleados', icon: 'pi pi-users' },
  { id: 'ticket', label: 'Ticket', icon: 'pi pi-print' }
];

const SECTION_IDS = SECTIONS.map((s) => s.id);

@Component({
  selector: 'app-settings-page',
  imports: [
    BusinessForm,
    TaxList,
    PaymentMethodList,
    DeliveryTypeList,
    ScaleSettingsPage,
    EmployeeList,
    TicketSettingsPage
  ],
  templateUrl: './settings-page.html'
})
export class SettingsPage {
  private readonly route = inject(ActivatedRoute);

  protected readonly sections = SECTIONS;

  // Permite llegar directo a una seccion (ej. desde el aviso de "no hay impuestos cargados"
  // en el formulario de producto) via /configuracion?section=impuestos.
  protected readonly activeSection = signal<SettingsSectionId>(this.initialSection());

  private initialSection(): SettingsSectionId {
    const param = this.route.snapshot.queryParamMap.get('section');
    return SECTION_IDS.includes(param as SettingsSectionId) ? (param as SettingsSectionId) : 'negocio';
  }
}
