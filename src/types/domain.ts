export const appointmentStatuses = ["scheduled", "rescheduled", "cancelled", "completed", "no_show"] as const;
export type AppointmentStatus = (typeof appointmentStatuses)[number];

export const holdStatuses = ["active", "released", "expired", "consumed"] as const;
export type HoldStatus = (typeof holdStatuses)[number];

export const accessTokenStatuses = ["active", "used", "revoked", "expired"] as const;
export type AccessTokenStatus = (typeof accessTokenStatuses)[number];
