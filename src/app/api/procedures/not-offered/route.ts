import { NextResponse } from "next/server";
import { requirePatientSession } from "@/lib/auth/patient-guard";
import { listNotOnlineBookableProcedures } from "@/lib/procedures/repository";

export async function GET() {
  try {
    await requirePatientSession();
    return NextResponse.json({ procedures: await listNotOnlineBookableProcedures() });
  } catch {
    return NextResponse.json({ error: "NAO_AUTORIZADO" }, { status: 401 });
  }
}
