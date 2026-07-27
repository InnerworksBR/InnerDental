import { describe, expect, it } from "vitest";
import { incidentCategories } from "@/lib/admin/incidents";

describe("operational incidents", () => {
  it("limits incident origin to the safe operational categories", () => {
    expect(incidentCategories).toEqual(["validation", "google_calendar", "supabase", "evolution", "worker", "unknown"]);
  });
});
