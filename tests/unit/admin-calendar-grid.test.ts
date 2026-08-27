import { describe, expect, it } from "vitest";

import { monthGridDates, weekGridDates, weekdayLabels, dateBelongsToMonth } from "../../src/lib/admin/calendar-grid";

describe("calendar-grid", () => {
  it("weekGridDates devolve 7 datas começando na segunda", () => {
    const dates = weekGridDates("2026-08-15"); // sexta
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2026-08-10"); // segunda
    expect(dates[6]).toBe("2026-08-16"); // domingo
  });

  it("monthGridDates devolve grade de 42 dias cobrindo o mês inteiro", () => {
    const dates = monthGridDates("2026-08-15");
    expect(dates).toHaveLength(42);
    expect(dates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dates[41]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("weekdayLabels devolve 7 labels em pt-BR", () => {
    const labels = weekdayLabels();
    expect(labels).toHaveLength(7);
    labels.forEach((label) => expect(typeof label).toBe("string"));
  });

  it("dateBelongsToMonth reconhece mesmo mês", () => {
    expect(dateBelongsToMonth("2026-08-15", "2026-08-01")).toBe(true);
    expect(dateBelongsToMonth("2026-09-01", "2026-08-15")).toBe(false);
  });
});
