import "server-only";

import { createSupabaseAdminClient, createSupabaseServerAuthClient } from "@/lib/supabase/server";

export type InternalRole = "owner" | "operator";
export type InternalProfile = { userId: string; role: InternalRole; active: boolean };

export class InternalAccessError extends Error {
  constructor(readonly code: "INTERNAL_UNAUTHORIZED" | "INTERNAL_FORBIDDEN") {
    super(code);
  }
}

export function assertInternalProfile(profile: InternalProfile | null, requiredRole?: InternalRole): InternalProfile {
  if (!profile || !profile.active) throw new InternalAccessError("INTERNAL_UNAUTHORIZED");
  if (requiredRole === "owner" && profile.role !== "owner") throw new InternalAccessError("INTERNAL_FORBIDDEN");
  return profile;
}

export async function requireInternalAccess(requiredRole?: InternalRole): Promise<InternalProfile> {
  const authClient = await createSupabaseServerAuthClient();
  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) throw new InternalAccessError("INTERNAL_UNAUTHORIZED");

  const { data, error } = await createSupabaseAdminClient()
    .from("internal_profiles")
    .select("user_id,role,active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data || (data.role !== "owner" && data.role !== "operator")) {
    throw new InternalAccessError("INTERNAL_UNAUTHORIZED");
  }

  return assertInternalProfile({ userId: data.user_id, role: data.role, active: data.active }, requiredRole);
}

export async function requireInternalOwner(): Promise<InternalProfile> {
  return requireInternalAccess("owner");
}
