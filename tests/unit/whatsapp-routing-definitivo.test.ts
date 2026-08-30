import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { isAccessLinkRequest } from "@/domain/messaging/intent.legacy";
import { assertInsurancePlanCatalog, triageInsurancePlan } from "@/domain/knowledge/service";
import { resolveVerifiedFacts } from "@/domain/knowledge/verified-facts";
import { encryptOtp } from "@/lib/messaging/otp-cipher";
import { renderPrometheusMetrics, resetMetricsForTests } from "@/lib/observability/metrics";
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

const plans = [
  { id: "rede-unna", name: "Rede UNNA", instructions: null },
  { id: "dentalpar", name: "DentalPar", instructions: null },
  { id: "particular-id", name: "Particular", instructions: null },
];
const knowledgeTable = (data: unknown[] = []) => ({ select: () => ({ eq: vi.fn().mockResolvedValue({ data, error: null }) }) });

describe("incident-018 definitive WhatsApp routing", () => {
  it("resolves canonical terms and registered aliases without brand or substring matching", () => {
    const catalog = { plans, aliases: [{ alias: "Odontoprev", insurance_plan_id: "rede-unna" }, { alias: "Odontopreve", insurance_plan_id: "rede-unna" }, { alias: "Bradesco Dental", insurance_plan_id: "rede-unna" }] };
    expect(triageInsurancePlan("Odontoprev", catalog)).toEqual(expect.objectContaining({ kind: "accepted", plan: expect.objectContaining({ id: "rede-unna" }) }));
    expect(triageInsurancePlan("Odontopreve", catalog)).toEqual(expect.objectContaining({ kind: "accepted", plan: expect.objectContaining({ id: "rede-unna" }) }));
    expect(triageInsurancePlan("Olá, vocês atendem Bradesco Dental para uma avaliação?", catalog)).toEqual(expect.objectContaining({ kind: "accepted", plan: expect.objectContaining({ id: "rede-unna" }) }));
    expect(triageInsurancePlan("Meu nome é Amilton", catalog)).toEqual({ kind: "unsupported" });
    expect(triageInsurancePlan("Camila de Souza", catalog)).toEqual({ kind: "unsupported" });
    expect(triageInsurancePlan("Priscilla de Moraes Queiroz", catalog)).toEqual({ kind: "unsupported" });
    expect(triageInsurancePlan("Não possuo esse link", catalog)).toEqual({ kind: "unsupported" });
    expect(triageInsurancePlan("Sem pressa", catalog)).toEqual({ kind: "unsupported" });
  });

  it("fails closed when a normalized public plan term has more than one active owner", () => {
    expect(() => assertInsurancePlanCatalog({
      plans: [{ id: "one", name: "Odontoprev", instructions: null }, { id: "two", name: "Rede UNNA", instructions: null }],
      aliases: [{ alias: "odontoprev", insurance_plan_id: "two" }],
    })).toThrow("PLAN_CATALOG_CONFLICT");
  });

  it("uses a saved plan only for an explicit coverage question", () => {
    const knowledge = {
      plans,
      aliases: [],
      procedures: [{ id: "aparelho", name: "Aparelho", description: "Avaliação.", online_booking: false }],
      coverage: [{ procedure_id: "aparelho", insurance_plan_id: "dentalpar", accepted: true, instructions: null }],
      faqs: [{ category: "pagamento", question: "Quais formas de pagamento são aceitas?", answer: "Aceitamos cartão de crédito." }],
    };
    expect(resolveVerifiedFacts("Eu posso pagar a manutenção do aparelho no cartão de crédito?", knowledge, { insurancePlanId: "dentalpar" })).toEqual({
      kind: "resolved",
      critical: false,
      facts: { faq: knowledge.faqs[0] },
    });
    expect(resolveVerifiedFacts("DentalPar cobre aparelho?", knowledge, { insurancePlanId: "dentalpar" })).toEqual(expect.objectContaining({
      facts: expect.objectContaining({ plan: expect.objectContaining({ id: "dentalpar" }), coverage: expect.objectContaining({ status: "accepted" }) }),
    }));
  });

  it("routes a card question at the worker boundary without leaking the saved DentalPar plan", async () => {
    const paymentFaq = { category: "pagamento", question: "Quais pagamentos são aceitos?", answer: "Aceitamos cartão de crédito." };
    const knowledge = {
      plans,
      aliases: [],
      procedures: [{ id: "aparelho", name: "Aparelho", description: "Avaliação.", online_booking: false }],
      coverage: [],
      faqs: [paymentFaq],
    };
    const db = { from: (table: string) => {
      if (table === "whatsapp_plan_triage_sessions") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) };
      if (table === "patients") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { insurance_plan_id: "dentalpar" }, error: null }) }) }) };
      if (table === "insurance_plans") return {
        select: () => ({ eq: vi.fn().mockImplementation((field: string) => field === "id"
          ? { maybeSingle: vi.fn().mockResolvedValue({ data: { name: "DentalPar", active: true }, error: null }) }
          : Promise.resolve({ data: knowledge.plans, error: null })) }),
      };
      if (table === "insurance_aliases") return knowledgeTable(knowledge.aliases);
      if (table === "procedures") return knowledgeTable(knowledge.procedures);
      if (table === "procedure_coverage") return { select: vi.fn().mockResolvedValue({ data: knowledge.coverage, error: null }) };
      if (table === "faq_entries") return knowledgeTable(knowledge.faqs);
      return { update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { planTriageEnabled: true, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000034", phone: "5513999999999", message_text: "Eu posso pagar a manutenção do aparelho no cartão de crédito?", attempts: 1 });

    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", paymentFaq.answer);
    expect(evolution.sendText).not.toHaveBeenCalledWith("5513999999999", expect.stringMatching(/DentalPar|Aparelho/i));
  });

  it("routes registered child policy and link replacement deterministically", () => {
    const knowledge = {
      plans,
      aliases: [],
      procedures: [{ id: "children", name: "Crianças abaixo de 8 anos", description: "Não são realizadas consultas em menores de 8 anos.", online_booking: false }],
      faqs: [{ category: "agendamento", question: "Como marcar, remarcar ou cancelar?", answer: "Acesse o link de gerenciamento de consulta enviado pela clínica." }],
    };
    expect(resolveVerifiedFacts("Atende criança também?", knowledge)).toEqual(expect.objectContaining({ facts: expect.objectContaining({ childPolicy: expect.objectContaining({ description: expect.stringContaining("menores de 8 anos") }) }) }));
    expect(isAccessLinkRequest("Não possuo esse link")).toBe(true);
    expect(isAccessLinkRequest("não recebi o link")).toBe(true);
    expect(isAccessLinkRequest("pode enviar outro link?")).toBe(true);
    expect(resolveVerifiedFacts("Mas a clínica atende?", knowledge)).toEqual({ kind: "not_found" });
  });

  it("uses the child policy and a newly issued portal link at the worker boundary", async () => {
    const childPolicy = { id: "children", name: "Crianças abaixo de 8 anos", description: "Não são realizadas consultas em menores de 8 anos.", online_booking: false };
    const childSessionUpsert = vi.fn().mockResolvedValue({ error: null });
    const childDb = { from: (table: string) => {
      if (table === "whatsapp_plan_triage_sessions") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }), upsert: childSessionUpsert };
      if (table === "insurance_plans") return knowledgeTable(plans);
      if (table === "insurance_aliases") return knowledgeTable();
      if (table === "procedures") return knowledgeTable([childPolicy]);
      if (table === "procedure_coverage") return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      if (table === "faq_entries") return knowledgeTable();
      return { update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    } };
    const childEvolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const childWorker = new MessagingWorker(childDb as never, childEvolution as never, { planTriageEnabled: true, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);

    await childWorker.processInbox({ id: "00000000-0000-4000-8000-000000000035", phone: "5513999999999", message_text: "Atende criança também?", attempts: 1 });
    expect(childEvolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("menores de 8 anos"));
    expect(childEvolution.sendText).toHaveBeenCalledTimes(1);
    expect(childSessionUpsert).not.toHaveBeenCalled();

    const preparedLinks: Record<string, unknown>[] = [];
    const linkDb = { from: (table: string) => {
      if (table === "whatsapp_plan_triage_sessions") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) };
      return { update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    }, rpc: vi.fn().mockImplementation(async (name: string, value: Record<string, unknown>) => {
      if (name === "prepare_whatsapp_access_link") {
        preparedLinks.push(value);
        return { data: preparedAccessLink("link-children"), error: null };
      }
      if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
      return { data: null, error: null };
    }) };
    const linkEvolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const linkWorker = new MessagingWorker(linkDb as never, linkEvolution as never, { planTriageEnabled: true, portalBaseUrl: "https://agenda.example", otpSecret: testOtpSecret, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);

    await linkWorker.processInbox({ id: "00000000-0000-4000-8000-000000000036", phone: "5513999999999", message_text: "Não recebi o link", attempts: 1 });
    expect(preparedLinks).toEqual([expect.objectContaining({ p_source_inbox_id: "00000000-0000-4000-8000-000000000036" })]);
    expect(linkEvolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("https://agenda.example/acesso#token=link-children"));
  });

  it("reissues every negative link phrasing while an old plan prompt is pending", async () => {
    const session = { status: "awaiting_plan", pending_message: "quero marcar", prompted_by_inbox_id: "00000000-0000-4000-8000-000000000060", expires_at: "2099-01-01T00:00:00.000Z" };
    const savedSessions: Record<string, unknown>[] = [];
    const preparedLinks: Record<string, unknown>[] = [];
    const db = { from: (table: string) => {
      if (table === "whatsapp_plan_triage_sessions") return {
        select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: session, error: null }) }) }),
        upsert: vi.fn().mockImplementation(async (values: Record<string, unknown>) => { savedSessions.push(values); return { error: null }; }),
      };
      if (table === "insurance_plans") return knowledgeTable(plans);
      if (["insurance_aliases", "procedures", "faq_entries"].includes(table)) return knowledgeTable();
      if (table === "procedure_coverage") return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      return { update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    }, rpc: vi.fn().mockImplementation(async (name: string, value: Record<string, unknown>) => {
      if (name === "transition_whatsapp_plan_triage") return { data: true, error: null };
      if (name === "prepare_whatsapp_access_link") {
        preparedLinks.push(value);
        return { data: preparedAccessLink(`link-${preparedLinks.length}`), error: null };
      }
      if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
      return { data: null, error: null };
    }) };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { planTriageEnabled: true, portalBaseUrl: "https://agenda.example", otpSecret: testOtpSecret, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);

    for (const [offset, message] of ["Não possuo esse link", "não recebi o link", "pode enviar outro link?"].entries()) {
      await worker.processInbox({ id: `00000000-0000-4000-8000-00000000006${offset + 1}`, phone: "5513999999999", message_text: message, attempts: 1 });
    }

    expect(preparedLinks).toHaveLength(3);
    expect(evolution.sendText).toHaveBeenCalledTimes(3);
    expect(evolution.sendText).toHaveBeenLastCalledWith("5513999999999", expect.stringContaining("https://agenda.example/acesso#token="));
    expect(evolution.sendText).not.toHaveBeenCalledWith("5513999999999", expect.stringContaining("plano odontológico"));
    expect(savedSessions).toHaveLength(0);
  });

  it("keeps Amil bounded to its registered term and does not use a scheduling FAQ for a generic clinic question", async () => {
    const session = { status: "awaiting_plan", pending_message: "quero marcar", prompted_by_inbox_id: "00000000-0000-4000-8000-000000000070", expires_at: "2099-01-01T00:00:00.000Z" };
    const catalog = {
      plans: [...plans, { id: "amil", name: "Amil Dental", instructions: null }],
      aliases: [{ alias: "Amil", insurance_plan_id: "amil" }],
      procedures: [],
      coverage: [],
      faqs: [{ category: "agendamento", question: "Como marcar, remarcar ou cancelar?", answer: "FAQ de agendamento que não deve ser escolhida." }],
    };
    const savedSessions: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockImplementation(async (name: string) => {
      if (name === "transition_whatsapp_plan_triage") return { data: true, error: null };
      if (name === "enqueue_human_handoff") return { data: "00000000-0000-4000-8000-000000000071", error: null };
      return { data: null, error: null };
    });
    const db = { rpc, from: (table: string) => {
      if (table === "whatsapp_plan_triage_sessions") return {
        select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: session, error: null }) }) }),
        upsert: vi.fn().mockImplementation(async (values: Record<string, unknown>) => { savedSessions.push(values); return { error: null }; }),
      };
      if (table === "insurance_plans") return knowledgeTable(catalog.plans);
      if (table === "insurance_aliases") return knowledgeTable(catalog.aliases);
      if (table === "procedures") return knowledgeTable(catalog.procedures);
      if (table === "procedure_coverage") return { select: vi.fn().mockResolvedValue({ data: catalog.coverage, error: null }) };
      if (table === "faq_entries") return knowledgeTable(catalog.faqs);
      return { update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { planTriageEnabled: true, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000072", phone: "5513999999999", message_text: "Camila de Souza", attempts: 1 });
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000073", phone: "5513999999999", message_text: "Meu nome é Amilton", attempts: 1 });
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000074", phone: "5513999999999", message_text: "Mas a clínica atende?", attempts: 1 });

    expect(rpc).not.toHaveBeenCalledWith("accept_whatsapp_plan_triage", expect.anything());
    expect(savedSessions).toHaveLength(0);
    expect(evolution.sendText).not.toHaveBeenCalledWith("5513999999999", expect.stringContaining("Amil Dental"));
    expect(evolution.sendText).not.toHaveBeenCalledWith("5513999999999", "FAQ de agendamento que não deve ser escolhida.");
  });

  it("answers canonical Rede UNNA aliases at the worker boundary", async () => {
    const aliases = ["Odontoprev", "Odontopreve", "Bradesco Dental"];
    const db = { from: (table: string) => {
      if (table === "whatsapp_plan_triage_sessions") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) };
      if (table === "insurance_plans") return knowledgeTable(plans);
      if (table === "insurance_aliases") return knowledgeTable(aliases.map((alias) => ({ alias, insurance_plan_id: "rede-unna" })));
      if (["procedures", "faq_entries"].includes(table)) return knowledgeTable();
      if (table === "procedure_coverage") return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      return { update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { planTriageEnabled: true, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);

    for (const [offset, alias] of aliases.entries()) {
      await worker.processInbox({ id: `00000000-0000-4000-8000-00000000008${offset}`, phone: "5513999999999", message_text: alias, attempts: 1 });
    }

    expect(evolution.sendText).toHaveBeenCalledTimes(3);
    expect(evolution.sendText).toHaveBeenNthCalledWith(1, "5513999999999", "A clínica atende o plano Rede UNNA.");
    expect(evolution.sendText).toHaveBeenNthCalledWith(2, "5513999999999", "A clínica atende o plano Rede UNNA.");
    expect(evolution.sendText).toHaveBeenNthCalledWith(3, "5513999999999", "A clínica atende o plano Rede UNNA.");
  });

  it("persists a valid Particular session and patient record before replying", async () => {
    const events: string[] = [];
    const answeringInboxId = "00000000-0000-4000-8000-000000000031";
    const session = { status: "awaiting_plan", pending_message: "quero marcar", prompted_by_inbox_id: "00000000-0000-4000-8000-000000000030", expires_at: "2099-01-01T00:00:00.000Z" };
    const rpc = vi.fn().mockImplementation(async (name: string, value: Record<string, unknown>) => {
      if (name === "accept_whatsapp_plan_triage") {
        events.push("accepted_atomically");
        expect(value).toEqual({
          p_phone: "5513999999999",
          p_insurance_plan_id: "particular-id",
          p_prompted_by_inbox_id: session.prompted_by_inbox_id,
          p_answer_inbox_id: answeringInboxId,
        });
        return { data: true, error: null };
      }
      if (name === "prepare_whatsapp_access_link") return { data: preparedAccessLink("particular-link"), error: null };
      if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
      return { data: null, error: null };
    });
    const db = { from: (table: string) => {
      if (table === "whatsapp_plan_triage_sessions") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: session, error: null }) }) }) };
      if (table === "insurance_plans") return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: plans, error: null }) }) };
      if (["insurance_aliases", "procedures", "faq_entries"].includes(table)) return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      if (table === "procedure_coverage") return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      if (table === "access_tokens") return { insert: vi.fn().mockImplementation(async () => { events.push("token"); return { error: null }; }) };
      return { update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    }, rpc };
    const evolution = { sendText: vi.fn().mockImplementation(async () => { events.push("send"); }) };
    const worker = new MessagingWorker(db as never, evolution as never, { planTriageEnabled: true, portalBaseUrl: "https://agenda.example", otpSecret: testOtpSecret, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);

    await worker.processInbox({ id: answeringInboxId, phone: "5513999999999", message_text: "Particular", attempts: 1 });

    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("agenda.example/acesso#token="));
    expect(rpc).toHaveBeenCalledWith("accept_whatsapp_plan_triage", expect.objectContaining({ p_insurance_plan_id: "particular-id", p_answer_inbox_id: answeringInboxId }));
    expect(events.indexOf("accepted_atomically")).toBeLessThan(events.indexOf("send"));
  });

  it("gives a new valid-plan question priority over an awaiting-plan session", async () => {
    const session = { status: "awaiting_plan", pending_message: "quero marcar", prompted_by_inbox_id: "00000000-0000-4000-8000-000000000040", expires_at: "2099-01-01T00:00:00.000Z" };
    const savedSessions: Record<string, unknown>[] = [];
    const accessTokenInsert = vi.fn().mockResolvedValue({ error: null });
    const updates: Record<string, unknown>[] = [];
    const knowledgeTable = (data: unknown[] = []) => ({ select: () => ({ eq: vi.fn().mockResolvedValue({ data, error: null }) }) });
    const db = { rpc: vi.fn().mockImplementation(async (name: string) => name === "transition_whatsapp_plan_triage"
      ? { data: true, error: null }
      : { data: null, error: null }), from: (table: string) => {
      if (table === "whatsapp_plan_triage_sessions") return {
        select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: session, error: null }) }) }),
        upsert: vi.fn().mockImplementation(async (values: Record<string, unknown>) => { savedSessions.push(values); return { error: null }; }),
      };
      if (table === "insurance_plans") return knowledgeTable(plans);
      if (table === "insurance_aliases") return knowledgeTable([{ alias: "Bradesco Dental", insurance_plan_id: "rede-unna" }]);
      if (["procedures", "faq_entries"].includes(table)) return knowledgeTable();
      if (table === "procedure_coverage") return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      if (table === "access_tokens") return { insert: accessTokenInsert };
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { planTriageEnabled: true, portalBaseUrl: "https://agenda.example", pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000041", phone: "5513999999999", message_text: "Vocês aceitam Bradesco Dental?", attempts: 1 });

    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", "A clínica atende o plano Rede UNNA.");
    expect(accessTokenInsert).not.toHaveBeenCalled();
    expect(savedSessions).toHaveLength(0);
    expect(updates).toContainEqual(expect.objectContaining({ classified_intent: "insurance", processed_action: "structured_answer" }));
  });

  it("does not emit a link or reply when the plan-acceptance RPC rejects", async () => {
    const session = { status: "awaiting_plan", pending_message: "quero marcar", prompted_by_inbox_id: "00000000-0000-4000-8000-000000000050", expires_at: "2099-01-01T00:00:00.000Z" };
    const issuedTokens: Record<string, unknown>[] = [];
    const updates: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "STALE_TRIAGE_PROMPT" } });
    const db = { rpc, from: (table: string) => {
      if (table === "whatsapp_plan_triage_sessions") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: session, error: null }) }) }) };
      if (table === "insurance_plans") return knowledgeTable(plans);
      if (["insurance_aliases", "procedures", "faq_entries"].includes(table)) return knowledgeTable();
      if (table === "procedure_coverage") return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      if (table === "access_tokens") return { insert: vi.fn().mockImplementation(async (values: Record<string, unknown>) => { issuedTokens.push(values); return { error: null }; }) };
      return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { planTriageEnabled: true, portalBaseUrl: "https://agenda.example", pollMs: 100, healthPort: 3001, allowedRecipients: ["5513999999999"] } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000051", phone: "5513999999999", message_text: "Particular", attempts: 1 });

    expect(rpc).toHaveBeenCalledWith("accept_whatsapp_plan_triage", expect.objectContaining({ p_prompted_by_inbox_id: session.prompted_by_inbox_id }));
    expect(issuedTokens).toHaveLength(0);
    expect(evolution.sendText).not.toHaveBeenCalled();
    expect(updates).toContainEqual(expect.objectContaining({ status: "failed" }));
  });

  it("retries instead of bypassing plan triage when a concurrent CAS loses", async () => {
    const updates: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockImplementation(async (name: string) => name === "transition_whatsapp_plan_triage"
      ? { data: false, error: null }
      : { data: null, error: null });
    const db = {
      rpc,
      from: (table: string) => {
        if (table === "whatsapp_plan_triage_sessions") return {
          select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
        };
        if (table === "patients") return {
          select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
        };
        if (table === "insurance_plans") return knowledgeTable(plans);
        if (["insurance_aliases", "procedures", "faq_entries"].includes(table)) return knowledgeTable();
        if (table === "procedure_coverage") return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
        return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
      },
    };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, {
      planTriageEnabled: true,
      portalBaseUrl: "https://agenda.example",
      pollMs: 100,
      healthPort: 3001,
      allowedRecipients: ["5513999999999"],
    } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000052", phone: "5513999999999", message_text: "quero marcar", attempts: 1 });

    expect(rpc).toHaveBeenCalledWith("transition_whatsapp_plan_triage", expect.objectContaining({ p_action: "replace" }));
    expect(evolution.sendText).not.toHaveBeenCalled();
    expect(updates).toContainEqual(expect.objectContaining({ status: "failed", last_error: "processing_failed" }));
  });

  it("retries an accepted answer with its original request and its one persisted link", async () => {
    const promptId = "00000000-0000-4000-8000-000000000090";
    const answerId = "00000000-0000-4000-8000-000000000091";
    let session: Record<string, unknown> = {
      status: "awaiting_plan",
      pending_message: "quero marcar",
      prompted_by_inbox_id: promptId,
      expires_at: "2099-01-01T00:00:00.000Z",
    };
    const acceptance = vi.fn().mockImplementation(async (_name: string, value: Record<string, unknown>) => {
      session = {
        ...session,
        status: "accepted",
        insurance_plan_id: value.p_insurance_plan_id,
        // Migration 026 dropped p_answer_inbox_id from the RPC; the session
        // schema still tracks it separately for audit purposes, so the
        // worker-derived `row.id` is what feeds accepted_by_inbox_id.
        accepted_by_inbox_id: answerId,
      };
      return { data: true, error: null };
    });
    const preparedLinks: Record<string, unknown>[] = [];
    const db = {
      rpc: vi.fn().mockImplementation(async (name: string, value: Record<string, unknown>) => {
        if (name === "accept_whatsapp_plan_triage") return acceptance(name, value);
        if (name === "prepare_whatsapp_access_link") {
          preparedLinks.push(value);
          return { data: preparedAccessLink("one-reusable-link"), error: null };
        }
        if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
        if (name === "transition_whatsapp_plan_triage") return { data: true, error: null };
        return { data: null, error: null };
      }),
      from: (table: string) => {
        if (table === "whatsapp_plan_triage_sessions") return {
          select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockImplementation(async () => ({ data: session, error: null })) }) }),
        };
        if (table === "insurance_plans") return knowledgeTable([{ id: "particular-id", name: "Particular", instructions: null }]);
        if (["insurance_aliases", "procedures", "faq_entries"].includes(table)) return knowledgeTable();
        if (table === "procedure_coverage") return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
        return { update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
      },
    };
    const evolution = { sendText: vi.fn().mockRejectedValueOnce(new Error("provider unavailable")).mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, {
      planTriageEnabled: true,
      portalBaseUrl: "https://agenda.example",
      otpSecret: testOtpSecret,
      pollMs: 100,
      healthPort: 3001,
      allowedRecipients: ["5513999999999"],
    } as never);
    const row = { id: answerId, phone: "5513999999999", message_text: "Particular", attempts: 1 };

    await worker.processInbox(row);
    await worker.processInbox({ ...row, attempts: 2 });

    expect(acceptance).toHaveBeenCalledTimes(2);
    expect(preparedLinks).toHaveLength(2);
    expect(preparedLinks.map((value) => value.p_source_inbox_id)).toEqual([answerId, answerId]);
    expect(evolution.sendText).toHaveBeenCalledTimes(2);
    expect(evolution.sendText).toHaveBeenLastCalledWith("5513999999999", expect.stringContaining("one-reusable-link"));
  });

  it("finalizes an inbox retry without calling the provider again after link delivery was recorded", async () => {
    const updates: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockImplementation(async (name: string) => {
      if (name === "prepare_whatsapp_access_link") return { data: preparedAccessLink("already-sent-link", "5513999999999", "2099-01-01T00:00:00.000Z"), error: null };
      if (name === "mark_whatsapp_access_link_delivered") throw new Error("must not finalize a delivery already sent");
      return { data: null, error: null };
    });
    const db = {
      rpc,
      from: () => ({ update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) }),
    };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, {
      portalBaseUrl: "https://agenda.example",
      otpSecret: testOtpSecret,
      pollMs: 100,
      healthPort: 3001,
      allowedRecipients: ["5513999999999"],
    } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000092", phone: "5513999999999", message_text: "quero marcar", attempts: 2 });

    expect(evolution.sendText).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith("mark_whatsapp_access_link_delivered", expect.anything());
    expect(updates).toContainEqual(expect.objectContaining({ status: "processed", processed_action: "portal_link" }));
  });

  it("matches short head words of multi-word plans without leaking them into unrelated patient names", () => {
    const catalog = {
      plans: [
        { id: "rede-unna", name: "Rede UNNA", instructions: null },
        { id: "unimed", name: "Unimed Odonto", instructions: null },
        { id: "amil", name: "Amil Dental", instructions: null },
      ],
      aliases: [
        { alias: "Bradesco Dental", insurance_plan_id: "rede-unna" },
        { alias: "OdontoPrev", insurance_plan_id: "rede-unna" },
      ],
    };
    // Head-only match: patient types the brand prefix, clinic still answers.
    expect(triageInsurancePlan("Bradesco", catalog)).toEqual(expect.objectContaining({ kind: "accepted", plan: expect.objectContaining({ id: "rede-unna" }) }));
    expect(triageInsurancePlan("AMIL", catalog)).toEqual(expect.objectContaining({ kind: "accepted", plan: expect.objectContaining({ id: "amil" }) }));
    expect(triageInsurancePlan("Unimed", catalog)).toEqual(expect.objectContaining({ kind: "accepted", plan: expect.objectContaining({ id: "unimed" }) }));
    // Substring inside an unrelated name still does not match.
    expect(triageInsurancePlan("Amilton", catalog)).toEqual({ kind: "unsupported" });
    expect(triageInsurancePlan("Camila de Souza", catalog)).toEqual({ kind: "unsupported" });
  });

  it("accepts a head-only answer during plan triage and persists the resolved plan", async () => {
    const aliases = [{ alias: "Bradesco Dental", insurance_plan_id: "rede-unna" }];
    const plan = { id: "rede-unna", name: "Rede UNNA", instructions: null };
    const preparedLinks: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockImplementation(async (name: string, value: Record<string, unknown>) => {
      if (name === "transition_whatsapp_plan_triage") return { data: true, error: null };
      if (name === "accept_whatsapp_plan_triage") return { data: true, error: null };
      if (name === "prepare_whatsapp_access_link") {
        preparedLinks.push(value);
        return { data: preparedAccessLink("head-link"), error: null };
      }
      if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
      return { data: null, error: null };
    });
    const db = {
      rpc,
      from: (table: string) => {
        if (table === "whatsapp_plan_triage_sessions") return {
          select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({
            data: { status: "awaiting_plan", pending_message: "quero marcar", prompted_by_inbox_id: "00000000-0000-4000-8000-000000000061", expires_at: "2099-01-01T00:00:00.000Z" },
            error: null,
          }) }) }),
        };
        if (table === "insurance_plans") return knowledgeTable([plan, { id: "particular-id", name: "Particular", instructions: null }]);
        if (table === "insurance_aliases") return knowledgeTable(aliases);
        if (["procedures", "faq_entries"].includes(table)) return knowledgeTable();
        if (table === "procedure_coverage") return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
        return { update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
      },
    };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, {
      planTriageEnabled: true,
      portalBaseUrl: "https://agenda.example",
      otpSecret: testOtpSecret,
      pollMs: 100,
      healthPort: 3001,
      allowedRecipients: ["5513999999999"],
    } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000062", phone: "5513999999999", message_text: "Bradesco", attempts: 1 });

    expect(rpc).toHaveBeenCalledWith("accept_whatsapp_plan_triage", expect.objectContaining({ p_insurance_plan_id: "rede-unna" }));
    expect(preparedLinks).toHaveLength(1);
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("agenda.example/acesso#token=head-link"));
  });

  it("emits a secure link on a covered procedure even when the patient never typed 'marcar'", async () => {
    const knowledge = {
      plans: [
        { id: "unimed", name: "Unimed Odonto", instructions: null },
        { id: "particular-id", name: "Particular", instructions: null },
      ],
      aliases: [],
      procedures: [{ id: "limpeza", name: "Limpeza", description: "Avaliação inicial.", online_booking: true }],
      coverage: [{ procedure_id: "limpeza", insurance_plan_id: "unimed", accepted: true, instructions: null }],
      faqs: [],
    };
    const preparedLinks: Record<string, unknown>[] = [];
    const db = {
      rpc: vi.fn().mockImplementation(async (name: string) => {
        if (name === "transition_whatsapp_plan_triage") return { data: true, error: null };
        if (name === "accept_whatsapp_plan_triage") return { data: true, error: null };
        if (name === "prepare_whatsapp_access_link") {
          preparedLinks.push({ p_source_inbox_id: "00000000-0000-4000-8000-000000000063" });
          return { data: preparedAccessLink("coverage-link"), error: null };
        }
        if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
        return { data: null, error: null };
      }),
      from: (table: string) => {
        if (table === "whatsapp_plan_triage_sessions") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) };
        if (table === "patients") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) };
        if (table === "insurance_plans") return knowledgeTable(knowledge.plans);
        if (table === "insurance_aliases") return knowledgeTable(knowledge.aliases);
        if (table === "procedures") return knowledgeTable(knowledge.procedures);
        if (table === "procedure_coverage") return { select: vi.fn().mockResolvedValue({ data: knowledge.coverage, error: null }) };
        if (table === "faq_entries") return knowledgeTable(knowledge.faqs);
        return { update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
      },
    };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, {
      planTriageEnabled: true,
      portalBaseUrl: "https://agenda.example",
      otpSecret: testOtpSecret,
      pollMs: 100,
      healthPort: 3001,
      allowedRecipients: ["5513999999999"],
    } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000063", phone: "5513999999999", message_text: "Unimed cobre limpeza?", attempts: 1 });

    expect(preparedLinks).toHaveLength(1);
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringMatching(/Agendar consulta[\s\S]*agenda\.example\/acesso#token=/));
  });

  // PR 5: feature-flag plumbing. The shadow call site is owned by PR 4;
  // here we only assert that the flag is wired correctly so the shadow
  // counters (`luna_routing_shadow_total`, `luna_routing_disagreement_total`)
  // remain zero when the flag is `off`. PR 4 will assert the positive path.
  it("emits no shadow routing counters when the LLM routing flag is 'off'", async () => {
    resetMetricsForTests();
    const db = {
      from: () => ({ update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
    };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, {
      planTriageEnabled: true,
      pollMs: 100,
      healthPort: 3001,
      allowedRecipients: ["5513999999999"],
      llmRouting: "off",
    } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000064", phone: "5513999999999", message_text: "Oi", attempts: 1 });

    const rendered = renderPrometheusMetrics();
    expect(rendered).not.toMatch(/luna_routing_shadow_total\b/);
    expect(rendered).not.toMatch(/luna_routing_disagreement_total\b/);
  });

  // PR 5: the shadow metric only increments when the flag is explicitly
  // 'shadow'. PR 4's full coverage tests assert the value of the counters;
  // this case pins down the gating precondition so PR 4 cannot regress the
  // flag without flipping this test red.
  it("increments the shadow counter only when the flag is 'shadow'", async () => {
    resetMetricsForTests();
    const buildWorker = (llmRouting: "off" | "shadow" | "llm" | "regex_only") => {
      const db = {
        from: () => ({ update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
      };
      const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
      return new MessagingWorker(db as never, evolution as never, {
        planTriageEnabled: true,
        pollMs: 100,
        healthPort: 3001,
        allowedRecipients: ["5513999999999"],
        openaiApiKey: llmRouting === "shadow" ? "test-key" : undefined,
        llmRouting,
      } as never);
    };

    for (const mode of ["off", "llm", "regex_only"] as const) {
      resetMetricsForTests();
      const worker = buildWorker(mode);
      await worker.processInbox({ id: `00000000-0000-4000-8000-00000000006${5 + ["off", "llm", "regex_only"].indexOf(mode)}`, phone: "5513999999999", message_text: "Oi", attempts: 1 });
      const rendered = renderPrometheusMetrics();
      expect(rendered, `flag=${mode}`).not.toMatch(/luna_routing_shadow_total\b/);
    }

    // When 'shadow' is set the constructor accepts the flag; PR 4 owns the
    // assertion that the metric increments. The shape contract here is that
    // the flag is forwarded to the config — verified by checking that the
    // 'shadow' branch completes without throwing (PR 4's shadow call is a
    // no-op until PR 4 wires it).
    resetMetricsForTests();
    const shadowWorker = buildWorker("shadow");
    await expect(shadowWorker.processInbox({ id: "00000000-0000-4000-8000-000000000080", phone: "5513999999999", message_text: "Oi", attempts: 1 })).resolves.not.toThrow();
  });

  // PR 4: shadow mode — the LLM observes every inbox row and the regex
  // cascade still replies. The success path increments the shadow counter
  // with the LLM's first tool call.
  it("records a successful shadow verdict without altering the regex reply", async () => {
    resetMetricsForTests();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ calls: [{ name: "request_scheduling_link", arguments: { kind: "schedule" } }] }) }] }],
          usage: { input_tokens: 12, output_tokens: 4 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const preparedLinks: Record<string, unknown>[] = [];
    const db = {
      rpc: vi.fn().mockImplementation(async (name: string, value: Record<string, unknown>) => {
        if (name === "prepare_whatsapp_access_link") {
          preparedLinks.push(value);
          return { data: preparedAccessLink("shadow-link"), error: null };
        }
        if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
        return { data: null, error: null };
      }),
      from: () => ({ update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
    };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, {
      planTriageEnabled: false,
      portalBaseUrl: "https://agenda.example",
      otpSecret: testOtpSecret,
      pollMs: 100,
      healthPort: 3001,
      allowedRecipients: ["5513999999999"],
      openaiApiKey: "test-shadow-key",
      openaiRoutingModel: "gpt-4o-mini",
      openaiRoutingTimeoutMs: 4000,
      llmRouting: "shadow",
    } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000090", phone: "5513999999999", message_text: "quero marcar", attempts: 1 });

    // Regex reply must still go out, unchanged.
    expect(preparedLinks).toHaveLength(1);
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("agenda.example/acesso#token=shadow-link"));
    // The OpenAI stub must have been hit exactly once (the shadow call).
    expect(fetcher).toHaveBeenCalledTimes(1);
    const rendered = renderPrometheusMetrics();
    expect(rendered).toMatch(/luna_routing_shadow_total\{[^}]*tool="request_scheduling_link"[^}]*\}/);
    expect(rendered).toMatch(/luna_routing_shadow_total\{[^}]*outcome="success"[^}]*\}/);
    vi.unstubAllGlobals();
  });

  // PR 4: shadow call must never break the regex cascade. When OpenAI
  // returns 500, the inbox row still finalizes with `portal_link` and the
  // shadow counter records the failure.
  it("still finalizes the inbox with a portal_link when the shadow call 5xx's", async () => {
    resetMetricsForTests();
    const fetcher = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetcher);
    const preparedLinks: Record<string, unknown>[] = [];
    const updates: Record<string, unknown>[] = [];
    const db = {
      rpc: vi.fn().mockImplementation(async (name: string, value: Record<string, unknown>) => {
        if (name === "prepare_whatsapp_access_link") {
          preparedLinks.push(value);
          return { data: preparedAccessLink("shadow-5xx-link"), error: null };
        }
        if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
        return { data: null, error: null };
      }),
      from: () => ({ update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) }),
    };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, {
      planTriageEnabled: false,
      portalBaseUrl: "https://agenda.example",
      otpSecret: testOtpSecret,
      pollMs: 100,
      healthPort: 3001,
      allowedRecipients: ["5513999999999"],
      openaiApiKey: "test-shadow-key",
      openaiRoutingModel: "gpt-4o-mini",
      openaiRoutingTimeoutMs: 4000,
      llmRouting: "shadow",
    } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000091", phone: "5513999999999", message_text: "quero marcar", attempts: 1 });

    // Regex cascade still produced the portal link and the row finalised.
    expect(preparedLinks).toHaveLength(1);
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("agenda.example/acesso#token=shadow-5xx-link"));
    expect(updates).toContainEqual(expect.objectContaining({ processed_action: "portal_link" }));
    // The shadow counter recorded the failure but did NOT throw.
    const rendered = renderPrometheusMetrics();
    expect(rendered).toMatch(/luna_routing_shadow_total\{[^}]*tool="none"[^}]*\}/);
    expect(rendered).toMatch(/luna_routing_shadow_total\{[^}]*outcome="unreachable"[^}]*\}/);
    expect(rendered).not.toMatch(/luna_routing_disagreement_total\b/);
    vi.unstubAllGlobals();
  });

  // PR 6: LLM-primary path. When `llmRouting === "llm"` and the router
  // returns a tool inside the allowlist, the worker emits the LLM reply,
  // tags the inbox row with `routing="llm"`, and increments the new tool
  // and call counters. The stubbed tool executor returns the placeholder
  // reply; PR 7+ will wire real templates.
  it("routes request_scheduling_link via the LLM and emits portal_link with routing=llm", async () => {
    resetMetricsForTests();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ calls: [{ name: "request_scheduling_link", arguments: { kind: "reschedule" } }] }) }] }],
          usage: { input_tokens: 50, output_tokens: 10 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const updates: Record<string, unknown>[] = [];
    const db = {
      from: () => ({ update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) }),
      rpc: vi.fn().mockImplementation(async (name: string) => {
        if (name === "read_whatsapp_conversation_slots") return { data: null, error: null };
        if (name === "prepare_whatsapp_access_link") return { data: preparedAccessLink("llm-link"), error: null };
        if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
        return { data: true, error: null };
      }),
    };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, {
      planTriageEnabled: false,
      portalBaseUrl: "https://agenda.example",
      otpSecret: testOtpSecret,
      pollMs: 100,
      healthPort: 3001,
      allowedRecipients: ["5513999999999"],
      openaiApiKey: "test-llm-key",
      openaiRoutingModel: "gpt-4o-mini",
      openaiRoutingTimeoutMs: 4000,
      llmRouting: "llm",
    } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000100", phone: "5513999999999", message_text: "quero remarcar", attempts: 1 });

    // PR 7 wired the real executor: it returns the access-link interactive
    // message (Evolution receives `fallbackText` when `interactiveMessages`
    // is off in this test fixture).
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("agenda.example/acesso#token="));
    expect(updates).toContainEqual(expect.objectContaining({ processed_action: "portal_link" }));
    const rendered = renderPrometheusMetrics();
    expect(rendered).toMatch(/luna_routing_calls_total\{[^}]*outcome="success"[^}]*routing="llm"[^}]*\}/);
    expect(rendered).toMatch(/luna_routing_tool_total\{[^}]*outcome="success"[^}]*tool="request_scheduling_link"[^}]*\}/);
    expect(rendered).toMatch(/luna_routing_tokens_total\{[^}]*routing="llm"[^}]*\}/);
    expect(rendered).toMatch(/luna_routing_call_duration_seconds_bucket\{[^}]*routing="llm"[^}]*\}/);
    expect(rendered).toMatch(/luna_openai_ready\b/);
    vi.unstubAllGlobals();
  });

  // PR 6: answer_plan from the LLM is mapped to `structured_answer` and the
  // routing label is `llm`. PR 7 wires the real executor, so the worker
  // serves the `rede-unna` plan through the knowledge table and the LLM
  // executor returns `verifiedPlanMessage` (not a stub placeholder).
  it("routes answer_plan via the LLM and emits structured_answer with routing=llm", async () => {
    resetMetricsForTests();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ calls: [{ name: "answer_plan", arguments: { plan_id: "rede-unna" } }] }) }] }],
          usage: { input_tokens: 80, output_tokens: 20 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const updates: Record<string, unknown>[] = [];
    const db = {
      from: (table: string) => {
        if (table === "insurance_plans") return knowledgeTable(plans);
        if (["insurance_aliases", "procedures", "procedure_coverage", "faq_entries"].includes(table)) return knowledgeTable();
        return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
      },
      rpc: vi.fn().mockImplementation(async (name: string) => {
        if (name === "read_whatsapp_conversation_slots") return { data: null, error: null };
        return { data: true, error: null };
      }),
    };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, {
      planTriageEnabled: false,
      pollMs: 100,
      healthPort: 3001,
      allowedRecipients: ["5513999999999"],
      openaiApiKey: "test-llm-key",
      openaiRoutingModel: "gpt-4o-mini",
      openaiRoutingTimeoutMs: 4000,
      llmRouting: "llm",
    } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000101", phone: "5513999999999", message_text: "Vocês aceitam Rede UNNA?", attempts: 1 });

    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", "A clínica atende o plano Rede UNNA.");
    expect(updates).toContainEqual(expect.objectContaining({ processed_action: "structured_answer" }));
    const rendered = renderPrometheusMetrics();
    expect(rendered).toMatch(/luna_routing_calls_total\{[^}]*outcome="success"[^}]*routing="llm"[^}]*\}/);
    expect(rendered).toMatch(/luna_routing_tool_total\{[^}]*outcome="success"[^}]*tool="answer_plan"[^}]*\}/);
    vi.unstubAllGlobals();
  });

  // PR 6: when the LLM times out, the worker falls back to the regex cascade
  // and emits `routing="regex"`. The `luna_routing_calls_total{outcome=timeout}`
  // counter is incremented. Slot writes are NOT applied (PR 7+).
  it("falls back to the regex cascade when the LLM times out", async () => {
    resetMetricsForTests();
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn().mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }));
      vi.stubGlobal("fetch", fetcher);
      const updates: Record<string, unknown>[] = [];
      const preparedLinks: Record<string, unknown>[] = [];
      const db = {
        from: () => ({ update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) }),
        rpc: vi.fn().mockImplementation(async (name: string, value: Record<string, unknown>) => {
          if (name === "prepare_whatsapp_access_link") {
            preparedLinks.push(value);
            return { data: preparedAccessLink("timeout-link"), error: null };
          }
          if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
          return { data: null, error: null };
        }),
      };
      const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
      const worker = new MessagingWorker(db as never, evolution as never, {
        planTriageEnabled: false,
        portalBaseUrl: "https://agenda.example",
        otpSecret: testOtpSecret,
        pollMs: 100,
        healthPort: 3001,
        allowedRecipients: ["5513999999999"],
        openaiApiKey: "test-llm-key",
        openaiRoutingModel: "gpt-4o-mini",
        openaiRoutingTimeoutMs: 50,
        openaiRoutingMaxRetries: 0,
        llmRouting: "llm",
      } as never);

      const promise = worker.processInbox({ id: "00000000-0000-4000-8000-000000000102", phone: "5513999999999", message_text: "quero marcar", attempts: 1 });
      // The LLM call aborts after 50ms; the regex fallback then issues the link.
      await vi.advanceTimersByTimeAsync(200);
      await promise;

      // Regex cascade replied with the link — slot writes were never applied
      // because the LLM path did not produce one.
      expect(preparedLinks).toHaveLength(1);
      expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("agenda.example/acesso#token=timeout-link"));
      expect(updates).toContainEqual(expect.objectContaining({ processed_action: "portal_link" }));
      const rendered = renderPrometheusMetrics();
      expect(rendered).toMatch(/luna_routing_calls_total\{[^}]*outcome="timeout"[^}]*routing="llm"[^}]*\}/);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  // PR 6: when the LLM emits a tool outside the 18-name allowlist, the
  // worker logs `openai_ungrounded_tool` and falls back to the regex
  // cascade. The `luna_routing_calls_total{outcome=ungrounded}` counter is
  // incremented and the row finalizes with `routing="regex"`.
  it("falls back to the regex cascade when the LLM returns an ungrounded tool", async () => {
    resetMetricsForTests();
    // The Zod schema in chat.ts rejects tools outside the enum, so the LLM
    // path surfaces this as OPENAI_SCHEMA_INVALID. We simulate the same
    // observable behaviour by returning an empty decision list.
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ calls: [] }) }] }],
          usage: { input_tokens: 30, output_tokens: 5 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const updates: Record<string, unknown>[] = [];
    const preparedLinks: Record<string, unknown>[] = [];
    const db = {
      from: () => ({ update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) }),
      rpc: vi.fn().mockImplementation(async (name: string, value: Record<string, unknown>) => {
        if (name === "prepare_whatsapp_access_link") {
          preparedLinks.push(value);
          return { data: preparedAccessLink("ungrounded-link"), error: null };
        }
        if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
        return { data: null, error: null };
      }),
    };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, {
      planTriageEnabled: false,
      portalBaseUrl: "https://agenda.example",
      otpSecret: testOtpSecret,
      pollMs: 100,
      healthPort: 3001,
      allowedRecipients: ["5513999999999"],
      openaiApiKey: "test-llm-key",
      openaiRoutingModel: "gpt-4o-mini",
      openaiRoutingTimeoutMs: 4000,
      llmRouting: "llm",
    } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000103", phone: "5513999999999", message_text: "quero marcar", attempts: 1 });

    expect(preparedLinks).toHaveLength(1);
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("agenda.example/acesso#token=ungrounded-link"));
    expect(updates).toContainEqual(expect.objectContaining({ processed_action: "portal_link" }));
    const rendered = renderPrometheusMetrics();
    // Empty calls fail the router validation; the worker logs schema_invalid
    // and increments the matching outcome counter.
    expect(rendered).toMatch(/luna_routing_calls_total\{[^}]*outcome="schema_invalid"[^}]*routing="llm"[^}]*\}/);
    vi.unstubAllGlobals();
  });

  // PR 6: when the LLM emits a tool with invalid arguments, the worker
  // falls back to the regex cascade. The executor is invoked AFTER
  // validation, so an invalid argument reaches the catch path. PR 6 stubs
  // don't fail validation, so we exercise the same observable behaviour
  // by routing a tool with a name that exists in the registry but whose
  // executor raises (we monkeypatch the registry via a fresh import).
  it("falls back to the regex cascade when the tool executor throws", async () => {
    resetMetricsForTests();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ calls: [{ name: "answer_plan", arguments: { plan_id: "rede-unna" } }] }) }] }],
          usage: { input_tokens: 60, output_tokens: 12 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const updates: Record<string, unknown>[] = [];
    const preparedLinks: Record<string, unknown>[] = [];
    const db = {
      from: () => ({ update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) }),
      rpc: vi.fn().mockImplementation(async (name: string, value: Record<string, unknown>) => {
        if (name === "prepare_whatsapp_access_link") {
          preparedLinks.push(value);
          return { data: preparedAccessLink("tool-rpc-link"), error: null };
        }
        if (name === "mark_whatsapp_access_link_delivered") return { data: true, error: null };
        return { data: null, error: null };
      }),
    };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, {
      planTriageEnabled: false,
      portalBaseUrl: "https://agenda.example",
      otpSecret: testOtpSecret,
      pollMs: 100,
      healthPort: 3001,
      allowedRecipients: ["5513999999999"],
      openaiApiKey: "test-llm-key",
      openaiRoutingModel: "gpt-4o-mini",
      openaiRoutingTimeoutMs: 4000,
      llmRouting: "llm",
    } as never);

    // Stub the router-tools executor so this specific tool throws; the
    // worker should catch it and route to regex. We mutate the entry on
    // the registry object directly because vi.stubGlobal can't override
    // the named export, and ESM module properties are read-only getters.
    const routerTools = await import("@/domain/messaging/router-tools");
    const originalEntry = routerTools.ROUTER_TOOLS.answer_plan;
    const failingEntry = { ...originalEntry, execute: vi.fn().mockRejectedValue(new Error("rpc_failed")) };
    (routerTools.ROUTER_TOOLS as Record<string, typeof originalEntry>).answer_plan = failingEntry;
    try {
      await worker.processInbox({ id: "00000000-0000-4000-8000-000000000104", phone: "5513999999999", message_text: "quero marcar", attempts: 1 });
    } finally {
      (routerTools.ROUTER_TOOLS as Record<string, typeof originalEntry>).answer_plan = originalEntry;
    }

    expect(failingEntry.execute).toHaveBeenCalledTimes(1);
    expect(preparedLinks).toHaveLength(1);
    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("agenda.example/acesso#token=tool-rpc-link"));
    expect(updates).toContainEqual(expect.objectContaining({ processed_action: "portal_link" }));
    const rendered = renderPrometheusMetrics();
    expect(rendered).toMatch(/luna_routing_calls_total\{[^}]*outcome="tool_rpc_failed"[^}]*routing="llm"[^}]*\}/);
    expect(rendered).toMatch(/luna_routing_tool_total\{[^}]*outcome="rpc_failed"[^}]*tool="answer_plan"[^}]*\}/);
    vi.unstubAllGlobals();
  });

  // PR 6: plan triage CAS stays intact when the LLM is primary but falls
  // back to regex. `preparePlanTriage` runs before the router, so a missing
  // plan must still trigger the awaiting-plan reply (the regex cascade's
  // plan_requested action) regardless of the routing flag.
  it("preserves plan triage CAS when llmRouting='llm' and the router falls back", async () => {
    resetMetricsForTests();
    const fetcher = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetcher);
    const updates: Record<string, unknown>[] = [];
    const transitions: Record<string, unknown>[] = [];
    const db = {
      rpc: vi.fn().mockImplementation(async (name: string, value: Record<string, unknown>) => {
        if (name === "transition_whatsapp_plan_triage") {
          transitions.push(value);
          return { data: true, error: null };
        }
        return { data: null, error: null };
      }),
      from: (table: string) => {
        if (table === "whatsapp_plan_triage_sessions") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) };
        if (table === "patients") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) };
        if (table === "insurance_plans") return knowledgeTable(plans);
        if (["insurance_aliases", "procedures", "faq_entries"].includes(table)) return knowledgeTable();
        if (table === "procedure_coverage") return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
        return { update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) };
      },
    };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, {
      planTriageEnabled: true,
      pollMs: 100,
      healthPort: 3001,
      allowedRecipients: ["5513999999999"],
      openaiApiKey: "test-llm-key",
      openaiRoutingModel: "gpt-4o-mini",
      openaiRoutingTimeoutMs: 4000,
      llmRouting: "llm",
    } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000105", phone: "5513999999999", message_text: "quero marcar", attempts: 1 });

    // Plan triage transitioned, prompt was sent, processed_action=plan_requested
    expect(transitions).toHaveLength(1);
    expect(evolution.sendText).toHaveBeenCalledTimes(1);
    expect(updates).toContainEqual(expect.objectContaining({ processed_action: "plan_requested" }));
    vi.unstubAllGlobals();
  });

  // PR 6: lease semantics survive an LLM crash. When the router throws,
  // the inbox row still finalizes through `finish_whatsapp_inbox_leased`
  // with a `failed` status (the lease retry path). The plan-triage state
  // is preserved so a subsequent retry can resume.
  it("finalizes the inbox lease when the LLM path throws", async () => {
    resetMetricsForTests();
    const fetcher = vi.fn().mockRejectedValue(new Error("network gone"));
    vi.stubGlobal("fetch", fetcher);
    const updates: Record<string, unknown>[] = [];
    const rpc = vi.fn().mockImplementation(async (name: string) => {
      if (name === "finish_whatsapp_inbox_leased") return { data: true, error: null };
      return { data: null, error: null };
    });
    const db = {
      rpc,
      from: () => ({ update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) }),
    };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, {
      planTriageEnabled: false,
      pollMs: 100,
      healthPort: 3001,
      allowedRecipients: ["5513999999999"],
      openaiApiKey: "test-llm-key",
      openaiRoutingModel: "gpt-4o-mini",
      openaiRoutingTimeoutMs: 4000,
      llmRouting: "llm",
    } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000106", phone: "5513999999999", message_text: "Oi", attempts: 1, lease_token: "lease-token-106" });

    // Even when the LLM throws, the inbox row still finalizes through
    // `finish_whatsapp_inbox_leased` — the regex fallback absorbs the
    // throw and the row is processed normally. The lease is preserved
    // across the call so a subsequent retry can resume.
    expect(rpc).toHaveBeenCalledWith(
      "finish_whatsapp_inbox_leased",
      expect.objectContaining({
        claimed_token: "lease-token-106",
        final_status: "processed",
        intent: "greeting",
        action: "structured_answer",
      }),
    );
    vi.unstubAllGlobals();
  });

  // PR 6: when `llmRouting="llm"` but the API key is missing, the worker
  // short-circuits to regex without calling OpenAI. This is the
  // `api_key_missing` fallback reason.
  it("short-circuits to regex when llmRouting='llm' but the API key is missing", async () => {
    resetMetricsForTests();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const updates: Record<string, unknown>[] = [];
    const db = {
      from: () => ({ update: (values: Record<string, unknown>) => ({ eq: vi.fn().mockImplementation(async () => { updates.push(values); return { error: null }; }) }) }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, {
      planTriageEnabled: false,
      pollMs: 100,
      healthPort: 3001,
      allowedRecipients: ["5513999999999"],
      openaiApiKey: undefined,
      llmRouting: "llm",
    } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000107", phone: "5513999999999", message_text: "Oi", attempts: 1 });

    expect(fetcher).not.toHaveBeenCalled();
    expect(evolution.sendText).toHaveBeenCalledTimes(1);
    const rendered = renderPrometheusMetrics();
    expect(rendered).toMatch(/luna_routing_calls_total\{[^}]*outcome="api_key_missing"[^}]*routing="llm"[^}]*\}/);
    expect(rendered).not.toMatch(/luna_routing_calls_total\{[^}]*outcome="success"[^}]*\}/);
    vi.unstubAllGlobals();
  });

  it("answers plan queries that end or start with the plan name (boundary bug regression)", async () => {
    // Reproduces the literal patient messages from the WhatsApp screenshots:
    //   "Mas não atende SulAmérica?"  → "A clínica atende o plano SulAmérica."
    //   "Aceita convênio Bradesco?"  → routed to answer_plan_list (the message
    //   contains both "aceita" and "convenio" so it triggers asksForPlanList
    //   and returns the full list — the previous behaviour was the generic
    //   fallback, so the list reply is itself an upgrade from the bug).
    // Both used to fall through to `knowledgeFallbackMessage` because
    // `containsExactTerm` required spaces on both sides of the needle. The
    // word-boundary regex now lets the plan name match at the start, end, or
    // before punctuation of the patient message.
    resetMetricsForTests();
    const aliases = [{ alias: "Bradesco Dental", insurance_plan_id: "rede-unna" }];
    const plansWithSulAmerica = [...plans, { id: "sulamerica", name: "SulAmérica", instructions: null }];
    const db = { from: (table: string) => {
      if (table === "whatsapp_plan_triage_sessions") return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) };
      if (table === "insurance_plans") return knowledgeTable(plansWithSulAmerica);
      if (table === "insurance_aliases") return knowledgeTable(aliases);
      if (["procedures", "faq_entries"].includes(table)) return knowledgeTable();
      if (table === "procedure_coverage") return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      return { update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    } };
    const evolution = { sendText: vi.fn().mockResolvedValue(undefined) };
    const worker = new MessagingWorker(db as never, evolution as never, { planTriageEnabled: false, pollMs: 100, healthPort: 3001, allowedRecipients: ["5513991743380"] } as never);

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000200", phone: "5513991743380", message_text: "Mas não atende SulAmérica?", attempts: 1 });
    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000201", phone: "5513991743380", message_text: "Aceita convênio Bradesco?", attempts: 1 });

    expect(evolution.sendText).toHaveBeenCalledWith("5513991743380", "A clínica atende o plano SulAmérica.");
    // Second message: "Aceita convênio Bradesco?" trips asksForPlanList and
    // returns the canonical plan list. Crucially, it does NOT return the
    // generic knowledgeFallbackMessage anymore.
    expect(evolution.sendText).toHaveBeenCalledWith("5513991743380", expect.stringContaining("Os planos ativos são:"));
    expect(evolution.sendText).not.toHaveBeenCalledWith("5513991743380", expect.stringContaining("Não localizei"));
  });
});
