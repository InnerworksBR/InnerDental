export type AgendaAppointment = {
  id: string;
  startAt: string;
  endAt?: string;
  professionalName: string;
  patientName: string;
  patientId?: string;
  agendaLabel: string;
  maskedPhone: string;
  status: string;
  source: string;
  calendarEventId?: string | null;
};

export type DirectCalendarEvent = {
  id: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  title: string;
  professionalName: string;
  source: "google_calendar";
};

export type AgendaBlock = {
  id: string;
  date: string;
  professionalName: string;
  status: string;
};

export type AdminAgenda = {
  appointments: AgendaAppointment[];
  calendarEvents: DirectCalendarEvent[];
  calendarStatus: "ok" | "partial" | "unavailable" | "not_configured";
  blocks: AgendaBlock[];
};

export type Activity = {
  inbox: { id: string; phone: string; classified_intent: string | null; processed_action: string | null; status: string; created_at: string; last_error?: string | null }[];
  outbox: { id: string; event_type: string; status: string; attempts: number; created_at: string; sent_at?: string | null }[];
};

export type Incident = {
  id: string;
  category: string;
  status: string;
  summary: string;
  correlation_id: string | null;
  opened_at: string;
};

export type Professional = { id: string; name: string };

export type MainTab = "Hoje" | "Agenda" | "Pacientes" | "Mensagens" | "Gestão";
export type CalendarView = "day" | "week" | "month";
export type AnalysisWindow = "24h" | "7d" | "30d";
export type AggregatedAnalysis = {
  window: AnalysisWindow;
  total: number;
  problematic: number;
  percentage: number;
  byOutcome: Record<"success" | "confused" | "abandoned" | "error" | "handoff_needed" | "spam", number>;
  topProblematic: AnalysisLog[];
};
export type AnalysisLog = {
  id: string;
  conversation_key: string;
  range_window: AnalysisWindow;
  outcome: "success" | "confused" | "abandoned" | "error" | "handoff_needed" | "spam";
  confidence: number;
  summary: string;
  evidence: Record<string, unknown>;
  correlation_ids: string[];
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  analyzed_at: string;
  resolved: boolean;
  resolved_at: string | null;
};
