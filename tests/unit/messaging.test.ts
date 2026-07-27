import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyIntent, isExplicitHumanRequest } from "@/domain/messaging/intent";
import { appointmentConfirmationRequestInteractiveMessage, appointmentMessage, dailyConfirmationSummaryMessage, isAutomatedReplyEcho, menuActions, otpMessage } from "@/domain/messaging/templates";
import { findStructuredAnswer } from "@/domain/knowledge/service";
import { encryptOtp, decryptOtp } from "@/lib/messaging/otp-cipher";
import { signEvolutionPayload, verifyEvolutionApiKey, verifyEvolutionSignature } from "@/integrations/evolution/signature";
import { evolutionWebhookSchema, normalizeIncomingMessage } from "@/integrations/evolution/contract";
import { EvolutionApiError, EvolutionClient } from "@/integrations/evolution/client";
import { withBoundedRetry } from "@/lib/reliability/retry";
import { MessagingWorker } from "../../worker/index";

describe("messaging", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("classifies scheduling and stable menu actions without ever selecting a slot", () => { expect(classifyIntent("Quero remarcar meu horário")).toBe("reschedule"); expect(classifyIntent("Vocês aceitam Unimed?")).toBe("insurance"); expect(classifyIntent(menuActions.agenda)).toBe("schedule"); expect(classifyIntent(menuActions.handoff)).toBe("human"); expect(classifyIntent("texto sem correspondência")).toBe("human"); });
  it("recognizes explicit requests for human service without treating every unknown question as one", () => { expect(isExplicitHumanRequest("Quero falar com a doutora")).toBe(true); expect(isExplicitHumanRequest("Pode me transferir para um atendente?")).toBe(true); expect(isExplicitHumanRequest("A clínica tem estacionamento?")).toBe(false); });
  it("classifies textual and interactive attendance confirmations", () => { expect(classifyIntent("Confirmo")).toBe("confirm"); expect(classifyIntent("Vou comparecer")).toBe("confirm"); expect(classifyIntent(menuActions.appointmentConfirm)).toBe("confirm"); });
  it("resolves only active structured data supplied by the repository", () => { const answer = findStructuredAnswer("Vocês aceitam meu plano uni?", { plans: [{ id: "1", name: "Unimed", instructions: "Leve a carteirinha." }], aliases: [{ alias: "uni", insurance_plan_id: "1" }], procedures: [], faqs: [] }); expect(answer).toContain("Unimed"); expect(answer).toContain("carteirinha"); });
  it("returns null when knowledge has no safe match", () => { expect(findStructuredAnswer("Qual o preço secreto?", { plans: [], aliases: [], procedures: [], faqs: [] })).toBeNull(); });
  it("encrypts OTP at rest and rejects a wrong key", () => { const secret = "a".repeat(32), encrypted = encryptOtp("123456", secret); expect(encrypted).not.toContain("123456"); expect(decryptOtp(encrypted, secret)).toBe("123456"); expect(() => decryptOtp(encrypted, "b".repeat(32))).toThrow(); });
  it("accepts only explicit inbound Evolution events", () => { const inbound = evolutionWebhookSchema.parse({ event: "messages.upsert", apikey: "evo-key", data: { key: { id: "evt-1", remoteJid: "5513999999999@s.whatsapp.net", fromMe: false }, message: { conversation: "Olá" } } }); expect(normalizeIncomingMessage(inbound)).toEqual({ externalId: "evt-1", phone: "5513999999999", text: "Olá" }); const outbound = evolutionWebhookSchema.parse({ event: "messages.upsert", apikey: "evo-key", data: { key: { id: "evt-2", remoteJid: "5513999999999@s.whatsapp.net", fromMe: true }, message: { conversation: "Resposta" } } }); expect(normalizeIncomingMessage(outbound)).toBeNull(); });
  it("normalizes button, list and native-flow replies to stable actions", () => {
    const base = { event: "messages.upsert", apikey: "evo-key", data: { key: { remoteJid: "5513999999999@s.whatsapp.net", fromMe: false } } };
    const button = evolutionWebhookSchema.parse({ ...base, data: { ...base.data, key: { ...base.data.key, id: "button-1" }, message: { buttonsResponseMessage: { selectedButtonId: menuActions.agenda, selectedDisplayText: "Agendar" } } } });
    const list = evolutionWebhookSchema.parse({ ...base, data: { ...base.data, key: { ...base.data.key, id: "list-1" }, message: { listResponseMessage: { singleSelectReply: { selectedRowId: menuActions.insurance } } } } });
    const flow = evolutionWebhookSchema.parse({ ...base, data: { ...base.data, key: { ...base.data.key, id: "flow-1" }, message: { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: JSON.stringify({ id: menuActions.handoff }) } } } } });
    expect(normalizeIncomingMessage(button)?.text).toBe(menuActions.agenda);
    expect(normalizeIncomingMessage(list)?.text).toBe(menuActions.insurance);
    expect(normalizeIncomingMessage(flow)?.text).toBe(menuActions.handoff);
  });
  it("turns unsupported inbound media into an actionable response instead of dropping it", () => {
    const media = evolutionWebhookSchema.parse({ event: "messages.upsert", apikey: "evo-key", data: { key: { id: "audio-1", remoteJid: "5513999999999@s.whatsapp.net", fromMe: false }, message: { audioMessage: { mimetype: "audio/ogg" } } } });
    expect(normalizeIncomingMessage(media)?.text).toBe(menuActions.unsupportedMedia);
  });
  it("rejects webhook events missing direction and known bot echoes", () => { const missingDirection = evolutionWebhookSchema.parse({ event: "messages.upsert", apikey: "evo-key", data: { key: { id: "evt-3", remoteJid: "5513999999999@s.whatsapp.net" }, message: { conversation: "Olá" } } }); expect(normalizeIncomingMessage(missingDirection)).toBeNull(); expect(isAutomatedReplyEcho("Olá! Sou a assistente virtual da Luna 😊")).toBe(true); });
  it("validates webhook authentication", () => { const body = '{"ok":true}', secret = "secret", signature = signEvolutionPayload(body, secret); expect(verifyEvolutionSignature(body, signature, secret)).toBe(true); expect(verifyEvolutionSignature(`${body}x`, signature, secret)).toBe(false); expect(verifyEvolutionApiKey("evo-key", "evo-key")).toBe(true); expect(verifyEvolutionApiKey("wrong", "evo-key")).toBe(false); });
  it("isolates text and interactive Evolution API contracts", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    const client = new EvolutionClient({ baseUrl: "https://evolution.test", apiKey: "key", instance: "luna" }, fetcher);
    await client.sendText("5513999999999", "Mensagem");
    await client.sendButtons("5513999999999", { title: "Como ajudar?", description: "Escolha", buttons: [{ type: "reply", id: menuActions.agenda, displayText: "Agendar" }] });
    expect(fetcher).toHaveBeenNthCalledWith(1, "https://evolution.test/message/sendText/luna", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "https://evolution.test/message/sendButtons/luna", expect.objectContaining({ method: "POST", body: expect.stringContaining(menuActions.agenda) }));
    const failing = new EvolutionClient({ baseUrl: "https://evolution.test", apiKey: "key", instance: "luna" }, vi.fn().mockResolvedValue(new Response(null, { status: 400 })));
    await expect(failing.sendText("5513999999999", "Mensagem")).rejects.toBeInstanceOf(EvolutionApiError);
  });
  it("retries only bounded transient failures with jitter", async () => {
    const operation = vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(withBoundedRetry(operation, { maxAttempts: 3, baseDelayMs: 10, isRetryable: () => true, sleep, random: () => 0 })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2); expect(sleep).toHaveBeenCalledWith(5);
  });
  it("uses scannable safe templates without clinical details", () => { expect(otpMessage("123456")).toContain("*123456*"); expect(appointmentMessage("appointment.cancelled", "2026-07-20T12:00:00Z")).toContain("Consulta cancelada"); expect(appointmentMessage("appointment.created", "2026-07-24T17:30:00Z")).toContain("14h30"); });
  it("offers one-tap attendance confirmation with a textual fallback", () => {
    const message = appointmentConfirmationRequestInteractiveMessage("2099-07-28T13:00:00Z", "https://agenda.example/acesso#token=abc", "Dra. Priscila");
    expect(message.buttons).toContainEqual(expect.objectContaining({ type: "reply", id: menuActions.appointmentConfirm, displayText: "Sim, confirmo" }));
    expect(message.fallbackText).toMatch(/Responda \*CONFIRMO\*[\s\S]*agenda\.example/);
  });
  it("formats the doctor summary with confirmed totals and readable pending contacts", () => {
    const message = dailyConfirmationSummaryMessage({ summary_date: "2026-07-28", total: 3, confirmed: 1, unconfirmed: [{ name: "Ana Souza", phone: "5513999999999", start_at: "2026-07-28T12:00:00Z" }, { name: "Bruno Lima", phone: "5513988887777", start_at: "2026-07-28T13:00:00Z" }] });
    expect(message).toMatch(/1 de 3[\s\S]*Ana Souza[\s\S]*\+55 \(13\) 99999-9999[\s\S]*Bruno Lima/);
    expect(dailyConfirmationSummaryMessage({ summary_date: "2026-07-28", total: 0, confirmed: 0, unconfirmed: [] })).toContain("0 de 0");
  });
  it("exposes health state and stops safely", () => { const worker = new MessagingWorker({} as never, {} as never, { pollMs: 100, healthPort: 3001 } as never); expect(worker.healthy()).toBe(true); worker.stop(); expect(worker.healthy()).toBe(false); });
  it("persists an allowed action after sending a scheduling reply", async () => {
    const updates: Record<string, unknown>[] = [];
    const db = {
      from: (table: string) => table === "access_tokens"
        ? { insert: vi.fn().mockResolvedValue({ error: null }) }
        : { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) },
    };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { portalBaseUrl: "https://agenda.example", openaiModel: "gpt-4o-mini", pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000001", phone: "5513999999999", message_text: "quero marcar", attempts: 1 });
    expect(evolution.sendText).toHaveBeenCalledTimes(1);
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("https://agenda.example/acesso#token="));
    expect(evolution.sendText).not.toHaveBeenCalledWith("5513999999999", expect.stringContaining("/api/auth/link?token="));
    expect(updates).toContainEqual(expect.objectContaining({ status: "processed", classified_intent: "schedule", processed_action: "portal_link" }));
  });
  it("sends the greeting as interactive buttons when the feature is enabled", async () => {
    const updates: Record<string, unknown>[] = [];
    const db = { from: () => ({ update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) }) };
    const evolution = { sendText: vi.fn(), sendButtons: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { interactiveMessages: true, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000006", phone: "5513999999999", message_text: "oi", attempts: 1 });
    expect(evolution.sendButtons).toHaveBeenCalledWith("5513999999999", expect.objectContaining({ buttons: expect.arrayContaining([expect.objectContaining({ id: menuActions.agenda })]) }));
    expect(evolution.sendText).not.toHaveBeenCalled();
    expect(updates).toContainEqual(expect.objectContaining({ classified_intent: "greeting" }));
  });
  it("falls back to text when the interactive endpoint fails", async () => {
    const db = { from: () => ({ update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined), sendButtons: vi.fn().mockRejectedValue(new Error("buttons unavailable")) };
    const worker = new MessagingWorker(db as never, evolution as never, { interactiveMessages: true, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000007", phone: "5513999999999", message_text: "oi", attempts: 1 });
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("Como posso ajudar?"));
  });
  it("persists a handoff whenever the structured OpenAI reply requires one", async () => {
    const updates: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockResolvedValue({ data: "00000000-0000-4000-8000-000000000099", error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message: "A equipe precisa confirmar esse valor e continuará por aqui.", handoff_required: true }) }] }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const knowledgeTable = () => ({ select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) });
    const db = { rpc, from: (table: string) => {
      if (["insurance_plans", "procedures", "faq_entries"].includes(table)) return knowledgeTable();
      if (table === "insurance_aliases") return knowledgeTable();
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { openaiApiKey: "test-key", openaiModel: "gpt-4o-mini", pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000008", phone: "5513999999999", message_text: "Qual o preço do clareamento?", attempts: 1 });
    expect(rpc).toHaveBeenCalledWith("enqueue_human_handoff", expect.objectContaining({ p_phone: "5513999999999", p_reason: "Qual o preço do clareamento?" }));
    expect(updates).toContainEqual(expect.objectContaining({ processed_action: "handoff" }));
  });
  it("answers a safe OpenAI response without notifying the doctor", async () => {
    const updates: Record<string, unknown>[] = [];
    const rpc = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message: "Sim, a clínica possui estacionamento.", handoff_required: false }) }] }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const knowledgeTable = (data: unknown[] = []) => ({ select: () => ({ eq: vi.fn().mockResolvedValue({ data, error: null }) }) });
    const db = { rpc, from: (table: string) => {
      if (table === "faq_entries") return knowledgeTable([{ question: "A clínica tem estacionamento?", answer: "Sim, temos estacionamento." }]);
      if (["insurance_plans", "insurance_aliases", "procedures"].includes(table)) return knowledgeTable();
      if (table === "access_tokens") return { insert: vi.fn().mockResolvedValue({ error: null }) };
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { openaiApiKey: "test-key", openaiModel: "gpt-4o-mini", pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000010", phone: "5513999999999", message_text: "A clínica tem estacionamento?", attempts: 1 });
    expect(rpc).not.toHaveBeenCalled();
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("estacionamento"));
    expect(updates).toContainEqual(expect.objectContaining({ processed_action: "llm_answer" }));
  });
  it("forces a handoff when OpenAI claims an answer that is not grounded in clinic knowledge", async () => {
    const updates: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockResolvedValue({ data: "00000000-0000-4000-8000-000000000099", error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message: "Uma resposta genérica não cadastrada.", handoff_required: false }) }] }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const knowledgeTable = () => ({ select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) });
    const db = { rpc, from: (table: string) => {
      if (["insurance_plans", "insurance_aliases", "procedures", "faq_entries"].includes(table)) return knowledgeTable();
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { openaiApiKey: "test-key", openaiModel: "gpt-4o-mini", pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000011", phone: "5513999999999", message_text: "Uma dúvida que não está cadastrada", attempts: 1 });
    expect(rpc).toHaveBeenCalledWith("enqueue_human_handoff", expect.objectContaining({ p_phone: "5513999999999" }));
    expect(evolution.sendText).not.toHaveBeenCalledWith("5513999999999", expect.stringContaining("resposta genérica"));
    expect(updates).toContainEqual(expect.objectContaining({ processed_action: "handoff" }));
  });
  it("delivers an idempotently queued handoff alert to the configured doctor number", async () => {
    const updates: Record<string, unknown>[] = [];
    const db = { from: (table: string) => {
      if (table === "human_handoffs") return { select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: { phone: "5513999999999", reason: "Dor forte desde ontem" }, error: null }) }) }) };
      if (table === "patients") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { name: "Ana Souza" }, error: null }) }) }) };
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { handoffNotificationPhone: "5513988887777", recipientPolicy: "all", pollMs: 100, healthPort: 3001 } as never);
    await worker.processOutbox({ id: "00000000-0000-4000-8000-000000000090", aggregate_id: "00000000-0000-4000-8000-000000000091", event_type: "human_handoff.created", attempts: 1 });
    expect(evolution.sendText).toHaveBeenCalledWith("5513988887777", expect.stringMatching(/Ana Souza[\s\S]*\+55 \(13\) 99999-9999[\s\S]*Dor forte desde ontem/));
    expect(updates).toContainEqual(expect.objectContaining({ status: "sent" }));
  });
  it("adds a secure management CTA to appointment notifications", async () => {
    const outboxUpdates: Record<string, unknown>[] = [];
    const db = { from: (table: string) => {
      if (table === "appointments") return { select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: { start_at: "2026-07-24T17:30:00Z", patients: { phone: "5513999999999" }, professionals: { name: "Dra. Priscila" } }, error: null }) }) }) };
      if (table === "access_tokens") return { insert: vi.fn().mockResolvedValue({ error: null }) };
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { outboxUpdates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn(), sendButtons: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { portalBaseUrl: "https://agenda.example", recipientPolicy: "all", interactiveMessages: true, pollMs: 100, healthPort: 3001 } as never);
    await worker.processOutbox({ id: "00000000-0000-4000-8000-000000000010", aggregate_id: "00000000-0000-4000-8000-000000000011", event_type: "appointment.created", attempts: 1 });
    expect(evolution.sendButtons).toHaveBeenCalledWith("5513999999999", expect.objectContaining({ description: expect.stringContaining("Dra. Priscila"), buttons: [expect.objectContaining({ type: "url", displayText: "Gerenciar consulta" })] }));
    expect(outboxUpdates).toContainEqual(expect.objectContaining({ status: "sent" }));
  });
  it("confirms the single upcoming appointment directly from chat", async () => {
    const updates: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockResolvedValue({ data: { status: "confirmed", start_at: "2099-07-28T13:00:00Z" }, error: null });
    const db = { rpc, from: () => ({ update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) }) };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { recipientPolicy: "all", pollMs: 100, healthPort: 3001 } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000020", phone: "5513999999999", message_text: "confirmo", attempts: 1 });
    expect(rpc).toHaveBeenCalledWith("confirm_upcoming_appointment_by_phone", { p_phone: "5513999999999" });
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("Presença confirmada"));
    expect(updates).toContainEqual(expect.objectContaining({ classified_intent: "confirm", processed_action: "appointment_confirmed" }));
  });
  it("delivers a current 20h confirmation request and marks stale schedules as consumed", async () => {
    const outboxUpdates: Record<string, unknown>[] = [];
    const appointmentUpdates: Record<string, unknown>[] = [];
    const currentStart = "2099-07-28T13:00:00.000Z";
    const db = { from: (table: string) => {
      if (table === "appointments") return {
        select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: { start_at: currentStart, status: "scheduled", patients: { phone: "5513999999999" }, professionals: { name: "Dra. Priscila" } }, error: null }) }) }),
        update: (values: Record<string, unknown>) => ({ eq: () => ({ eq: vi.fn().mockImplementation(async () => { appointmentUpdates.push(values); return { error: null }; }) }) }),
      };
      if (table === "access_tokens") return { insert: vi.fn().mockResolvedValue({ error: null }) };
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { outboxUpdates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { portalBaseUrl: "https://agenda.example", recipientPolicy: "all", pollMs: 100, healthPort: 3001 } as never);
    await worker.processOutbox({ id: "00000000-0000-4000-8000-000000000021", aggregate_id: "00000000-0000-4000-8000-000000000022", event_type: "appointment.confirmation_requested", attempts: 1, payload: { scheduled_start_at: currentStart } });
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("CONFIRMO"));
    expect(appointmentUpdates).toContainEqual(expect.objectContaining({ attendance_confirmation_requested_at: expect.any(String) }));
    expect(outboxUpdates).toContainEqual(expect.objectContaining({ status: "sent" }));
  });
  it("sends the idempotently queued daily summary only to the configured doctor", async () => {
    const updates: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockResolvedValue({ data: { summary_date: "2026-07-28", total: 2, confirmed: 1, unconfirmed: [{ name: "Ana Souza", phone: "5513999999999", start_at: "2026-07-28T12:00:00Z" }] }, error: null });
    const db = { rpc, from: () => ({ update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) }) };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { handoffNotificationPhone: "5513988887777", recipientPolicy: "all", pollMs: 100, healthPort: 3001 } as never);
    await worker.processOutbox({ id: "00000000-0000-4000-8000-000000000023", aggregate_id: "00000000-0000-0000-0000-000000000000", event_type: "clinic.daily_confirmation_summary", attempts: 1, payload: { summary_date: "2026-07-28" } });
    expect(rpc).toHaveBeenCalledWith("get_daily_confirmation_summary", { p_summary_date: "2026-07-28" });
    expect(evolution.sendText).toHaveBeenCalledWith("5513988887777", expect.stringMatching(/1 de 2[\s\S]*Ana Souza/));
    expect(updates).toContainEqual(expect.objectContaining({ status: "sent" }));
  });
  it("finalizes a leased inbox message through the atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const db = { rpc, from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }) };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { portalBaseUrl: "https://agenda.example", openaiModel: "gpt-4o-mini", pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000003", phone: "5513999999999", message_text: "quero marcar", attempts: 1, lease_token: "00000000-0000-4000-8000-000000000004" });
    expect(rpc).toHaveBeenCalledWith("finish_whatsapp_inbox_leased", expect.objectContaining({ final_status: "processed", action: "portal_link", dead_letter: false }));
  });
  it("dead-letters a repeatedly failing inbound message without sending it again", async () => {
    const updates: Record<string, unknown>[] = [];
    const db = { from: () => ({ update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) }) };
    const evolution = { sendText: vi.fn() };
    const worker = new MessagingWorker(db as never, evolution as never, { pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000002", phone: "5513999999999", message_text: "oi", attempts: 6 });
    expect(evolution.sendText).not.toHaveBeenCalled();
    expect(updates).toContainEqual(expect.objectContaining({ status: "processed", processed_action: "ignored", last_error: "max_attempts_exceeded" }));
  });
  it("blocks and finalizes inbox messages for recipients outside the allowlist", async () => {
    const updates: Record<string, unknown>[] = [];
    const db = { from: () => ({ update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) }) };
    const evolution = { sendText: vi.fn() };
    const worker = new MessagingWorker(db as never, evolution as never, { pollMs: 100, healthPort: 3001, allowedRecipients: ["5513991743380"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000005", phone: "5513999999999", message_text: "oi", attempts: 1 });
    expect(evolution.sendText).not.toHaveBeenCalled();
    expect(updates).toContainEqual(expect.objectContaining({ status: "processed", processed_action: "ignored", last_error: "recipient_not_allowed" }));
  });
  it("allows real customer numbers only when the recipient policy is explicitly all", async () => {
    const updates: Record<string, unknown>[] = [];
    const db = { from: () => ({ update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) }) };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { recipientPolicy: "all", pollMs: 100, healthPort: 3001, allowedRecipients: [] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000009", phone: "5513999999999", message_text: "oi", attempts: 1 });
    expect(evolution.sendText).toHaveBeenCalledTimes(1);
    expect(updates).toContainEqual(expect.objectContaining({ status: "processed", classified_intent: "greeting" }));
  });
});
