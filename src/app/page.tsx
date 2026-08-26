import Link from "next/link";
import { PortalShell } from "@/components/portal-shell";

const benefits = [
  { icon: "shield", label: "Acesso por código no WhatsApp" },
  { icon: "calendar-check", label: "Lembretes automáticos da consulta" },
  { icon: "refresh", label: "Remarcação em dois toques" },
];

export default function HomePage() {
  return (
    <PortalShell>
      <section className="hero">
        <p className="eyebrow">Odontologia sem fila</p>
        <h1>Seu sorriso, no seu tempo.</h1>
        <p>Marque, remarque ou cancele consultas pelo celular. Sem senha, sem aplicativo, sem espera.</p>

        <ul className="hero-benefits" aria-label="Benefícios">
          {benefits.map((b) => (
            <li key={b.icon}>
              <span className="icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><use href={`#${b.icon}`} /></svg>
              </span>
              {b.label}
            </li>
          ))}
        </ul>

        <Link className="button" href="/acesso">
          Acessar minha agenda
          <span className="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><use href="#arrow-right" /></svg>
          </span>
        </Link>

        <Link className="internal-link" href="/interno/login">Área interna da clínica</Link>
      </section>
    </PortalShell>
  );
}
