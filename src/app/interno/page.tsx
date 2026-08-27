import { redirect } from "next/navigation";
import { z } from "zod";

import { AdminConsole } from "@/components/admin-console";
import { weekDatesContaining } from "@/domain/admin/week";
import { InternalAccessError, requireInternalAccess } from "@/lib/admin/authorization";
import { listOperationalIncidents } from "@/lib/admin/incidents";
import { listAdminActivity, listAdminAgendaMonth, listAdminAgendaRange, listAdminProfessionals } from "@/lib/admin/repository";
import { getRecentAnalysis, WindowSchema } from "@/domain/conversation-analysis/service";

export const dynamic = "force-dynamic";

const formatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "America/Sao_Paulo" });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default async function InternalDashboardPage({ searchParams }: { searchParams?: Promise<{ view?: string; date?: string }> }) {
  let profile;
  try {
    profile = await requireInternalAccess();
  } catch (error) {
    if (error instanceof InternalAccessError) redirect("/interno/login");
    throw error;
  }

  const params = (await searchParams) ?? {};
  const view = params.view === "week" || params.view === "month" ? params.view : "day";
  const date = isoDate.safeParse(params.date ?? "").success ? (params.date as string) : new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const weekDates = weekDatesContaining(date);
  const [agenda, activity, professionals, incidents, initialAnalysis] = await Promise.all([
    view === "month" ? listAdminAgendaMonth(date) : listAdminAgendaRange(weekDates[0], weekDates.at(-1) ?? weekDates[0]),
    listAdminActivity(12),
    listAdminProfessionals(),
    listOperationalIncidents(12),
    getRecentAnalysis("24h"),
  ]);

  return (
    <AdminConsole
      date={date}
      dateLabel={formatter.format(new Date(`${date}T12:00:00-03:00`))}
      weekDates={weekDates}
      view={view}
      role={profile.role === "owner" ? "Proprietário" : "Operador"}
      canManage={profile.role === "owner"}
      agenda={agenda}
      activity={activity}
      professionals={professionals}
      incidents={incidents}
      initialAnalysis={initialAnalysis}
    />
  );
}

export { WindowSchema };
