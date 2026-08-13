import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { isAccessLinkRequest } from "@/domain/messaging/intent";
import { assertInsurancePlanCatalog, triageInsurancePlan } from "@/domain/knowledge/service";
import { resolveVerifiedFacts } from "@/domain/knowledge/verified-facts";
import { encryptOtp } from "@/lib/messaging/otp-cipher";
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
    const session = { status: "awaiting_plan", pending_message: "quero marcar", prompted_by_inbox_id: "00000000-0000-4000-8000-000000000030", expires_at: "2099-01-01T00:00:00.000Z" };
    const rpc = vi.fn().mockImplementation(async (name: string, value: Record<string, unknown>) => {
      if (name === "accept_whatsapp_plan_triage") {
        events.push("accepted_atomically");
        expect(value).toEqual({
          p_phone: "5513999999999",
          p_insurance_plan_id: "particular-id",
          p_prompted_by_inbox_id: session.prompted_by_inbox_id,
          p_answer_inbox_id: "00000000-0000-4000-8000-000000000031",
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

    await worker.processInbox({ id: "00000000-0000-4000-8000-000000000031", phone: "5513999999999", message_text: "Particular", attempts: 1 });

    expect(evolution.sendText).toHaveBeenCalledWith("5513999999999", expect.stringContaining("agenda.example/acesso#token="));
    expect(rpc).toHaveBeenCalledWith("accept_whatsapp_plan_triage", expect.objectContaining({ p_insurance_plan_id: "particular-id" }));
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
        accepted_by_inbox_id: value.p_answer_inbox_id,
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
});
