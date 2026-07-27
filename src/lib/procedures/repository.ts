import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type NotOnlineBookableProcedure = { id: string; name: string; description: string | null };

export async function listNotOnlineBookableProcedures(): Promise<NotOnlineBookableProcedure[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from("procedures")
    .select("id,name,description")
    .eq("online_booking", false)
    .order("name");
  if (error) throw new Error("PROCEDURES_READ_FAILED");
  return (data ?? []) as NotOnlineBookableProcedure[];
}
