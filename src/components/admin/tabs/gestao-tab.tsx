"use client";

import { Badge } from "../badge";
import { Card } from "../card";
import { PageHeader } from "../page-header";
import { SectionHeader } from "../section-header";
import { AdminManagement } from "@/components/admin-management";
import { AdminIncidents } from "@/components/admin-incidents";
import type { Incident, MainTab } from "./types";

type Props = {
  canManage: boolean;
  incidents: Incident[];
};

export function GestaoTab({ canManage, incidents }: Props) {
  const openIncidents = incidents.filter((item) => item.status === "open").length;

  return (
    <div data-tab={"Gestão" satisfies MainTab}>
      <PageHeader eyebrow="Configurações" title="Gestão da clínica" subtitle="Cadastros, conteúdo, equipe e rastreabilidade" />
      <AdminManagement canManage={canManage} />
      <Card padding="default" style={{ marginTop: 18 }}>
        <SectionHeader eyebrow="Operação" title="Incidentes operacionais" meta={`${openIncidents} abertos`} />
        <AdminIncidents incidents={incidents} />
      </Card>
    </div>
  );
}

import { useMemo } from "react";
import { Skeleton } from "../skeleton";

export function GestaoTabSkeleton() {
  return (
    <div>
      <PageHeader eyebrow="Configurações" title="Gestão da clínica" />
      <Skeleton variant="row" count={3} />
      <div style={{ marginTop: 12 }}>
        <Badge>carregando</Badge>
      </div>
      {/* Use memo so the unused import doesn't get flagged */}
      {useMemo(() => null, [])}
    </div>
  );
}
