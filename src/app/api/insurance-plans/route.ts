import { NextResponse } from "next/server";
import { requirePatientSession } from "@/lib/auth/patient-guard";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET() {
  try { await requirePatientSession(); const { data, error } = await createSupabaseAdminClient().from("insurance_plans").select("id,name,instructions").eq("active", true).order("name"); if (error) throw error; return NextResponse.json({ plans: data ?? [] }); }
  catch { return NextResponse.json({ error: "NAO_AUTORIZADO" }, { status: 401 }); }
}
