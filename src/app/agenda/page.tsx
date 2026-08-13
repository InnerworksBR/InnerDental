"use client";

import { useEffect, useState } from "react";
import { PortalShell } from "@/components/portal-shell";
import { bookingBusinessDays, minimumBookingDate } from "@/domain/availability/business-days";
import { withConsecutiveSlots, type AppointmentSlotCount } from "@/domain/availability/slots";

type Professional = { id: string; name: string };
type InsurancePlan = { id: string; name: string; instructions: string | null };
type Appointment = { id: string; start_at: string; end_at: string; professionals?: { name?: string } | { name?: string }[] };
type Slot = { startAt: string };
type AvailableDay = { date: string; slots: Slot[] };
type NotOnlineBookableProcedure = { id: string; name: string; description: string | null };
type Profile = { complete: boolean; name: string | null; insurancePlanId: string | null };
type AgendaData = { appointments: Appointment[]; professionals: Professional[]; plans: InsurancePlan[]; procedures: NotOnlineBookableProcedure[]; profile: Profile };

const idempotencyKey = () => crypto.randomUUID();
const AVAILABILITY_SEARCH_DAYS = 24;
const localDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
const hour = (value: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value));
const initials = (name: string) => name.split(" ").filter((part) => part.length > 2).slice(-2).map((part) => part[0]).join("").toUpperCase();
const partySizeForAppointment = (appointment: Appointment): AppointmentSlotCount => new Date(appointment.end_at).getTime() - new Date(appointment.start_at).getTime() >= 30 * 60 * 1000 ? 2 : 1;

async function fetchAgendaData(signal?: AbortSignal): Promise<AgendaData> {
  const responses = await Promise.all([
    fetch("/api/appointments", { signal }),
    fetch("/api/professionals", { signal }),
    fetch("/api/insurance-plans", { signal }),
    fetch("/api/procedures/not-offered", { signal }),
  ]);
  if (responses.some((response) => response.status === 401)) throw new Error("UNAUTHORIZED");
  if (responses.some((response) => !response.ok)) throw new Error("AGENDA_UNAVAILABLE");
  const [appointments, professionals, plans, procedures] = await Promise.all(responses.map((response) => response.json()));
  return {
    appointments: appointments.appointments ?? [],
    profile: appointments.profile ?? { complete: false, name: null, insurancePlanId: null },
    professionals: professionals.professionals ?? [],
    plans: plans.plans ?? [],
    procedures: procedures.procedures ?? [],
  };
}

export default function AgendaPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [plans, setPlans] = useState<InsurancePlan[]>([]);
  const [notOnlineBookableProcedures, setNotOnlineBookableProcedures] = useState<NotOnlineBookableProcedure[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [availableDays, setAvailableDays] = useState<AvailableDay[]>([]);
  const [availabilityStatus, setAvailabilityStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [availabilityRevision, setAvailabilityRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"agenda" | "booking">("agenda");
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState(() => minimumBookingDate());
  const [selectedTime, setSelectedTime] = useState("");
  const [patientName, setPatientName] = useState("");
  const [insurancePlanId, setInsurancePlanId] = useState("");
  const [partySize, setPartySize] = useState<AppointmentSlotCount>(1);
  const [companionName, setCompanionName] = useState("");

  const bookingPartySize = editing ? partySizeForAppointment(editing) : partySize;
  const visibleDays = availableDays
    .map((day) => ({ ...day, slots: withConsecutiveSlots(day.slots, bookingPartySize) }))
    .filter((day) => day.slots.length > 0);
  const effectiveDate = visibleDays.some((day) => day.date === date) ? date : visibleDays[0]?.date ?? date;
  const slots = visibleDays.find((day) => day.date === effectiveDate)?.slots ?? [];
  const selectedProfessional = professionals.find((professional) => professional.id === professionalId);
  const needsPatientName = !editing && !profile?.name;
  const needsInsurancePlan = !editing && !profile?.insurancePlanId;
  const needsProfile = needsPatientName || needsInsurancePlan;
  const profileInputComplete = (!needsPatientName || patientName.trim().length >= 2) && (!needsInsurancePlan || Boolean(insurancePlanId));

  function applyData(data: AgendaData) {
    setAppointments(data.appointments);
    setProfessionals(data.professionals);
    setPlans(data.plans);
    setNotOnlineBookableProcedures(data.procedures);
    setProfile(data.profile);
    setPatientName(data.profile.name ?? "");
    setInsurancePlanId(data.profile.insurancePlanId ?? "");
    if (data.professionals.length === 1) {
      setProfessionalId((current) => current || data.professionals[0].id);
    }
  }

  async function refresh() {
    try { applyData(await fetchAgendaData()); }
    catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") window.location.assign("/acesso");
      else setNotice("Não foi possível atualizar suas consultas. Tente novamente.");
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetchAgendaData(controller.signal).then(applyData).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof Error && error.message === "UNAUTHORIZED") window.location.assign("/acesso");
      else setNotice("Não foi possível atualizar suas consultas. Tente novamente.");
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!professionalId) return;
    const controller = new AbortController();
    const dates = bookingBusinessDays(new Date(), AVAILABILITY_SEARCH_DAYS).map(localDate);
    const params = new URLSearchParams({ professionalId, dates: dates.join(","), partySize: String(bookingPartySize) });
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setAvailabilityStatus("loading");
      setAvailableDays([]);
      setSelectedTime("");
    });
    void fetch(`/api/availability?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("AVAILABILITY_UNAVAILABLE");
        return response.json();
      })
      .then((body) => {
        const nextDays = (body.days ?? []) as AvailableDay[];
        setAvailableDays(nextDays);
        setDate((current) => nextDays.some((day) => day.date === current) ? current : nextDays[0]?.date ?? minimumBookingDate());
        setAvailabilityStatus("ready");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAvailableDays([]);
        setAvailabilityStatus("error");
      });
    return () => controller.abort();
  }, [professionalId, availabilityRevision, bookingPartySize]);

  function startBooking(item: Appointment | null = null) {
    setEditing(item);
    setPartySize(item ? partySizeForAppointment(item) : 1);
    setCompanionName("");
    setView("booking");
    setSelectedTime("");
    setNotice("");
  }

  async function save() {
    if (!professionalId || !selectedTime || !profileInputComplete || (!editing && partySize === 2 && companionName.trim().length < 2)) return;
    setSaving(true);
    setNotice("");
    try {
      const holdResponse = await fetch("/api/slot-holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalId, date: effectiveDate, time: selectedTime, partySize: bookingPartySize }),
      });
      if (!holdResponse.ok) { setNotice("Esse horário acabou de ficar indisponível. Escolha outro."); return; }
      const { holdId } = await holdResponse.json();
      const response = await fetch(editing ? `/api/appointments/${editing.id}/reschedule` : "/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing
          ? { holdId, date: effectiveDate, time: selectedTime, idempotencyKey: idempotencyKey() }
          : { holdId, professionalId, date: effectiveDate, time: selectedTime, partySize, companionName: partySize === 2 ? companionName.trim() : undefined, patientName: needsPatientName ? patientName.trim() : undefined, insurancePlanId: needsInsurancePlan ? insurancePlanId : undefined, idempotencyKey: idempotencyKey() }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setNotice(body.error === "SLOT_INDISPONIVEL" ? "Esse horário não está mais disponível. Escolha outro." : "Não foi possível confirmar. Confira seus dados e tente novamente.");
        return;
      }
      setNotice(editing ? "Consulta remarcada com sucesso." : "Consulta confirmada com sucesso.");
      setView("agenda");
      setAvailabilityRevision((current) => current + 1);
      await refresh();
    } finally { setSaving(false); }
  }

  async function cancel(item: Appointment) {
    setSaving(true);
    const response = await fetch(`/api/appointments/${item.id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: idempotencyKey() }) });
    setSaving(false);
    setCanceling(null);
    setNotice(response.ok ? "Consulta cancelada." : "Não foi possível cancelar. É preciso ter 24 horas de antecedência.");
    if (response.ok) {
      setAvailabilityRevision((current) => current + 1);
      await refresh();
    }
  }

  async function logout() {
    setSaving(true);
    try { await fetch("/api/auth/logout", { method: "POST" }); }
    finally { window.location.assign("/"); }
  }

  if (view === "booking") return (
    <PortalShell showHeader={false}>
      <section className="booking-screen">
        <button type="button" className="back-link" onClick={() => setView("agenda")}>‹ Voltar</button>
        <p className="eyebrow">{editing ? "Remarcar consulta" : "Nova consulta"}</p>
        <h1>Escolha um horário disponível</h1>
        {notice && <p className="notice" role="status">{notice}</p>}
        {needsProfile && <fieldset className="profile-fields"><legend>Antes de continuar, conte um pouco sobre você</legend>{needsPatientName && <><label htmlFor="patient-name">Nome completo</label><input id="patient-name" value={patientName} onChange={(event) => setPatientName(event.target.value)} placeholder="Como podemos te chamar?" required /></>}{needsInsurancePlan && <><label htmlFor="insurance-plan">Plano odontológico</label><select id="insurance-plan" value={insurancePlanId} onChange={(event) => setInsurancePlanId(event.target.value)} required><option value="">Selecione seu plano</option>{plans.map((plan) => <option value={plan.id} key={plan.id}>{plan.name}</option>)}</select></>}<small>Se tiver dúvidas sobre a cobertura, a equipe confirma antes do atendimento.</small></fieldset>}
        <strong className="booking-label">Profissional</strong>
        <div className="professional-list">{professionals.map((item) => <button type="button" className={`professional-option ${professionalId === item.id ? "chosen" : ""}`} key={item.id} onClick={() => setProfessionalId(item.id)}><span>{initials(item.name)}</span><i><b>{item.name}</b><small>Atendimento odontológico</small></i><em /></button>)}</div>
        {editing ? <p className="party-summary">Esta consulta reserva {bookingPartySize === 2 ? "dois horários consecutivos (30 minutos)" : "um horário (15 minutos)"}.</p> : <fieldset className="party-fields"><legend>Outra pessoa também vai se consultar junto?</legend><div className="party-options"><button type="button" aria-pressed={partySize === 1} className={partySize === 1 ? "chosen" : ""} onClick={() => { setPartySize(1); setCompanionName(""); setSelectedTime(""); }}>Não, somente eu</button><button type="button" aria-pressed={partySize === 2} className={partySize === 2 ? "chosen" : ""} onClick={() => { setPartySize(2); setSelectedTime(""); }}>Sim, duas pessoas</button></div>{partySize === 2 && <><label htmlFor="companion-name">Nome da segunda pessoa</label><input id="companion-name" value={companionName} onChange={(event) => setCompanionName(event.target.value)} placeholder="Nome completo" minLength={2} maxLength={160} required /><small>Vamos reservar dois horários consecutivos. Esse nome ficará somente no evento desta consulta.</small></>}</fieldset>}
        <strong className="booking-label">Data</strong>
        {availabilityStatus === "idle" && <p className="availability-message">Selecione um profissional para ver as datas disponíveis.</p>}
        {availabilityStatus === "loading" && <p className="availability-message availability-loading" role="status"><i />Buscando os melhores horários…</p>}
        {availabilityStatus === "error" && <p className="availability-message" role="alert">Não foi possível consultar a agenda. <button type="button" className="text-button" onClick={() => setAvailabilityRevision((current) => current + 1)}>Tentar novamente</button></p>}
        {availabilityStatus === "ready" && visibleDays.length === 0 && <p className="availability-message" role="status">{bookingPartySize === 2 ? "Não encontramos dois horários consecutivos livres nas próximas semanas." : "Não encontramos horários livres nas próximas semanas."}</p>}
        {visibleDays.length > 0 && <div className="days">{visibleDays.map((item) => { const itemDate = new Date(`${item.date}T12:00:00-03:00`); return <button type="button" className={effectiveDate === item.date ? "chosen" : ""} key={item.date} onClick={() => { setDate(item.date); setSelectedTime(""); }}><small>{new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(itemDate).replace(".", "")}</small><b>{itemDate.getDate()}</b></button>; })}</div>}
        <strong className="booking-label">Horários disponíveis</strong>
        <div className="slot-grid">{slots.map((slot) => { const value = hour(slot.startAt); return <button type="button" className={selectedTime === value ? "slot selected" : "slot"} onClick={() => setSelectedTime(value)} key={slot.startAt}>{value}</button>; })}</div>
        {selectedTime && <p className="notice">{selectedProfessional?.name} · {selectedTime} · {bookingPartySize === 2 ? "2 pessoas · 30 minutos" : "15 minutos"}</p>}
        {notOnlineBookableProcedures.length > 0 && <aside className="booking-limitations" aria-labelledby="booking-limitations-title"><h2 id="booking-limitations-title">Antes de confirmar</h2><p>Estes atendimentos não são marcados diretamente pelo portal:</p><ul>{notOnlineBookableProcedures.map((procedure) => <li key={procedure.id}><b>{procedure.name}</b>{procedure.description && <span>{procedure.description}</span>}</li>)}</ul><p>Se precisar de um deles, fale com a equipe.</p></aside>}
        <button type="button" className="button booking-confirm" disabled={!selectedTime || saving || !profileInputComplete || (!editing && partySize === 2 && companionName.trim().length < 2)} onClick={() => void save()}>{saving ? "Confirmando…" : editing ? "Confirmar remarcação" : "Confirmar consulta"}</button>
      </section>
    </PortalShell>
  );

  return (
    <PortalShell showHeader={false}>
      <section className="agenda-screen">
        <header><div><p className="eyebrow">Minha agenda</p><h1>Suas consultas</h1></div><button type="button" className="text-button" onClick={() => void logout()} disabled={saving}>Sair</button></header>
        {notice && <p className="notice" role="status">{notice}</p>}
        <div className="appointment-list">{appointments.length === 0 ? <article className="empty"><h2>Nenhuma consulta futura</h2><p>Quando quiser, escolha um horário disponível.</p></article> : appointments.map((item) => { const professional = Array.isArray(item.professionals) ? item.professionals[0]?.name : item.professionals?.name; return <article className="appointment" key={item.id}><b>Consulta odontológica</b><p className="appointment-date">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(item.start_at))}</p><p>{professional ?? "Profissional"}</p>{canceling === item.id ? <div className="cancel-choice"><span>Cancelar esta consulta?</span><button type="button" className="danger text-button" onClick={() => void cancel(item)}>Sim, cancelar</button><button type="button" className="text-button muted" onClick={() => setCanceling(null)}>Manter</button></div> : <div className="appointment-actions"><button type="button" className="text-button" onClick={() => startBooking(item)}>Remarcar</button><button type="button" className="text-button danger" onClick={() => setCanceling(item.id)}>Cancelar</button></div>}</article>; })}</div>
        <button type="button" className="button booking-confirm" onClick={() => startBooking()}>Marcar consulta</button>
      </section>
    </PortalShell>
  );
}
