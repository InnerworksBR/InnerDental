export class CalendarUnavailableError extends Error {
  constructor() {
    super("Calendar availability could not be verified");
  }
}
