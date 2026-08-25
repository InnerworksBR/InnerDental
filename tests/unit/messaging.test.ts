import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { classifyIntent, isAccessLinkRequest, isAppointmentStatusRequest, isClinicalQuestion, isExplicitHumanRequest, isGreetingMessage, isProcedureBookingRequest, isTreatmentStatusRequest } from "@/domain/messaging/intent.legacy";
import { whatsappMessageFingerprint } from "@/domain/messaging/fingerprint";
import { appointmentConfirmationRequestInteractiveMessage, appointmentMessage, caixaInsuranceMessage, dailyConfirmationSummaryMessage, isAutomatedReplyEcho, knowledgeAnswerInteractiveMessage, menuActions, otpMessage, unsupportedInsuranceMessage } from "@/domain/messaging/templates";
import { assertInsurancePlanCatalog, findRequestedProcedure, findStructuredAnswer, triageInsurancePlan } from "@/domain/knowledge/service";
import { encryptOtp, decryptOtp } from "@/lib/messaging/otp-cipher";
import { signEvolutionPayload, verifyEvolutionApiKey, verifyEvolutionSignature } from "@/integrations/evolution/signature";
import { evolutionWebhookSchema, normalizeFromMeActivity, normalizeIncomingMessage } from "@/integrations/evolution/contract";
import { EvolutionApiError, EvolutionClient } from "@/integrations/evolution/client";
import { generateClinicReply } from "@/integrations/openai/chat";
import { withBoundedRetry } from "@/lib/reliability/retry";
import { MessagingWorker } from "../../worker/index";

const testOtpSecret = "unit-test-otp-secret-that-is-at-least-thirty-two-characters";
const preparedAccessLink = (token: string, phone = "5513999999999", sentAt: string | null = null) => ({
  encrypted_token: encryptOtp(token, testOtpSecret),
  phone,
  token_hash: createHash("sha256").update(token, "utf8").digest("hex"),
  token_status: "active",
  expires_at: "2099-01-01T00:00:00.000Z",
  status: sentAt ? "sent" : "prepared",
  sent_at: sentAt,
});

describe("messaging", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("classifies scheduling and stable menu actions without ever selecting a slot", () => { expect(classifyIntent("Quero remarcar meu horário")).toBe("reschedule"); expect(classifyIntent("Vocês aceitam Unimed?")).toBe("insurance"); expect(classifyIntent("Posso pagar a manutenção do aparelho no cartão?")).toBe("faq"); expect(classifyIntent(menuActions.agenda)).toBe("schedule"); expect(classifyIntent(menuActions.handoff)).toBe("human"); expect(classifyIntent("texto sem correspondência")).toBe("conversation"); });
  it("recognizes explicit requests for human service without treating every unknown question as one", () => { expect(isExplicitHumanRequest("Quero falar com a doutora")).toBe(true); expect(isExplicitHumanRequest("Pode me transferir para um atendente?")).toBe(true); expect(isExplicitHumanRequest("A clínica tem estacionamento?")).toBe(false); });
  it("recognizes combined greetings and requests for a replacement access link", () => {
    expect(isGreetingMessage("Olá, bom dia")).toBe(true);
    expect(classifyIntent("Olá, bom dia")).toBe("greeting");
    expect(isGreetingMessage("Olá, gostaria de fazer uma limpeza")).toBe(false);
    expect(isAccessLinkRequest("Perdi o link")).toBe(true);
    expect(isAccessLinkRequest("OK. Mande-me o link")).toBe(true);
    expect(classifyIntent("OK. Mande-me o link")).toBe("schedule");
    expect(classifyIntent("O link expirou, pode enviar novamente?")).toBe("schedule");
  });
  it("separates clinical judgment from administrative questions", () => {
    expect(isClinicalQuestion("Estou com dor, inchaço e febre")).toBe(true);
    expect(isClinicalQuestion("Posso tomar antibiótico para esse dente?")).toBe(true);
    expect(isClinicalQuestion("Qual é o endereço e a sala?")).toBe(false);
    expect(isClinicalQuestion("Vocês fazem limpeza?")).toBe(false);
  });
  it("recognizes administrative questions and natural scheduling conjugations", () => {
    expect(classifyIntent("Me fala qual é a sala")).toBe("faq");
    expect(classifyIntent("Qual o horário de funcionamento?")).toBe("faq");
    expect(classifyIntent("Poderia marca uma limpeza?")).toBe("procedure");
    expect(classifyIntent("Gostaria de fazer uma limpeza")).toBe("procedure");
    expect(isProcedureBookingRequest("Gostaria de fazer uma limpeza")).toBe(true);
    expect(isProcedureBookingRequest("Vocês fazem limpeza?")).toBe(false);
    expect(classifyIntent("Bom dia estou chegando aqui\nme fala a sala qual é")).toBe("faq");
  });
  it("separates an existing appointment and treatment progress from new scheduling", () => {
    const appointment = "Oi, para quando ficou marcada minha próxima consulta para colocar as próteses?";
    const treatment = "A clínica disse que as próteses ficariam prontas até agosto";
    expect(isAppointmentStatusRequest(appointment)).toBe(true);
    expect(classifyIntent(appointment)).toBe("appointment_status");
    expect(isTreatmentStatusRequest(treatment)).toBe(true);
    expect(classifyIntent(treatment)).toBe("treatment_status");
    expect(classifyIntent("Quero ver minha consulta")).toBe("appointment_status");
    expect(classifyIntent("Pode ser às 16h, mas vou tentar chegar às 15h30")).toBe("conversation");
  });
  it("classifies textual and interactive attendance confirmations", () => { expect(classifyIntent("Confirmo")).toBe("confirm"); expect(classifyIntent("Vou comparecer")).toBe("confirm"); expect(classifyIntent(menuActions.appointmentConfirm)).toBe("confirm"); });
  it("resolves only active structured data supplied by the repository", () => { const answer = findStructuredAnswer("Vocês aceitam meu plano uni?", { plans: [{ id: "1", name: "Unimed", instructions: "Leve a carteirinha." }], aliases: [{ alias: "uni", insurance_plan_id: "1" }], procedures: [], faqs: [] }); expect(answer).toContain("Unimed"); expect(answer).toContain("carteirinha"); });
  it("matches a requested procedure only against the active catalog loaded by the worker", () => {
    const knowledge = { procedures: [{ name: "Limpeza", description: "Avaliação inicial.", online_booking: true }] };
    expect(findRequestedProcedure("Gostaria de fazer uma limpeza", knowledge)).toEqual(knowledge.procedures[0]);
    expect(findRequestedProcedure("Gostaria de fazer implante", knowledge)).toBeNull();
  });
  it("answers broad plan and child-age questions from the registered knowledge", () => {
    const knowledge = { plans: [{ id: "1", name: "Unimed", instructions: null }, { id: "2", name: "Amil Dental", instructions: null }], aliases: [], procedures: [{ name: "Crianças", description: "Não são realizadas consultas em menores de 8 anos.", online_booking: false }], faqs: [] };
    expect(findStructuredAnswer("Quais planos vcs atendem?", knowledge)).toMatch(/Unimed[\s\S]*Amil Dental/);
    expect(findStructuredAnswer("Meu filho tem 6 anos, ele pode se consultar?", knowledge)).toContain("menores de 8 anos");
  });
  it("returns null when knowledge has no safe match", () => { expect(findStructuredAnswer("Qual o preço secreto?", { plans: [], aliases: [], procedures: [], faqs: [] })).toBeNull(); });
  it("accepts only registered public plan terms and explicit particular consultations during triage", () => {
    const knowledge = { plans: [{ id: "1", name: "Unimed Odonto", instructions: null }, { id: "2", name: "Amil Dental", instructions: null }, { id: "particular-id", name: "Particular", instructions: null }], aliases: [{ alias: "Unimed", insurance_plan_id: "1" }] };
    expect(triageInsurancePlan("Meu plano é Unimed", knowledge)).toEqual(expect.objectContaining({ kind: "accepted", plan: expect.objectContaining({ id: "1" }) }));
    expect(triageInsurancePlan("Particular", knowledge)).toEqual(expect.objectContaining({ kind: "accepted", plan: expect.objectContaining({ id: "particular-id" }) }));
    expect(triageInsurancePlan("Não tenho convênio", knowledge)).toEqual(expect.objectContaining({ kind: "accepted", plan: expect.objectContaining({ id: "particular-id" }) }));
    expect(triageInsurancePlan("Plano inventado", knowledge)).toEqual({ kind: "unsupported" });
  });
  it("rejects catalog conflicts and accepts explicit registered spellings", () => {
    const invalidCatalog = {
      plans: [
        { id: "bradesco", name: "Bradesco Dental", instructions: null },
        { id: "unna", name: "Rede UNNA", instructions: null },
        { id: "transmontano", name: "Transmontano", instructions: null },
      ],
      aliases: [
        { alias: "Bradesco Dental", insurance_plan_id: "unna" },
        { alias: "Tramontano", insurance_plan_id: "transmontano" },
      ],
    };
    expect(() => assertInsurancePlanCatalog(invalidCatalog)).toThrow("PLAN_CATALOG_CONFLICT");
    const catalog = {
      plans: [{ id: "transmontano", name: "Transmontano", instructions: null }, { id: "dentalpar", name: "DentalPar", instructions: null }],
      aliases: [{ alias: "Tramontano", insurance_plan_id: "transmontano" }, { alias: "Dental Par", insurance_plan_id: "dentalpar" }],
    };
    expect(triageInsurancePlan("Tramontano", catalog)).toEqual(expect.objectContaining({ kind: "accepted", plan: expect.objectContaining({ id: "transmontano" }) }));
    expect(triageInsurancePlan("Dental par", catalog)).toEqual(expect.objectContaining({ kind: "accepted", plan: expect.objectContaining({ id: "dentalpar" }) }));
  });
  it("does not turn a partial brand into a plan identity", () => {
    expect(triageInsurancePlan("Meu plano é Unimed", {
      plans: [
        { id: "unimed-odonto", name: "Unimed Odonto", instructions: null },
        { id: "unimed-dental", name: "Unimed Dental", instructions: null },
      ],
      aliases: [],
    })).toEqual({ kind: "unsupported" });
  });
  it("does not equate an unknown plan term with a rejection", () => {
    expect(triageInsurancePlan("Caixa de Pecúlio", { plans: [{ id: "1", name: "Caixa de Pecúlio", instructions: null }], aliases: [] })).toEqual(expect.objectContaining({ kind: "accepted", plan: expect.objectContaining({ id: "1" }) }));
    expect(triageInsurancePlan("meu convênio é caixa saúde", { plans: [], aliases: [] })).toEqual({ kind: "unsupported" });
  });
  it("uses professional plan responses without naming a professional or forcing a generic CTA", () => {
    expect(`${unsupportedInsuranceMessage} ${caixaInsuranceMessage}`).not.toMatch(/tarc[ií]lia/i);
    expect(unsupportedInsuranceMessage).toContain("clínica");
    expect(knowledgeAnswerInteractiveMessage("A clínica fica no Centro.").fallbackText).toBe("A clínica fica no Centro.");
  });
  it("encrypts OTP at rest and rejects a wrong key", () => { const secret = "a".repeat(32), encrypted = encryptOtp("123456", secret); expect(encrypted).not.toContain("123456"); expect(decryptOtp(encrypted, secret)).toBe("123456"); expect(() => decryptOtp(encrypted, "b".repeat(32))).toThrow(); });
  it("separates inbound messages from fromMe activity", () => { const inbound = evolutionWebhookSchema.parse({ event: "messages.upsert", apikey: "evo-key", data: { key: { id: "evt-1", remoteJid: "5513999999999@s.whatsapp.net", fromMe: false }, message: { conversation: "Olá" } } }); expect(normalizeIncomingMessage(inbound)).toEqual({ externalId: "evt-1", phone: "5513999999999", text: "Olá" }); expect(normalizeFromMeActivity(inbound)).toBeNull(); const outbound = evolutionWebhookSchema.parse({ event: "messages.upsert", apikey: "evo-key", data: { key: { id: "evt-2", remoteJid: "5513999999999@s.whatsapp.net", fromMe: true }, message: { conversation: "Resposta da doutora" } } }); expect(normalizeIncomingMessage(outbound)).toBeNull(); expect(normalizeFromMeActivity(outbound)).toEqual({ externalId: "evt-2", phone: "5513999999999", text: "Resposta da doutora" }); });
  it("creates stable per-conversation fingerprints for bot echo detection", () => { expect(whatsappMessageFingerprint("5513999999999", "Olá  mundo\r\n")).toBe(whatsappMessageFingerprint("5513999999999", "Olá mundo\n")); expect(whatsappMessageFingerprint("5513999999999", "Olá")).not.toBe(whatsappMessageFingerprint("5513988887777", "Olá")); });
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
  it("checks the configured Evolution instance connection without sending a message", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ instance: { state: "open" } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = new EvolutionClient({ baseUrl: "https://evolution.test/", apiKey: "key", instance: "luna" }, fetcher);
    await expect(client.connectionState()).resolves.toBe("open");
    expect(fetcher).toHaveBeenCalledWith("https://evolution.test/instance/connectionState/luna", expect.objectContaining({ headers: { apikey: "key" } }));
    const closed = new EvolutionClient({ baseUrl: "https://evolution.test", apiKey: "key", instance: "luna" }, vi.fn().mockResolvedValue(new Response(JSON.stringify({ instance: { state: "close" } }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await expect(closed.connectionState()).resolves.toBe("closed");
    const missing = new EvolutionClient({ baseUrl: "https://evolution.test", apiKey: "key", instance: "luna" }, vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(missing.connectionState()).rejects.toBeInstanceOf(EvolutionApiError);
  });
  it("sends only a verified FAQ and structural context to OpenAI", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message: "A sala é 12.", handoff_reason: "none" }) }] }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(generateClinicReply({ apiKey: "test-key", model: "gpt-4o-mini", message: "Qual é a sala?", facts: { faq: { question: "Onde fica?", answer: "Sala 12." } }, conversationContext: [{ intent: "faq", action: "structured_answer" }] })).resolves.toEqual({ text: "A sala é 12.", handoffRequired: false, handoffReason: "none" });
    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    const input = JSON.parse(request.input);
    expect(request.temperature).toBe(0);
    expect(request.instructions).toContain("uma unica FAQ verificada");
    expect(input).toEqual(expect.objectContaining({ verified_faq: { question: "Onde fica?", answer: "Sala 12." }, conversation_context: [{ intent: "faq", action: "structured_answer" }] }));
    expect(JSON.stringify(input)).not.toContain("plans");
    expect(request.text.format.schema.properties.handoff_reason.enum).toEqual(["none", "clinical_question", "explicit_human_request"]);
  });
  it("rejects an URL invented by OpenAI", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message: "Acesse [aqui](https://link.de.agendamento).", handoff_reason: "none" }) }] }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await expect(generateClinicReply({ apiKey: "test-key", model: "gpt-4o-mini", message: "Perdi o link", facts: { faq: { question: "Onde fica?", answer: "Sala 12." } } })).rejects.toThrow("OPENAI_UNGROUNDED_URL");
  });
  it("rejects a placeholder link invented by OpenAI", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message: "Acesse [Gerenciar Consulta](#).", handoff_reason: "none" }) }] }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await expect(generateClinicReply({ apiKey: "test-key", model: "gpt-4o-mini", message: "Mande-me o link", facts: { faq: { question: "Onde fica?", answer: "Sala 12." } } })).rejects.toThrow("OPENAI_UNGROUNDED_URL");
  });
  it("rejects a factual claim not present in the verified FAQ", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message: "Aceitamos o plano Unimed.", handoff_reason: "none" }) }] }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await expect(generateClinicReply({ apiKey: "test-key", model: "gpt-4o-mini", message: "Onde fica?", facts: { faq: { question: "Onde fica?", answer: "Sala 12." } } })).rejects.toThrow("OPENAI_UNGROUNDED_CRITICAL_CLAIM");
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
  it("asks for the plan only when a new booking has no known plan", async () => {
    const updates: Record<string, unknown>[] = [];
    const transitions: Record<string, unknown>[] = [];
    const knowledgeTable = (data: unknown[] = []) => ({ select: () => ({ eq: vi.fn().mockResolvedValue({ data, error: null }) }) });
    const db = { rpc: vi.fn().mockImplementation(async (name: string, value: Record<string, unknown>) => {
      if (name === "transition_whatsapp_plan_triage") { transitions.push(value); return { data: true, error: null }; }
      return { data: null, error: null };
    }), from: (table: string) => {
      if (table === "whatsapp_plan_triage_sessions") return {
        select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
      };
      if (table === "patients") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) };
      if (["insurance_plans", "insurance_aliases", "procedures", "procedure_coverage", "faq_entries"].includes(table)) return knowledgeTable();
      if (table === "access_tokens") return { insert: vi.fn().mockResolvedValue({ error: null }) };
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { planTriageEnabled: true, portalBaseUrl: "https://agenda.example", pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000030", phone: "5513999999999", message_text: "quero marcar", attempts: 1 });
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", "Qual é o seu plano odontológico?");
    expect(transitions).toContainEqual(expect.objectContaining({ p_action: "replace", p_pending_message: "quero marcar" }));
    expect(updates).toContainEqual(expect.objectContaining({ processed_action: "plan_requested" }));
  });
  it("lets a new question end a pending procedure-plan flow", async () => {
    let session: Record<string, unknown> | null = null;
    const updates: Record<string, unknown>[] = [];
    const accessTokenInsert = vi.fn().mockResolvedValue({ error: null });
    const knowledgeTable = (data: unknown[] = []) => ({ select: () => ({ eq: vi.fn().mockResolvedValue({ data, error: null }) }) });
    const rpc = vi.fn().mockImplementation(async (name: string, value: Record<string, unknown>) => {
      if (name === "transition_whatsapp_plan_triage") {
        if (value.p_action === "replace") {
          session = {
            status: "awaiting_plan",
            pending_message: value.p_pending_message,
            prompted_by_inbox_id: value.p_prompted_by_inbox_id,
            expires_at: "2099-01-01T00:00:00.000Z",
          };
        }
        if (value.p_action === "reject" && session) session = { ...session, status: "rejected" };
        return { data: true, error: null };
      }
      if (name === "enqueue_human_handoff") return { data: "00000000-0000-4000-8000-000000000099", error: null };
      return { data: null, error: null };
    });
    const db = { rpc, from: (table: string) => {
      if (table === "whatsapp_plan_triage_sessions") return {
        select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockImplementation(async () => ({ data: session, error: null })) }) }),
        upsert: vi.fn().mockImplementation(async (values: Record<string, unknown>) => { session = values; return { error: null }; }),
      };
      if (table === "insurance_plans") return knowledgeTable([{ id: "plan-1", name: "Amil Dental", instructions: null }]);
      if (table === "procedures") return knowledgeTable([{ id: "procedure-1", name: "Limpeza", description: "Avaliação inicial.", online_booking: true }]);
      if (table === "procedure_coverage") return { select: vi.fn().mockResolvedValue({ data: [{ procedure_id: "procedure-1", insurance_plan_id: "plan-1", accepted: true, instructions: null }], error: null }) };
      if (["insurance_aliases", "faq_entries"].includes(table)) return knowledgeTable();
      if (table === "patients") return {
        select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
      if (table === "access_tokens") return { insert: accessTokenInsert };
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { planTriageEnabled: true, portalBaseUrl: "https://agenda.example", pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000045", phone: "5513999999999", message_text: "Bom dia. Gostaria de fazer uma limpeza.", attempts: 1 });
    expect(evolution.sendText).toHaveBeenNthCalledWith(1, "5513999999999", "Sim, realizamos limpeza. Qual é o seu plano odontológico?");
    expect(accessTokenInsert).not.toHaveBeenCalled();

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000046", phone: "5513999999999", message_text: "Nesse caso eu gostaria, sim. Quais dias estão disponíveis?", attempts: 1 });
    expect(evolution.sendText).toHaveBeenNthCalledWith(2, "5513999999999", expect.not.stringContaining("plano odontológico"));
    expect(accessTokenInsert).not.toHaveBeenCalled();

    expect(accessTokenInsert).not.toHaveBeenCalled();
    expect(updates).not.toContainEqual(expect.objectContaining({ processed_action: "plan_rejected" }));
  });
  it("issues a fresh secure link deterministically when the previous link was lost", async () => {
    const updates: Record<string, unknown>[] = [];
    const preparedLinks: Record<string, unknown>[] = [];
    const db = { rpc: vi.fn().mockImplementation(async (name: string, value: Record<string, unknown>) => {
      if (name === "prepare_whatsapp_access_link") {
        preparedLinks.push(value);
        return { data: preparedAccessLink("replacement-link"), error: null };
      }
      if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
      return { data: null, error: null };
    }), from: (table: string) => {
      if (table === "whatsapp_plan_triage_sessions") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) };
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { planTriageEnabled: true, portalBaseUrl: "https://agenda.example", otpSecret: testOtpSecret, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000044", phone: "5513999999999", message_text: "OK. Mande-me o link", attempts: 1 });
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringMatching(/agenda\.example\/acesso#token=/));
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("expira em 24 horas"));
    expect(evolution.sendText).not.toHaveBeenCalledWith("5513999999999", expect.stringContaining("link.de.agendamento"));
    expect(preparedLinks).toEqual([expect.objectContaining({ p_source_inbox_id: "00000000-0000-4000-8000-000000000044" })]);
    expect(updates).toContainEqual(expect.objectContaining({ classified_intent: "schedule", processed_action: "portal_link" }));
  });
  it("answers an existing appointment question without asking for a plan", async () => {
    const updates: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockImplementation(async (name: string) => {
      if (name === "get_upcoming_appointment_by_phone") return { data: { status: "found", start_at: "2099-08-02T18:00:00.000Z", professional_name: "Dra. Priscila" }, error: null };
      if (name === "prepare_whatsapp_access_link") return { data: preparedAccessLink("appointment-link"), error: null };
      if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
      return { data: null, error: null };
    });
    const db = { rpc, from: (table: string) => {
      if (table === "whatsapp_plan_triage_sessions") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) };
      if (table === "access_tokens") return { insert: vi.fn().mockResolvedValue({ error: null }) };
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { planTriageEnabled: true, portalBaseUrl: "https://agenda.example", otpSecret: testOtpSecret, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000040", phone: "5513999999999", message_text: "Para quando ficou marcada minha próxima consulta para colocar as próteses?", attempts: 1 });
    expect(rpc).toHaveBeenCalledWith("get_upcoming_appointment_by_phone", { p_phone: "5513999999999" });
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringMatching(/próxima consulta[\s\S]*Dra\. Priscila/i));
    expect(evolution.sendText).not.toHaveBeenCalledWith("5513999999999", expect.stringContaining("plano odontológico"));
    expect(updates).toContainEqual(expect.objectContaining({ classified_intent: "appointment_status", processed_action: "appointment_lookup" }));
  });
  it("reuses the active plan already stored for a patient", async () => {
    const updates: Record<string, unknown>[] = [];
    const sessionUpsert = vi.fn();
    const db = { rpc: vi.fn().mockImplementation(async (name: string) => {
      if (name === "prepare_whatsapp_access_link") return { data: preparedAccessLink("active-plan-link"), error: null };
      if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
      return { data: null, error: null };
    }), from: (table: string) => {
      if (table === "whatsapp_plan_triage_sessions") return {
        select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
        upsert: sessionUpsert,
      };
      if (table === "patients") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { insurance_plan_id: "plan-1" }, error: null }) }) }) };
      if (table === "insurance_plans") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { name: "Amil Dental", active: true }, error: null }) }) }) };
      if (table === "access_tokens") return { insert: vi.fn().mockResolvedValue({ error: null }) };
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { planTriageEnabled: true, portalBaseUrl: "https://agenda.example", otpSecret: testOtpSecret, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000041", phone: "5513999999999", message_text: "Quero marcar uma consulta", attempts: 1 });
    expect(sessionUpsert).not.toHaveBeenCalled();
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("https://agenda.example/acesso#token="));
    expect(updates).toContainEqual(expect.objectContaining({ classified_intent: "schedule", processed_action: "portal_link" }));
  });
  it("routes treatment progress with context and never asks for a plan", async () => {
    const updates: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockImplementation(async (name: string) => name === "enqueue_human_handoff"
      ? { data: "00000000-0000-4000-8000-000000000099", error: null }
      : { data: null, error: null });
    const db = { rpc, from: (table: string) => table === "whatsapp_plan_triage_sessions"
      ? { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }
      : { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { planTriageEnabled: true, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000042", phone: "5513999999999", message_text: "As próteses ficariam prontas até agosto, qual o andamento?", attempts: 1 });
    expect(rpc).toHaveBeenCalledWith("enqueue_human_handoff", expect.objectContaining({ p_phone: "5513999999999" }));
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", "Encaminhei sua pergunta sobre o tratamento para a equipe.");
    expect(evolution.sendText).not.toHaveBeenCalledWith("5513999999999", expect.stringContaining("plano odontológico"));
    expect(updates).toContainEqual(expect.objectContaining({ classified_intent: "treatment_status", processed_action: "handoff" }));
  });
  it("suppresses a queued bot reply when a human has already taken over", async () => {
    const updates: Record<string, unknown>[] = [];
    const db = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      from: () => ({ update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) }),
    };
    const evolution = { sendText: vi.fn() };
    const worker = new MessagingWorker(db as never, evolution as never, { humanTakeoverPauseMinutes: 120, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000043", phone: "5513999999999", message_text: "Pode ser às 16h", attempts: 1 });
    expect(evolution.sendText).not.toHaveBeenCalled();
    expect(updates).toContainEqual(expect.objectContaining({ processed_action: "ignored", last_error: "agent_paused" }));
  });
  it("ends a pending plan triage for an unknown message instead of rejecting it as a plan", async () => {
    const updates: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockImplementation(async (name: string) => name === "transition_whatsapp_plan_triage"
      ? { data: true, error: null }
      : { data: "00000000-0000-4000-8000-000000000099", error: null });
    const knowledgeTable = (data: unknown[] = []) => ({ select: () => ({ eq: vi.fn().mockResolvedValue({ data, error: null }) }) });
    const db = { rpc, from: (table: string) => {
      if (table === "whatsapp_plan_triage_sessions") return {
        select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { status: "awaiting_plan", pending_message: "quero marcar", prompted_by_inbox_id: "00000000-0000-4000-8000-000000000030", expires_at: "2099-01-01T00:00:00.000Z" }, error: null }) }) }),
      };
      if (["insurance_plans", "insurance_aliases", "procedures", "procedure_coverage", "faq_entries"].includes(table)) return knowledgeTable();
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { planTriageEnabled: true, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000031", phone: "5513999999999", message_text: "Jonathan Dos Reis Santos", attempts: 1 });
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000033", phone: "5513999999999", message_text: "Priscilla de Moraes Queiroz", attempts: 1 });
    expect(evolution.sendText).not.toHaveBeenCalledWith("5513999999999", unsupportedInsuranceMessage);
    expect(rpc).toHaveBeenCalledWith("transition_whatsapp_plan_triage", expect.objectContaining({ p_action: "reject" }));
    expect(updates).not.toContainEqual(expect.objectContaining({ processed_action: "plan_rejected" }));
    expect(rpc).toHaveBeenCalledWith("enqueue_human_handoff", expect.objectContaining({ p_phone: "5513999999999" }));
  });
  it("resumes the original request only after an active plan is accepted", async () => {
    const updates: Record<string, unknown>[] = [];
    const knowledgeTable = (data: unknown[] = []) => ({ select: () => ({ eq: vi.fn().mockResolvedValue({ data, error: null }) }) });
    const rpc = vi.fn().mockImplementation(async (name: string) => {
      if (name === "accept_whatsapp_plan_triage") return { data: true, error: null };
      if (name === "prepare_whatsapp_access_link") return { data: preparedAccessLink("accepted-plan-link"), error: null };
      if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
      return { data: null, error: null };
    });
    const db = { rpc, from: (table: string) => {
      if (table === "whatsapp_plan_triage_sessions") return {
        select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { status: "awaiting_plan", pending_message: "quero marcar", prompted_by_inbox_id: "00000000-0000-4000-8000-000000000030", expires_at: "2099-01-01T00:00:00.000Z" }, error: null }) }) }),
      };
      if (table === "insurance_plans") return knowledgeTable([{ id: "plan-1", name: "Unimed Odonto", instructions: null }]);
      if (["insurance_aliases", "procedures", "procedure_coverage", "faq_entries"].includes(table)) return knowledgeTable();
      if (table === "access_tokens") return { insert: vi.fn().mockResolvedValue({ error: null }) };
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { planTriageEnabled: true, portalBaseUrl: "https://agenda.example", otpSecret: testOtpSecret, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000032", phone: "5513999999999", message_text: "Unimed Odonto", attempts: 1 });
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("https://agenda.example/acesso#token="));
    expect(rpc).toHaveBeenCalledWith("accept_whatsapp_plan_triage", expect.objectContaining({ p_phone: "5513999999999", p_insurance_plan_id: "plan-1" }));
    expect(updates).toContainEqual(expect.objectContaining({ classified_intent: "schedule", processed_action: "portal_link" }));
  });
  it("persists an allowed action after sending a scheduling reply", async () => {
    const updates: Record<string, unknown>[] = [];
    const db = { rpc: vi.fn().mockImplementation(async (name: string) => {
      if (name === "prepare_whatsapp_access_link") return { data: preparedAccessLink("scheduling-link"), error: null };
      if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
      return { data: null, error: null };
    }),
      from: (table: string) => table === "access_tokens"
        ? { insert: vi.fn().mockResolvedValue({ error: null }) }
        : { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) },
    };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { portalBaseUrl: "https://agenda.example", otpSecret: testOtpSecret, openaiModel: "gpt-4o-mini", pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
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
  it("marks bot replies before sending so their fromMe echo does not pause the agent", async () => {
    const markers: Record<string, unknown>[] = [];
    const db = { rpc: vi.fn().mockResolvedValue({ data: false, error: null }), from: (table: string) => table === "whatsapp_bot_outbound_markers"
      ? { insert: vi.fn().mockImplementation(async (values: Record<string, unknown>) => { markers.push(values); return { error: null }; }) }
      : { update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { humanTakeoverPauseMinutes: 20, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000012", phone: "5513999999999", message_text: "oi", attempts: 1 });
    expect(markers).toContainEqual(expect.objectContaining({ phone: "5513999999999", message_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    expect(evolution.sendText).toHaveBeenCalledTimes(1);
  });
  it("persists a handoff when a clinical question requires professional judgment", async () => {
    const updates: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockResolvedValue({ data: "00000000-0000-4000-8000-000000000099", error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message: "Essa situação precisa ser avaliada pela doutora.", handoff_reason: "clinical_question" }) }] }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const knowledgeTable = () => ({ select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) });
    const db = { rpc, from: (table: string) => {
      if (["insurance_plans", "procedures", "procedure_coverage", "faq_entries"].includes(table)) return knowledgeTable();
      if (table === "insurance_aliases") return knowledgeTable();
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { openaiApiKey: "test-key", openaiModel: "gpt-4o-mini", pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000008", phone: "5513999999999", message_text: "Estou com dor forte e inchaço. O que devo tomar?", attempts: 1 });
    expect(rpc).toHaveBeenCalledWith("enqueue_human_handoff", expect.objectContaining({ p_phone: "5513999999999", p_reason: "Estou com dor forte e inchaço. O que devo tomar?" }));
    expect(updates).toContainEqual(expect.objectContaining({ processed_action: "handoff" }));
  });
  it("answers a safe OpenAI response without notifying the doctor", async () => {
    const updates: Record<string, unknown>[] = [];
    const rpc = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message: "Sim, temos estacionamento.", handoff_reason: "none" }) }] }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const knowledgeTable = (data: unknown[] = []) => ({ select: () => ({ eq: vi.fn().mockResolvedValue({ data, error: null }) }) });
    const db = { rpc, from: (table: string) => {
      if (table === "faq_entries") return knowledgeTable([{ question: "A clínica tem estacionamento?", answer: "Sim, temos estacionamento." }]);
      if (["insurance_plans", "insurance_aliases", "procedures", "procedure_coverage"].includes(table)) return knowledgeTable();
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
  it("sends the secure scheduling link when the person asks to book a registered online procedure", async () => {
    const updates: Record<string, unknown>[] = [];
    const preparedLinks: Record<string, unknown>[] = [];
    const knowledgeTable = (data: unknown[] = []) => ({ select: () => ({ eq: vi.fn().mockResolvedValue({ data, error: null }) }) });
    const db = { rpc: vi.fn().mockImplementation(async (name: string, value: Record<string, unknown>) => {
      if (name === "prepare_whatsapp_access_link") {
        preparedLinks.push(value);
        return { data: preparedAccessLink("procedure-link"), error: null };
      }
      if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
      return { data: null, error: null };
    }), from: (table: string) => {
      if (table === "procedures") return knowledgeTable([{ name: "Limpeza", description: "Avaliação inicial.", online_booking: true }]);
      if (["insurance_plans", "insurance_aliases", "procedure_coverage", "faq_entries"].includes(table)) return knowledgeTable();
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { portalBaseUrl: "https://agenda.example", otpSecret: testOtpSecret, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000014", phone: "5513999999999", message_text: "Gostaria de fazer uma limpeza", attempts: 1 });
    expect(preparedLinks).toEqual([expect.objectContaining({ p_source_inbox_id: "00000000-0000-4000-8000-000000000014" })]);
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringMatching(/Agendar consulta[\s\S]*agenda\.example\/acesso#token=/));
    expect(updates).toContainEqual(expect.objectContaining({ classified_intent: "procedure", processed_action: "portal_link" }));
  });
  it("does not send a scheduling link for a procedure that is not enabled for online booking", async () => {
    const updates: Record<string, unknown>[] = [];
    const accessTokenInsert = vi.fn();
    const knowledgeTable = (data: unknown[] = []) => ({ select: () => ({ eq: vi.fn().mockResolvedValue({ data, error: null }) }) });
    const db = { from: (table: string) => {
      if (table === "procedures") return knowledgeTable([{ name: "Extração de siso", description: "Apenas particular; encaminhar para avaliação.", online_booking: false }]);
      if (["insurance_plans", "insurance_aliases", "procedure_coverage", "faq_entries"].includes(table)) return knowledgeTable();
      if (table === "access_tokens") return { insert: accessTokenInsert };
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { portalBaseUrl: "https://agenda.example", pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000015", phone: "5513999999999", message_text: "Gostaria de fazer uma extração de siso", attempts: 1 });
    expect(accessTokenInsert).not.toHaveBeenCalled();
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("Apenas particular"));
    expect(updates).toContainEqual(expect.objectContaining({ classified_intent: "procedure", processed_action: "structured_answer" }));
  });
  it("does not notify the doctor for an administrative question without a literal matcher hit", async () => {
    const updates: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockResolvedValue({ data: "00000000-0000-4000-8000-000000000099", error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message: "Rua Exemplo, sala 12.", handoff_reason: "none" }) }] }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const knowledgeTable = (data: unknown[] = []) => ({ select: () => ({ eq: vi.fn().mockResolvedValue({ data, error: null }) }) });
    const db = { rpc, from: (table: string) => {
      if (table === "faq_entries") return knowledgeTable([{ question: "Onde fica o consultório?", answer: "Rua Exemplo, sala 12." }]);
      if (["insurance_plans", "insurance_aliases", "procedures", "procedure_coverage"].includes(table)) return knowledgeTable();
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { openaiApiKey: "test-key", openaiModel: "gpt-4o-mini", pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000011", phone: "5513999999999", message_text: "Me fala a sala qual é", attempts: 1 });
    expect(rpc).not.toHaveBeenCalled();
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("sala 12"));
    expect(updates).toContainEqual(expect.objectContaining({ processed_action: "llm_answer" }));
  });
  it("hands an unknown administrative question to the team instead of improvising", async () => {
    const updates: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockResolvedValue({ data: "00000000-0000-4000-8000-000000000099", error: null });
    const knowledgeTable = () => ({ select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) });
    const db = { rpc, from: (table: string) => {
      if (["insurance_plans", "insurance_aliases", "procedures", "procedure_coverage", "faq_entries"].includes(table)) return knowledgeTable();
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000013", phone: "5513999999999", message_text: "Qual é o endereço?", attempts: 1 });
    expect(rpc).toHaveBeenCalledWith("enqueue_human_handoff", expect.objectContaining({ p_phone: "5513999999999" }));
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringMatching(/equipe.*confirmar/i));
    expect(updates).toContainEqual(expect.objectContaining({ processed_action: "handoff" }));
  });
  it("asks for clarification instead of choosing an ambiguous insurance plan", async () => {
    const updates: Record<string, unknown>[] = [];
    const knowledgeTable = (data: unknown[] = []) => ({ select: () => ({ eq: vi.fn().mockResolvedValue({ data, error: null }) }) });
    const db = { from: (table: string) => {
      if (table === "insurance_plans") return knowledgeTable([{ id: "unimed-odonto", name: "Unimed Odonto", instructions: null }, { id: "unimed-dental", name: "Unimed Dental", instructions: null }]);
      if (["insurance_aliases", "procedures", "faq_entries"].includes(table)) return knowledgeTable();
      if (table === "procedure_coverage") return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000016", phone: "5513999999999", message_text: "Vocês aceitam Unimed Odonto e Unimed Dental?", attempts: 1 });
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringMatching(/mais de um plano/i));
    expect(updates).toContainEqual(expect.objectContaining({ processed_action: "structured_answer" }));
  });
  it("does not estimate a price and creates a human handoff", async () => {
    const updates: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockResolvedValue({ data: "00000000-0000-4000-8000-000000000099", error: null });
    const knowledgeTable = (data: unknown[] = []) => ({ select: () => ({ eq: vi.fn().mockResolvedValue({ data, error: null }) }) });
    const db = { rpc, from: (table: string) => {
      if (["insurance_plans", "insurance_aliases", "procedures", "faq_entries"].includes(table)) return knowledgeTable();
      if (table === "procedure_coverage") return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000017", phone: "5513999999999", message_text: "Quanto custa uma limpeza?", attempts: 1 });
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringMatching(/valor confirmado.*equipe/i));
    expect(rpc).toHaveBeenCalledWith("enqueue_human_handoff", expect.objectContaining({ p_phone: "5513999999999" }));
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
    const rpc = vi.fn().mockImplementation(async (name: string) => {
      if (name === "prepare_whatsapp_access_link") return { data: preparedAccessLink("leased-link"), error: null };
      return { data: true, error: null };
    });
    const db = { rpc, from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }) };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { portalBaseUrl: "https://agenda.example", otpSecret: testOtpSecret, openaiModel: "gpt-4o-mini", pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);
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
