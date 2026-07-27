import type { ReactNode } from "react";
import Link from "next/link";

export function PortalShell({ children, showHeader = true, showFooter = false }: { children: ReactNode; showHeader?: boolean; showFooter?: boolean }) {
  return <main className="portal-shell">{showHeader && <header className="portal-header"><Link href="/" className="brand">Luna <span>Agenda</span></Link><p>Seu cuidado começa com tempo para você.</p></header>}{children}{showFooter && <footer>Atendimento odontológico com simplicidade e privacidade.</footer>}</main>;
}
