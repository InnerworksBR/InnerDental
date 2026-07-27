const CLINIC_TIME_ZONE = "America/Sao_Paulo";

function clinicDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIME_ZONE }).format(date);
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00-03:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return clinicDate(value);
}

export function clinicDateFromInstant(value: string): string {
  return clinicDate(new Date(value));
}

export function weekDatesContaining(date: string): string[] {
  const weekday = new Date(`${date}T12:00:00-03:00`).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const monday = shiftDate(date, -daysSinceMonday);
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
}
