import { redirect } from "next/navigation";
import { AdminConsole } from "@/components/admin-console";
import { weekDatesContaining } from "@/domain/admin/week";
import { InternalAccessError, requireInternalAccess } from "@/lib/admin/authorization";
import { listOperationalIncidents } from "@/lib/admin/incidents";
import { listAdminActivity, listAdminAgendaRange, listAdminProfessionals } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";

const formatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "America/Sao_Paulo" });

export default async function InternalDashboardPage() {
  let profile;
  try {
    profile = await requireInternalAccess();
  } catch (error) {
    if (error instanceof InternalAccessError) redirect("/interno/login");
    throw error;
  }

  const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const weekDates = weekDatesContaining(date);
  const [agenda, activity, professionals, incidents] = await Promise.all([
    listAdminAgendaRange(weekDates[0], weekDates.at(-1) ?? weekDates[0]),
    listAdminActivity(12),
    listAdminProfessionals(),
    listOperationalIncidents(12),
  ]);

  return (
    <AdminConsole
      date={date}
      dateLabel={formatter.format(new Date(`${date}T12:00:00-03:00`))}
      weekDates={weekDates}
      role={profile.role === "owner" ? "Proprietário" : "Operador"}
      canManage={profile.role === "owner"}
      agenda={agenda}
      activity={activity}
      professionals={professionals}
      incidents={incidents}
    />
  );
}
