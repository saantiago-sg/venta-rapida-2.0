// Parseo/formateo a mano en vez de toISOString()/"new Date('yyyy-mm-dd')": esas rutas pasan
// por UTC y corren el dia en zonas horarias negativas (Argentina, UTC-3). Con año/mes/dia
// sueltos, Date arma/lee la fecha en el huso horario local, que es lo que el usuario espera.
export function parseLocalDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayIso(): string {
  return formatLocalDate(new Date());
}

export function addDaysIso(isoDate: string, days: number): string {
  const date = parseLocalDate(isoDate);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}
