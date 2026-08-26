"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type Procedure = { id: string; name: string; description: string | null; online_booking: boolean; active: boolean };
type Alias = { id: string; alias: string; active: boolean };
type Coverage = { id: string; procedure_id: string; accepted: boolean; instructions: string | null };
type Plan = { id: string; name: string; instructions: string | null; active: boolean; aliases: Alias[]; coverages: Coverage[] };
type Rule = { id: string; weekday: number; start_time: string; end_time: string; active: boolean };
type AvailabilityException = { id: string; date: string; start_time: string | null; end_time: string | null; type: "available" | "blocked" | "holiday" | "vacation"; description: string | null; active: boolean };
type Professional = { id: string; name: string; calendar_id: string; timezone: string; active: boolean; rules: Rule[]; exceptions: AvailabilityException[] };
type Faq = { id: string; category: string; question: string; answer: string; active: boolean };
type Patient = { id: string; name: string | null; maskedPhone: string; insurancePlanId: string | null; insurancePlanName: string | null; appointmentCount: number; lastAppointmentAt: string | null };
type TeamMember = { user_id: string; email: string | null; role: "owner" | "operator"; active: boolean };
type Audit = { id: string; action: string; entity: string; actor_id: string | null; metadata: { changed_fields?: string[] } | null; created_at: string };
type Snapshot = { procedures: Procedure[]; plans: Plan[]; professionals: Professional[]; faqs: Faq[]; patients: Patient[]; team: TeamMember[]; audits: Audit[] };

const modules = ["Resumo", "Procedimentos", "Planos", "Agenda", "Conteúdo", "Pacientes", "Equipe", "Auditoria"] as const;
const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const errorLabels: Record<string, string> = {
  NOME_JA_CADASTRADO: "Já existe um cadastro com esse nome.",
  ALIAS_DUPLICADO: "Há nomes alternativos repetidos.",
  ALIAS_CONFLITA_COM_PLANO: "Um nome alternativo é igual ao nome de um plano.",
  ALIAS_JA_UTILIZADO: "Um nome alternativo já pertence a outro plano.",
  PLANO_CONFLITA_COM_ALIAS: "O nome do plano já é usado como nome alternativo.",
  CALENDARIO_JA_UTILIZADO: "Essa agenda Google já está vinculada.",
  ULTIMO_PROPRIETARIO_NAO_PODE_SER_REVOGADO: "O último proprietário ativo não pode ser revogado.",
  NAO_E_POSSIVEL_REVOGAR_O_PROPRIO_ACESSO: "Você não pode revogar ou rebaixar o próprio acesso.",
  INTERNAL_FORBIDDEN: "Seu perfil não pode executar essa alteração.",
  REQUISICAO_INVALIDA: "Revise os campos informados.",
};

function timeLabel(value: string | null) { return value ? value.slice(0, 5) : ""; }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(`${value}T12:00:00-03:00`)); }

export function AdminManagement({ canManage }: { canManage: boolean }) {
  const [module, setModule] = useState<(typeof modules)[number]>("Resumo");
  const [data, setData] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Carregando gestão…");
  const [messageTone, setMessageTone] = useState<"neutral" | "success" | "error">("neutral");
  const [confirm, setConfirm] = useState<{ title: string; body: string; onConfirm: () => void } | null>(null);
  const [pendingInvite, setPendingInvite] = useState<{ email: string; role: "owner" | "operator" } | null>(null);
  const [pendingInviteNonce, setPendingInviteNonce] = useState(0);

  const load = useCallback(async (patientSearch = "", preserveMessage = false) => {
    try {
      const query = patientSearch ? `?patientSearch=${encodeURIComponent(patientSearch)}` : "";
      const response = await fetch(`/api/admin/management${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível carregar a gestão.");
      const body = await response.json();
      setData(body.management);
      if (!preserveMessage) { setMessage(""); setMessageTone("neutral"); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gestão indisponível."); setMessageTone("error"); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/management", { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("Não foi possível carregar a gestão."); return response.json(); })
      .then((body) => { if (!cancelled) { setData(body.management); setMessage(""); setMessageTone("neutral"); } })
      .catch((error) => { if (!cancelled) { setMessage(error instanceof Error ? error.message : "Gestão indisponível."); setMessageTone("error"); } });
    return () => { cancelled = true; };
  }, []);

  async function command(payload: Record<string, unknown>, success: string) {
    setBusy(true); setMessage(""); setMessageTone("neutral");
    try {
      const response = await fetch("/api/admin/management", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(errorLabels[body.error] ?? `Não foi possível salvar. Código: ${body.error ?? response.status}`);
      setMessage(success);
      setMessageTone("success");
      await load("", true);
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar."); setMessageTone("error"); return false; }
    finally { setBusy(false); }
  }

  return <section className="management-shell">
    <header className="management-heading"><div><h2>Central de gestão</h2><p>{canManage ? "As alterações refletem no portal, na agenda e no WhatsApp" : "Consulta dos cadastros da clínica"}</p></div><button type="button" className="management-refresh" disabled={busy} onClick={() => void load()}><span aria-hidden="true">↻</span> Atualizar</button></header>
    <div className="management-workspace">
      <nav className="management-tabs" role="tablist" aria-label="Módulos de gestão">{modules.map((item) => {
        const panelId = `management-panel-${item.toLowerCase()}`;
        const tabId = `management-tab-${item.toLowerCase()}`;
        return <button type="button" id={tabId} role="tab" aria-selected={module === item} aria-controls={panelId} tabIndex={module === item ? 0 : -1} className={module === item ? "active" : ""} onClick={() => setModule(item)} key={item} onKeyDown={(event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
          event.preventDefault();
          const currentIndex = modules.indexOf(module);
          const nextIndex = event.key === "ArrowRight" ? (currentIndex + 1) % modules.length : event.key === "ArrowLeft" ? (currentIndex - 1 + modules.length) % modules.length : event.key === "Home" ? 0 : modules.length - 1;
          setModule(modules[nextIndex]);
          requestAnimationFrame(() => { const el = document.getElementById(`management-tab-${modules[nextIndex].toLowerCase()}`); el?.focus(); });
        }}><span>{item.charAt(0)}</span>{item}</button>;
      })}</nav>
      <div className="management-content" role="tabpanel" id={`management-panel-${module.toLowerCase()}`} aria-labelledby={`management-tab-${module.toLowerCase()}`}>
        {message && <p className={`management-message ${messageTone}`} role={messageTone === "error" ? "alert" : "status"} aria-live="polite">{message}</p>}
        {!data ? <div className="management-loading" role="status"><i aria-hidden="true" /><span>Carregando os dados da clínica…</span></div> : <>
          {module === "Resumo" && <Summary data={data} canManage={canManage} />}
          {module === "Procedimentos" && <Procedures procedures={data.procedures} canManage={canManage} busy={busy} command={command} />}
          {module === "Planos" && <Plans plans={data.plans} procedures={data.procedures} canManage={canManage} busy={busy} command={command} />}
          {module === "Agenda" && <AgendaManagement key={JSON.stringify(data.professionals)} professionals={data.professionals} canManage={canManage} busy={busy} command={command} />}
          {module === "Conteúdo" && <Faqs faqs={data.faqs} canManage={canManage} busy={busy} command={command} />}
          {module === "Pacientes" && <Patients key={JSON.stringify(data.patients)} patients={data.patients} plans={data.plans} busy={busy} command={command} onSearch={(value) => load(value)} />}
          {module === "Equipe" && <Team team={data.team} canManage={canManage} busy={busy} command={command} onConfirm={(title, body, onConfirm) => setConfirm({ title, body, onConfirm })} onInvite={(email, role) => setPendingInvite({ email, role })} inviteNonce={pendingInviteNonce} />}
          {module === "Auditoria" && <AuditTrail audits={data.audits} team={data.team} />}
        </>}
      </div>
    </div>
    {(confirm || pendingInvite) && <div className="ops-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="management-confirm-title">
      <div className="ops-inline-confirm">
        {confirm && (
          <>
            <p><b id="management-confirm-title">{confirm.title}</b><span>{confirm.body}</span></p>
            <div>
              <button type="button" className="text-button" onClick={() => setConfirm(null)}>Cancelar</button>
              <button type="button" className="button" onClick={() => { confirm.onConfirm(); setConfirm(null); }} autoFocus>Confirmar</button>
            </div>
          </>
        )}
        {pendingInvite && (
          <>
            <p><b id="management-confirm-title">Enviar convite para {pendingInvite.email}?</b><span>A pessoa receberá um e-mail real pelo Supabase Auth como {pendingInvite.role === "owner" ? "proprietário" : "operador"}.</span></p>
            <div>
              <button type="button" className="text-button" onClick={() => setPendingInvite(null)}>Cancelar</button>
              <button type="button" className="button" onClick={() => { void command({ action: "invite_access", email: pendingInvite.email, role: pendingInvite.role }, "Convite processado.").then((ok) => { if (ok) setPendingInviteNonce((current) => current + 1); }); setPendingInvite(null); }} autoFocus>Enviar convite</button>
            </div>
          </>
        )}
      </div>
    </div>}
  </section>;
}

function Summary({ data, canManage }: { data: Snapshot; canManage: boolean }) {
  const issues = [
    ...data.procedures.filter((item) => !item.description).map((item) => `Procedimento sem orientação: ${item.name}`),
    ...data.plans.filter((item) => item.active && !item.instructions).map((item) => `Plano sem instrução: ${item.name}`),
    ...data.professionals.filter((item) => item.active && item.rules.filter((rule) => rule.active).length === 0).map((item) => `Profissional sem horário ativo: ${item.name}`),
  ];
  return <div className="management-summary">
    <div className="management-kpis"><b>{data.procedures.filter((item) => item.active).length}<small>procedimentos ativos</small></b><b>{data.plans.filter((item) => item.active).length}<small>planos ativos</small></b><b>{data.professionals.filter((item) => item.active).length}<small>profissionais</small></b><b>{issues.length}<small>pontos para revisar</small></b></div>
    <article className="management-card"><h3>Estado da configuração</h3>{issues.length ? <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p>Cadastros essenciais preenchidos.</p>} {!canManage && <p className="management-note">Seu acesso é somente leitura para configurações.</p>}</article>
  </div>;
}

function Procedures({ procedures, canManage, busy, command }: { procedures: Procedure[]; canManage: boolean; busy: boolean; command: (payload: Record<string, unknown>, success: string) => Promise<boolean> }) {
  const empty = { id: "", name: "", description: "", onlineBooking: true, active: true };
  const [form, setForm] = useState(empty);
  function edit(item: Procedure) { setForm({ id: item.id, name: item.name, description: item.description ?? "", onlineBooking: item.online_booking, active: item.active }); }
  async function submit(event: FormEvent) { event.preventDefault(); if (await command({ action: "save_procedure", id: form.id || undefined, name: form.name, description: form.description || null, onlineBooking: form.onlineBooking, active: form.active }, "Procedimento salvo.")) setForm(empty); }
  return <div className="management-grid"><article className="management-card"><h3>Procedimentos</h3><div className="management-list">{procedures.map((item) => <button type="button" className="management-row" onClick={() => edit(item)} key={item.id}><span><b>{item.name}</b><small>{item.description || "Sem orientação"}</small></span><em className={item.active ? "on" : "off"}>{item.active ? item.online_booking ? "avaliação online" : "orientação" : "inativo"}</em></button>)}</div></article>{canManage && <form className="management-card management-form" onSubmit={(event) => void submit(event)}><h3>{form.id ? "Editar procedimento" : "Novo procedimento"}</h3><label>Nome<input required maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Orientação<textarea maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label className="management-check"><input type="checkbox" checked={form.onlineBooking} onChange={(event) => setForm({ ...form, onlineBooking: event.target.checked })} /> Pode iniciar avaliação pelo portal</label><label className="management-check"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Ativo</label><div className="management-actions"><button type="submit" disabled={busy}>Salvar</button><button type="button" onClick={() => setForm(empty)}>Limpar</button></div><div className="management-preview"><b>Prévia para o paciente</b><p>{form.name || "Procedimento"}: {form.description || "Consulte a equipe para detalhes."}</p></div></form>}</div>;
}

function Plans({ plans, procedures, canManage, busy, command }: { plans: Plan[]; procedures: Procedure[]; canManage: boolean; busy: boolean; command: (payload: Record<string, unknown>, success: string) => Promise<boolean> }) {
  const empty = { id: "", name: "", instructions: "", aliases: "", active: true };
  const [form, setForm] = useState(empty);
  const selected = plans.find((item) => item.id === form.id) ?? null;
  function edit(item: Plan) { setForm({ id: item.id, name: item.name, instructions: item.instructions ?? "", aliases: item.aliases.filter((alias) => alias.active).map((alias) => alias.alias).join("\n"), active: item.active }); }
  async function submit(event: FormEvent) { event.preventDefault(); const aliases = form.aliases.split("\n").map((item) => item.trim()).filter(Boolean); if (await command({ action: "save_plan", id: form.id || undefined, name: form.name, instructions: form.instructions || null, active: form.active, aliases }, "Plano salvo.")) setForm(empty); }
  return <div className="management-grid"><article className="management-card"><h3>Planos e convênios</h3><div className="management-list">{plans.map((item) => <button type="button" className="management-row" onClick={() => edit(item)} key={item.id}><span><b>{item.name}</b><small>{item.aliases.filter((alias) => alias.active).map((alias) => alias.alias).join(", ") || "Sem nomes alternativos"}</small></span><em className={item.active ? "on" : "off"}>{item.active ? "ativo" : "inativo"}</em></button>)}</div></article>{canManage && <form className="management-card management-form" onSubmit={(event) => void submit(event)}><h3>{form.id ? "Editar plano" : "Novo plano"}</h3><label>Nome<input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Instruções<textarea maxLength={2000} value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} /></label><label>Nomes alternativos, um por linha<textarea value={form.aliases} onChange={(event) => setForm({ ...form, aliases: event.target.value })} /></label><label className="management-check"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Ativo</label><div className="management-actions"><button type="submit" disabled={busy}>Salvar plano</button><button type="button" onClick={() => setForm(empty)}>Novo</button></div></form>}{selected && <article className="management-card management-span"><h3>Cobertura de {selected.name}</h3><p className="management-note">Matriz gerencial; não agenda procedimento específico.</p><div className="coverage-list">{procedures.map((procedure) => { const coverage = selected.coverages.find((item) => item.procedure_id === procedure.id); return <CoverageEditor key={`${procedure.id}:${coverage?.id ?? "new"}:${coverage?.accepted ?? false}:${coverage?.instructions ?? ""}`} procedure={procedure} coverage={coverage} planId={selected.id} canManage={canManage} busy={busy} command={command} />; })}</div></article>}</div>;
}

function CoverageEditor({ procedure, coverage, planId, canManage, busy, command }: { procedure: Procedure; coverage?: Coverage; planId: string; canManage: boolean; busy: boolean; command: (payload: Record<string, unknown>, success: string) => Promise<boolean> }) {
  const [accepted, setAccepted] = useState(coverage?.accepted ?? false);
  const [instructions, setInstructions] = useState(coverage?.instructions ?? "");
  return <div className="coverage-row"><label className="management-check"><input type="checkbox" checked={accepted} disabled={!canManage} onChange={(event) => setAccepted(event.target.checked)} /><b>{procedure.name}</b></label><input aria-label={`Orientação para ${procedure.name}`} placeholder="Orientação da cobertura" value={instructions} disabled={!canManage} onChange={(event) => setInstructions(event.target.value)} />{canManage && <button type="button" disabled={busy} onClick={() => void command({ action: "save_coverage", procedureId: procedure.id, insurancePlanId: planId, accepted, instructions: instructions || null }, "Cobertura salva.")}>Salvar</button>}</div>;
}

type SchedulePeriod = { start: string; end: string };

function scheduleFor(professional: Professional | null | undefined): Record<number, SchedulePeriod[]> {
  const next: Record<number, SchedulePeriod[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  if (!professional) return next;
  for (const rule of professional.rules.filter((rule) => rule.active)) {
    next[rule.weekday].push({ start: timeLabel(rule.start_time), end: timeLabel(rule.end_time) });
  }
  return next;
}

function AgendaManagement({ professionals, canManage, busy, command }: { professionals: Professional[]; canManage: boolean; busy: boolean; command: (payload: Record<string, unknown>, success: string) => Promise<boolean> }) {
  const emptyProfessional = { id: "", name: "", calendarId: "", active: true };
  const [professionalForm, setProfessionalForm] = useState(emptyProfessional);
  const [selectedId, setSelectedId] = useState(professionals[0]?.id ?? "");
  const selected = professionals.find((item) => item.id === selectedId) ?? professionals[0] ?? null;
  const [schedule, setSchedule] = useState<Record<number, SchedulePeriod[]>>(() => scheduleFor(selected));
  const emptyException = { id: "", date: "", startTime: "", endTime: "", type: "blocked" as AvailabilityException["type"], description: "", active: true };
  const [exceptionForm, setExceptionForm] = useState(emptyException);

  function editProfessional(item: Professional) { setProfessionalForm({ id: item.id, name: item.name, calendarId: item.calendar_id, active: item.active }); setSelectedId(item.id); setSchedule(scheduleFor(item)); }
  async function saveProfessional(event: FormEvent) { event.preventDefault(); if (await command({ action: "save_professional", id: professionalForm.id || undefined, name: professionalForm.name, calendarId: professionalForm.calendarId, active: professionalForm.active }, "Profissional salvo.")) setProfessionalForm(emptyProfessional); }
  async function saveSchedule() {
    const periods = Object.entries(schedule).flatMap(([weekday, list]) => list.filter((period) => period.start && period.end && period.end > period.start).map((period) => ({ weekday: Number(weekday), startTime: period.start, endTime: period.end })));
    await command({ action: "save_schedule", professionalId: selected?.id, periods }, "Horários semanais salvos.");
  }
  function editException(item: AvailabilityException) { setExceptionForm({ id: item.id, date: item.date, startTime: timeLabel(item.start_time), endTime: timeLabel(item.end_time), type: item.type, description: item.description ?? "", active: item.active }); }
  async function saveException(event: FormEvent) { event.preventDefault(); if (!selected) return; if (await command({ action: "save_exception", id: exceptionForm.id || undefined, professionalId: selected.id, date: exceptionForm.date, startTime: exceptionForm.startTime || null, endTime: exceptionForm.endTime || null, type: exceptionForm.type, description: exceptionForm.description || null, active: exceptionForm.active }, "Exceção salva.")) setExceptionForm(emptyException); }
  return <div className="management-grid"><article className="management-card"><h3>Profissionais</h3><div className="management-list">{professionals.map((item) => <button type="button" className="management-row" onClick={() => editProfessional(item)} key={item.id}><span><b>{item.name}</b><small>{item.calendar_id}</small></span><em className={item.active ? "on" : "off"}>{item.active ? "ativo" : "inativo"}</em></button>)}</div></article>{canManage && <form className="management-card management-form" onSubmit={(event) => void saveProfessional(event)}><h3>{professionalForm.id ? "Editar profissional" : "Novo profissional"}</h3><label>Nome<input required value={professionalForm.name} onChange={(event) => setProfessionalForm({ ...professionalForm, name: event.target.value })} /></label><label>ID ou e-mail do Google Calendar<input required value={professionalForm.calendarId} onChange={(event) => setProfessionalForm({ ...professionalForm, calendarId: event.target.value })} /></label><label className="management-check"><input type="checkbox" checked={professionalForm.active} onChange={(event) => setProfessionalForm({ ...professionalForm, active: event.target.checked })} /> Ativo</label><div className="management-actions"><button type="submit" disabled={busy}>Salvar</button><button type="button" onClick={() => setProfessionalForm(emptyProfessional)}>Novo</button></div></form>}{selected && <article className="management-card"><h3>Semana de {selected.name}</h3><p className="management-note">Adicione um ou mais períodos por dia. Início precisa ser menor que o fim.</p><div className="schedule-grid">{weekdays.map((day, index) => { const list = schedule[index] ?? []; return <fieldset key={day} className="schedule-day"><legend>{day}</legend>{list.length === 0 && <p className="management-note">Sem períodos.</p>}{list.map((period, periodIndex) => <div key={periodIndex} className="schedule-period"><label>Início<input disabled={!canManage} type="time" value={period.start} onChange={(event) => { const next = [...list]; next[periodIndex] = { ...period, start: event.target.value }; setSchedule({ ...schedule, [index]: next }); }} /></label><label>Fim<input disabled={!canManage} type="time" value={period.end} onChange={(event) => { const next = [...list]; next[periodIndex] = { ...period, end: event.target.value }; setSchedule({ ...schedule, [index]: next }); }} /></label>{canManage && <button type="button" className="text-button danger" onClick={() => { const next = list.filter((_, position) => position !== periodIndex); setSchedule({ ...schedule, [index]: next }); }}>Remover</button>}</div>)}{canManage && <button type="button" className="management-actions" style={{ width: "100%", justifyContent: "center" }} onClick={() => { const next = [...list, { start: "08:00", end: "12:00" }]; setSchedule({ ...schedule, [index]: next }); }}>Adicionar período</button>}</fieldset>; })}</div>{canManage && <button type="button" className="management-primary" disabled={busy} onClick={() => void saveSchedule()}>Salvar horários</button>}</article>}{selected && <article className="management-card management-form"><h3>Exceções e ausências</h3><div className="management-list">{selected.exceptions.map((item) => <button type="button" className="management-row" onClick={() => editException(item)} key={item.id}><span><b>{formatDate(item.date)} · {item.type}</b><small>{item.description || (item.start_time ? `${timeLabel(item.start_time)}–${timeLabel(item.end_time)}` : "Dia inteiro")}</small></span><em className={item.active ? "on" : "off"}>{item.active ? "ativa" : "inativa"}</em></button>)}</div>{canManage && <form onSubmit={(event) => void saveException(event)}><label>Data<input required type="date" value={exceptionForm.date} onChange={(event) => setExceptionForm({ ...exceptionForm, date: event.target.value })} /></label><label>Tipo<select value={exceptionForm.type} onChange={(event) => setExceptionForm({ ...exceptionForm, type: event.target.value as AvailabilityException["type"] })}><option value="blocked">Bloqueio</option><option value="holiday">Feriado</option><option value="vacation">Férias</option><option value="available">Disponibilidade extra</option></select></label><div className="management-two"><label>Início<input type="time" value={exceptionForm.startTime} onChange={(event) => setExceptionForm({ ...exceptionForm, startTime: event.target.value })} /></label><label>Fim<input type="time" value={exceptionForm.endTime} onChange={(event) => setExceptionForm({ ...exceptionForm, endTime: event.target.value })} /></label></div><label>Descrição<input value={exceptionForm.description} onChange={(event) => setExceptionForm({ ...exceptionForm, description: event.target.value })} /></label><label className="management-check"><input type="checkbox" checked={exceptionForm.active} onChange={(event) => setExceptionForm({ ...exceptionForm, active: event.target.checked })} /> Ativa</label><div className="management-actions"><button type="submit" disabled={busy}>Salvar exceção</button><button type="button" onClick={() => setExceptionForm(emptyException)}>Nova</button></div></form>}</article>}</div>;
}

function Faqs({ faqs, canManage, busy, command }: { faqs: Faq[]; canManage: boolean; busy: boolean; command: (payload: Record<string, unknown>, success: string) => Promise<boolean> }) {
  const empty = { id: "", category: "", question: "", answer: "", active: true };
  const [form, setForm] = useState(empty);
  function edit(item: Faq) { setForm({ id: item.id, category: item.category, question: item.question, answer: item.answer, active: item.active }); }
  async function submit(event: FormEvent) { event.preventDefault(); if (await command({ action: "save_faq", id: form.id || undefined, category: form.category, question: form.question, answer: form.answer, active: form.active }, "Conteúdo salvo.")) setForm(empty); }
  return <div className="management-grid"><article className="management-card"><h3>Perguntas frequentes</h3><div className="management-list">{faqs.map((item) => <button type="button" className="management-row" onClick={() => edit(item)} key={item.id}><span><b>{item.question}</b><small>{item.category}</small></span><em className={item.active ? "on" : "off"}>{item.active ? "ativa" : "inativa"}</em></button>)}</div></article>{canManage && <form className="management-card management-form" onSubmit={(event) => void submit(event)}><h3>{form.id ? "Editar resposta" : "Nova resposta"}</h3><label>Categoria<input required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label><label>Pergunta<textarea required value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value })} /></label><label>Resposta<textarea required value={form.answer} onChange={(event) => setForm({ ...form, answer: event.target.value })} /></label><label className="management-check"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Ativa</label><div className="management-actions"><button type="submit" disabled={busy}>Salvar</button><button type="button" onClick={() => setForm(empty)}>Nova</button></div><div className="management-preview"><b>{form.question || "Pergunta"}</b><p>{form.answer || "A resposta aparecerá aqui."}</p></div></form>}</div>;
}

function Patients({ patients, plans, busy, command, onSearch }: { patients: Patient[]; plans: Plan[]; busy: boolean; command: (payload: Record<string, unknown>, success: string) => Promise<boolean>; onSearch: (value: string) => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const selected = patients.find((item) => item.id === selectedId) ?? null;
  const [name, setName] = useState("");
  const [planId, setPlanId] = useState("");
  const filtered = useMemo(() => patients.filter((item) => `${item.name ?? ""} ${item.maskedPhone} ${item.insurancePlanName ?? ""}`.toLowerCase().includes(search.toLowerCase())), [patients, search]);
  return <div className="management-grid"><article className="management-card"><h3>Pacientes</h3><form className="management-patient-search" onSubmit={(event) => { event.preventDefault(); void onSearch(search); }}><label className="management-search">Buscar no cadastro<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou telefone" /></label><button type="submit">Buscar</button></form><div className="management-list">{filtered.map((item) => <button type="button" className="management-row" onClick={() => { setSelectedId(item.id); setName(item.name ?? ""); setPlanId(item.insurancePlanId ?? ""); }} key={item.id}><span><b>{item.name || "Paciente sem nome"}</b><small>{item.maskedPhone} · {item.insurancePlanName || "Sem plano"}</small></span><em>{item.appointmentCount} consulta(s)</em></button>)}</div></article>{selected && <form className="management-card management-form" onSubmit={(event) => { event.preventDefault(); void command({ action: "save_patient", id: selected.id, name: name || null, insurancePlanId: planId || null }, "Paciente atualizado."); }}><h3>Corrigir cadastro</h3><p className="management-note">Telefone {selected.maskedPhone}. A identidade telefônica não pode ser alterada aqui.</p><label>Nome<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Plano<select value={planId} onChange={(event) => setPlanId(event.target.value)}><option value="">Sem plano</option>{plans.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><button type="submit" className="management-primary" disabled={busy}>Salvar paciente</button></form>}</div>;
}

function Team({ team, canManage, busy, command, onConfirm, onInvite, inviteNonce }: { team: TeamMember[]; canManage: boolean; busy: boolean; command: (payload: Record<string, unknown>, success: string) => Promise<boolean>; onConfirm: (title: string, body: string, onConfirm: () => void) => void; onInvite: (email: string, role: "owner" | "operator") => void; inviteNonce: number }) {
  const [email, setEmail] = useState(""); const [role, setRole] = useState<"owner" | "operator">("operator");
  useEffect(() => { setEmail(""); }, [inviteNonce]);
  return <div className="management-grid"><article className="management-card"><h3>Equipe interna</h3><div className="management-list">{team.map((item) => <div className="management-row management-member" key={item.user_id}><span><b>{item.email || item.user_id}</b><small>{item.role === "owner" ? "Proprietário" : "Operador"}</small></span><em className={item.active ? "on" : "off"}>{item.active ? "ativo" : "revogado"}</em>{canManage && <div className="member-actions"><button type="button" disabled={busy} onClick={() => void command({ action: "save_access", userId: item.user_id, role: item.role === "owner" ? "operator" : "owner", active: item.active }, "Papel atualizado.")}>Tornar {item.role === "owner" ? "operador" : "proprietário"}</button><button type="button" disabled={busy} onClick={() => onConfirm(item.active ? "Revogar este acesso?" : "Reativar este acesso?", item.email ?? item.user_id, () => void command({ action: "save_access", userId: item.user_id, role: item.role, active: !item.active }, "Acesso atualizado."))}>{item.active ? "Revogar" : "Reativar"}</button></div>}</div>)}</div></article>{canManage && <form className="management-card management-form" onSubmit={(event) => { event.preventDefault(); onInvite(email, role); }}><h3>Convidar pessoa</h3><p className="management-note">Esta ação envia um e-mail real pelo Supabase Auth.</p><label>E-mail<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Papel<select value={role} onChange={(event) => setRole(event.target.value as "owner" | "operator")}><option value="operator">Operador</option><option value="owner">Proprietário</option></select></label><button type="submit" className="management-primary" disabled={busy}>Enviar convite</button></form>}</div>;
}

function AuditTrail({ audits, team }: { audits: Audit[]; team: TeamMember[] }) {
  const actor = (id: string | null) => team.find((item) => item.user_id === id)?.email ?? id ?? "Sistema";
  return <article className="management-card"><h3>Alterações recentes</h3><div className="audit-list">{audits.length === 0 ? <p>Nenhuma alteração de gestão registrada.</p> : audits.map((item) => <div key={item.id}><b>{item.entity} · {item.action}</b><p>{item.metadata?.changed_fields?.join(", ") || "sem campos informados"}</p><small>{actor(item.actor_id)} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(item.created_at))}</small></div>)}</div></article>;
}
