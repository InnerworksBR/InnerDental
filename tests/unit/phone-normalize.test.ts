import { describe, expect, it } from "vitest";
import { InvalidPhoneError, normalizeBrazilianPhone } from "@/lib/phone/normalize";

describe("normalizeBrazilianPhone", () => {
  it.each([
    ["5513991743380", "5513991743380"],
    ["+55 (13) 99174-3380", "5513991743380"],
    ["(13) 99174-3380", "5513991743380"],
    ["0013991743380", "5513991743380"],
    ["(11) 3456-7890", "551134567890"],
  ])("normaliza %s", (input, expected) => {
    expect(normalizeBrazilianPhone(input)).toBe(expected);
  });

  it.each(["", "551399174338", "55139917433800", "9991743380", "5513001743380", "551399174338a"])(
    "rejeita %s",
    (input) => {
      expect(() => normalizeBrazilianPhone(input)).toThrow(InvalidPhoneError);
    },
  );
});
