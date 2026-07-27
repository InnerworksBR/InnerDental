import Link from "next/link";
import { PortalShell } from "@/components/portal-shell";

export default function HomePage() {
  return <PortalShell><section className="hero"><p className="eyebrow">Odontologia sem fila</p><h1>Seu sorriso, no seu tempo.</h1><p>Marque, remarque ou cancele consultas pelo celular. Sem senha, sem aplicativo, sem espera.</p><div className="hero-benefits" aria-label="Benefícios"><span>Acesso por código no WhatsApp</span><span>Lembretes automáticos da consulta</span><span>Remarcação em dois toques</span></div><Link className="button" href="/acesso">Acessar minha agenda</Link><Link className="internal-link" href="/interno/login">Área interna da clínica</Link></section></PortalShell>;
}
