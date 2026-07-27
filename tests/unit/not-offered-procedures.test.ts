import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({ from: mocks.from }),
}));

import { listNotOnlineBookableProcedures } from "@/lib/procedures/repository";

describe("not offered procedures", () => {
  it("returns every procedure unavailable for online booking", async () => {
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.order.mockResolvedValue({ data: [
      { id: "canal", name: "Canal em molar", description: "Não realizado." },
      { id: "siso", name: "Extração de siso", description: "Apenas particular; encaminhar para avaliação." },
      { id: "urgencia", name: "Urgência", description: "Encaminhar para avaliação." },
    ], error: null });

    await expect(listNotOnlineBookableProcedures()).resolves.toEqual([
      { id: "canal", name: "Canal em molar", description: "Não realizado." },
      { id: "siso", name: "Extração de siso", description: "Apenas particular; encaminhar para avaliação." },
      { id: "urgencia", name: "Urgência", description: "Encaminhar para avaliação." },
    ]);
    expect(mocks.from).toHaveBeenCalledWith("procedures");
    expect(mocks.select).toHaveBeenCalledWith("id,name,description");
    expect(mocks.eq).toHaveBeenCalledWith("online_booking", false);
  });
});
