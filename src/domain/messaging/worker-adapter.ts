/**
 * Adapter: converte a Action do decisor em operações que o worker executa.
 *
 * Worker vê isso e sabe exatamente:
 *   - qual mensagem enviar (texto ou interactive)
 *   - se persiste estado
 *   - se dispara handoff (mensagem pra doutora + ack pro paciente)
 *
 * Nenhuma decisão aqui: só tradução pura de Action → operações.
 */

import type { Action, PatientSummary, QualificationState } from "./decisor.ts";
import {
  handoffToDoctorMessage,
  patientHandoffAckMessage,
  patientRequestedHumanMessage,
  patientUrgentHandoffAckMessage,
  qualificationQuestions,
  newFlowGreetingMessage,
} from "./qualification-templates.ts";

/**
 * Operação que o worker executa.
 * Tipos são explícitos pra worker poder fazer type narrowing seguro.
 */
export type WorkerOperation =
  | {
      type: "send_text";
      text: string;
      persist?: Partial<QualificationState>;
      audit: { action: string; reason: string };
    }
  | {
      type: "send_interactive";
      message: ReturnType<typeof import("./templates.ts").knowledgeAnswerInteractiveMessage>;
      persist?: Partial<QualificationState>;
      audit: { action: string; reason: string };
    }
  | {
      type: "send_questions_menu";
      audit: { action: string; reason: string };
    }
  | {
      type: "handoff_qualified";
      patientAck: string;
      doctorMessage: string;
      summary: PatientSummary;
      audit: { action: string; reason: string };
    }
  | {
      type: "handoff_urgent";
      patientAck: string;
      doctorMessage: string;
      summary: PatientSummary;
      audit: { action: string; reason: string };
    }
  | {
      type: "handoff_requested";
      patientAck: string;
      doctorMessage: string;
      summary: PatientSummary;
      audit: { action: string; reason: string };
    }
  | {
      type: "no_op";
      audit: { action: string; reason: string };
    };

/**
 * Converte uma Action do decisor em uma lista de operações pro worker.
 */
export function actionToOperations(
  action: Action,
  patientPhone: string,
): WorkerOperation[] {
  switch (action.type) {
    case "send_text":
      return [
        {
          type: "send_text",
          text: action.text,
          persist: action.persist,
          audit: { action: "send_text", reason: action.reason },
        },
      ];

    case "send_interactive":
      return [
        {
          type: "send_interactive",
          message: action.message,
          persist: action.persist,
          audit: { action: "send_interactive", reason: action.reason },
        },
      ];

    case "send_questions_menu":
      return [
        {
          type: "send_text",
          text: newFlowGreetingMessage,
          audit: { action: "send_greeting", reason: action.reason },
        },
      ];

    case "ask_qualification_slot":
      return [
        {
          type: "send_text",
          text: qualificationQuestions[action.slot],
          persist: action.persist,
          audit: { action: "ask_qualification", reason: action.reason },
        },
      ];

    case "qualification_complete":
      return buildQualifiedHandoff(action.summary, action.reason, patientPhone);

    case "escalate_to_human":
      return buildUrgentHandoff(action.summary, action.reason, patientPhone);

    case "no_action":
      return [
        {
          type: "no_op",
          audit: { action: "no_op", reason: action.reason },
        },
      ];
  }
}

function buildQualifiedHandoff(
  summary: PatientSummary,
  reason: string,
  patientPhone: string,
): WorkerOperation[] {
  return [
    {
      type: "handoff_qualified",
      patientAck: patientHandoffAckMessage,
      doctorMessage: handoffToDoctorMessage(patientPhone, summary),
      summary,
      audit: { action: "handoff_qualified", reason },
    },
  ];
}

function buildUrgentHandoff(
  summary: PatientSummary,
  reason: string,
  patientPhone: string,
): WorkerOperation[] {
  const doctorMsg = handoffToDoctorMessage(patientPhone, summary);
  return [
    {
      type: "handoff_urgent",
      patientAck: patientUrgentHandoffAckMessage,
      doctorMessage: doctorMsg,
      summary,
      audit: { action: "handoff_urgent", reason },
    },
  ];
}

/**
 * Helper pra handoff solicitado explicitamente (intent == "humano" sem irritação).
 */
export function requestedHumanHandoff(summary: PatientSummary, reason: string): WorkerOperation[] {
  return [
    {
      type: "handoff_requested",
      patientAck: patientRequestedHumanMessage,
      doctorMessage: handoffToDoctorMessage("", summary),
      summary,
      audit: { action: "handoff_requested", reason },
    },
  ];
}
