import { CalendarUnavailableError } from "./error.ts";
import type { TimeInterval } from "@/domain/availability/slots";
import type { CalendarEvent, CalendarEventInput, CalendarGateway } from "@/integrations/google-calendar/port";

type GoogleEvent = {
  id?: string;
  summary?: string;
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};
type GoogleResponse = { items?: GoogleEvent[]; nextPageToken?: string };

export class GoogleCalendarHttpGateway implements CalendarGateway {
  private readonly accessToken: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    accessToken: string,
    fetcher: typeof fetch = fetch,
    timeoutMs = 2_500,
  ) {
    this.accessToken = accessToken;
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
  }

  async listEvents(calendarId: string, range: TimeInterval): Promise<CalendarEvent[]> {
    try {
      const events: CalendarEvent[] = [];
      let pageToken: string | undefined;
      do {
        const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");
        url.searchParams.set("maxResults", "2500");
        url.searchParams.set("fields", "items(id,summary,status,transparency,start,end),nextPageToken");
        url.searchParams.set("timeMin", range.startAt);
        url.searchParams.set("timeMax", range.endAt);
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const response = await this.fetcher(url, {
          headers: { Authorization: `Bearer ${this.accessToken}` },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) throw new Error(`Google Calendar returned ${response.status}`);
        const body = (await response.json()) as GoogleResponse;
        for (const event of body.items ?? []) {
          if (!event.id || event.status === "cancelled") continue;
          const startAt = event.start?.dateTime ?? (event.start?.date ? `${event.start.date}T00:00:00-03:00` : undefined);
          const endAt = event.end?.dateTime ?? (event.end?.date ? `${event.end.date}T00:00:00-03:00` : undefined);
          if (startAt && endAt) {
            events.push({
              id: event.id,
              summary: event.summary?.trim() || null,
              startAt: new Date(startAt).toISOString(),
              endAt: new Date(endAt).toISOString(),
              allDay: Boolean(event.start?.date && event.end?.date),
              blocksTime: event.transparency !== "transparent",
            });
          }
        }
        pageToken = body.nextPageToken;
      } while (pageToken);
      return events;
    } catch {
      throw new CalendarUnavailableError();
    }
  }

  async listBusyIntervals(calendarId: string, range: TimeInterval): Promise<TimeInterval[]> {
    const events = await this.listEvents(calendarId, range);
    return events
      .filter((event) => event.blocksTime)
      .map(({ startAt, endAt }) => ({ startAt, endAt }));
  }

  async createEvent(calendarId: string, event: CalendarEventInput): Promise<string> {
    const body = await this.mutate(calendarId, "POST", undefined, event);
    if (typeof body.id !== "string") throw new CalendarUnavailableError();
    return body.id;
  }
  async getEventInterval(calendarId: string, eventId: string): Promise<TimeInterval | null> {
    try {
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
      const response = await this.fetcher(url, { headers: { Authorization: `Bearer ${this.accessToken}` }, signal: AbortSignal.timeout(this.timeoutMs) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Calendar read failed");
      const event = await response.json() as GoogleEvent;
      const startAt = event.start?.dateTime ?? (event.start?.date ? `${event.start.date}T00:00:00-03:00` : undefined);
      const endAt = event.end?.dateTime ?? (event.end?.date ? `${event.end.date}T00:00:00-03:00` : undefined);
      if (!startAt || !endAt) throw new Error("Calendar event without interval");
      return { startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString() };
    } catch { throw new CalendarUnavailableError(); }
  }
  async rescheduleEvent(calendarId: string, eventId: string, interval: TimeInterval): Promise<void> {
    await this.mutate(calendarId, "PATCH", eventId, {
      start: { dateTime: interval.startAt, timeZone: "America/Sao_Paulo" },
      end: { dateTime: interval.endAt, timeZone: "America/Sao_Paulo" },
    });
  }
  async updateEvent(calendarId: string, eventId: string, event: CalendarEventInput): Promise<void> { await this.mutate(calendarId, "PUT", eventId, event); }
  async deleteEvent(calendarId: string, eventId: string): Promise<void> { await this.mutate(calendarId, "DELETE", eventId); }
  private async mutate(calendarId: string, method: string, eventId?: string, event?: Record<string, unknown> | CalendarEventInput): Promise<Record<string, unknown>> {
    try {
      const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
      const response = await this.fetcher(eventId ? `${base}/${encodeURIComponent(eventId)}` : base, { method, headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" }, body: event ? JSON.stringify(event) : undefined, signal: AbortSignal.timeout(this.timeoutMs) });
      if (!response.ok && !(method === "DELETE" && response.status === 404)) throw new Error("Calendar mutation failed");
      return response.status === 204 ? {} : await response.json() as Record<string, unknown>;
    } catch { throw new CalendarUnavailableError(); }
  }
}
