import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireInternalAccess: vi.fn(),
  requireInternalOwner: vi.fn(),
  listManagementSnapshot: vi.fn(),
  executeManagementCommand: vi.fn(),
  assertTrustedMutation: vi.fn(),
}));

vi.mock("@/lib/admin/authorization", () => ({
  requireInternalAccess: mocks.requireInternalAccess,
  requireInternalOwner: mocks.requireInternalOwner,
  InternalAccessError: class extends Error {},
}));
vi.mock("@/lib/admin/management", () => ({
  listManagementSnapshot: mocks.listManagementSnapshot,
  executeManagementCommand: mocks.executeManagementCommand,
  ManagementConflictError: class extends Error { constructor(readonly code: string) { super(code); } },
}));
vi.mock("@/lib/security/request-origin", () => ({
  assertTrustedMutation: mocks.assertTrustedMutation,
  UntrustedOriginError: class extends Error {},
}));

import { GET, POST } from "@/app/api/admin/management/route";

const owner = { userId: "d4d88d79-6db7-4950-a5d5-2b0ae824c0d2", role: "owner", active: true };
const operator = { userId: "7db32f33-b52e-4754-a972-f3866bd87f77", role: "operator", active: true };

describe("management route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireInternalAccess.mockResolvedValue(operator);
    mocks.requireInternalOwner.mockResolvedValue(owner);
    mocks.listManagementSnapshot.mockResolvedValue({ procedures: [] });
    mocks.executeManagementCommand.mockResolvedValue({ id: "saved" });
  });

  it("allows active internal users to read a sanitized snapshot", async () => {
    const response = await GET(new Request("http://localhost/api/admin/management"));
    expect(response.status).toBe(200);
    expect(mocks.requireInternalAccess).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({ canManage: false, management: { procedures: [] } });
  });

  it("requires an owner for configuration commands", async () => {
    const response = await POST(new Request("http://localhost/api/admin/management", { method: "POST", body: JSON.stringify({ action: "save_procedure", name: "Avaliação", description: null, onlineBooking: true, active: true }) }));
    expect(response.status).toBe(200);
    expect(mocks.requireInternalOwner).toHaveBeenCalledOnce();
    expect(mocks.requireInternalAccess).not.toHaveBeenCalled();
  });

  it("allows an operator to correct a patient without editing the phone", async () => {
    const command = { action: "save_patient", id: "c59d76b3-a1d9-44ea-a539-f20106289e47", name: "Ana", insurancePlanId: null };
    const response = await POST(new Request("http://localhost/api/admin/management", { method: "POST", body: JSON.stringify(command) }));
    expect(response.status).toBe(200);
    expect(mocks.requireInternalAccess).toHaveBeenCalledOnce();
    expect(mocks.executeManagementCommand).toHaveBeenCalledWith(command, operator);
  });
});
