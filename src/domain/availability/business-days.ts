const CLINIC_TIME_ZONE = "America/Sao_Paulo";

export function clinicDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIME_ZONE }).format(date);
}

function dateAtClinicNoon(date: string): Date {
  return new Date(`${date}T12:00:00-03:00`);
}

function nextDate(date: string): string {
  const value = dateAtClinicNoon(date);
  value.setUTCDate(value.getUTCDate() + 1);
  return clinicDate(value);
}

export function isBusinessDate(date: string): boolean {
  const weekday = dateAtClinicNoon(date).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

export function minimumBookingDate(now = new Date(), leadBusinessDays = 2): string {
  let date = clinicDate(now);
  let elapsedBusinessDays = 0;
  while (elapsedBusinessDays < leadBusinessDays) {
    date = nextDate(date);
    if (isBusinessDate(date)) elapsedBusinessDays += 1;
  }
  return date;
}

export function bookingBusinessDays(now = new Date(), count = 6, leadBusinessDays = 2): Date[] {
  const result: Date[] = [];
  let date = minimumBookingDate(now, leadBusinessDays);
  while (result.length < count) {
    if (isBusinessDate(date)) result.push(dateAtClinicNoon(date));
    date = nextDate(date);
  }
  return result;
}
