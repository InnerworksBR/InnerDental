import type { TimeInterval } from "@/domain/availability/slots";

export type CalendarEvent = TimeInterval & {
  id: string;
  summary: string | null;
  allDay: boolean;
  blocksTime: boolean;
};

export interface CalendarGateway {
  listEvents(calendarId: string, range: TimeInterval): Promise<CalendarEvent[]>;
  listBusyIntervals(calendarId: string, range: TimeInterval): Promise<TimeInterval[]>;
  createEvent(calendarId: string, event: CalendarEventInput): Promise<string>;
  getEventInterval(calendarId: string, eventId: string): Promise<TimeInterval | null>;
  rescheduleEvent(calendarId: string, eventId: string, interval: TimeInterval): Promise<void>;
  updateEvent(calendarId: string, eventId: string, event: CalendarEventInput): Promise<void>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

type TimedCalendarEventInput = { summary: string; description: string; start: { dateTime: string; timeZone: string }; end: { dateTime: string; timeZone: string } };
type AllDayCalendarEventInput = { summary: string; description: string; start: { date: string }; end: { date: string } };

export type CalendarEventInput = TimedCalendarEventInput | AllDayCalendarEventInput;
