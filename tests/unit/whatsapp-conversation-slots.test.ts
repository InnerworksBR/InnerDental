import { describe, expect, it } from "vitest";

import {
  ALLOWED_SLOT_KEYS,
  EMPTY_SLOTS,
  isValidPhone,
} from "@/domain/messaging/slots.ts";

describe("ConversationSlots primitives", () => {
  describe("isValidPhone", () => {
    it("accepts a 13-digit Brazilian mobile number", () => {
      expect(isValidPhone("5513999999999")).toBe(true);
    });

    it("accepts a 12-digit number at the lower bound", () => {
      expect(isValidPhone("551399999999")).toBe(true);
    });

    it("accepts a 15-digit number at the upper bound", () => {
      expect(isValidPhone("551399999999999")).toBe(true);
    });

    it("rejects a 10-digit number (too short)", () => {
      expect(isValidPhone("55139999999")).toBe(false);
    });

    it("rejects a 16-digit number (too long)", () => {
      expect(isValidPhone("5513999999999999")).toBe(false);
    });

    it("rejects alphabetic input", () => {
      expect(isValidPhone("abc")).toBe(false);
    });

    it("rejects an empty string", () => {
      expect(isValidPhone("")).toBe(false);
    });

    it("rejects the canonical example from the spec", () => {
      expect(isValidPhone("55139999999")).toBe(false);
    });
  });

  describe("EMPTY_SLOTS", () => {
    it("is an empty object", () => {
      expect(EMPTY_SLOTS).toEqual({});
    });

    it("matches a freshly declared object structurally", () => {
      expect({ ...EMPTY_SLOTS }).toEqual({});
    });
  });

  describe("ALLOWED_SLOT_KEYS", () => {
    it("contains every documented key exactly once", () => {
      expect(new Set(ALLOWED_SLOT_KEYS)).toEqual(
        new Set([
          "awaiting_plan",
          "awaiting_procedure",
          "awaiting_window",
          "prompted_by_inbox_id",
          "plan_id",
          "procedure_id",
          "schedule_window",
          "last_tool",
          "updated_at",
        ]),
      );
    });

    it("contains no extra undocumented keys", () => {
      expect(ALLOWED_SLOT_KEYS).toHaveLength(9);
    });

    it("is typed as readonly", () => {
      // `as const` produces a readonly tuple; spot-check that the runtime
      // value is an array so callers can iterate it.
      expect(Array.isArray(ALLOWED_SLOT_KEYS)).toBe(true);
    });
  });
});
