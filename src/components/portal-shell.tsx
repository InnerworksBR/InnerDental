import type { ReactNode } from "react";
import Link from "next/link";

const ICONS = {
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <path d="M16 2v4M8 2v4M3 10h18M8 14h3v3H8zM13 14h3v3h-3zM8 19h3v2H8z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21c.7-4.3 3.2-6.5 7.5-6.5s6.8 2.2 7.5 6.5" />
    </>
  ),
  phone: (
    <>
      <path d="M5 4h3l1.5 4.5-2 1.5c1.2 2.5 3.3 4.6 5.8 5.8l1.5-2L20 16v3a2 2 0 01-2 2 16 16 0 01-16-16 2 2 0 012-2z" />
    </>
  ),
  check: <path d="M5 13l4 4L19 7" />,
  "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
  "arrow-left": <path d="M19 12H5M11 18l-6-6 6-6" />,
  "map-pin": (
    <>
      <path d="M12 2C8.1 2 5 5.1 5 9c0 5.3 7 13 7 13s7-7.7 7-13c0-3.9-3.1-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  "calendar-check": (
    <>
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <path d="M8 2v4M16 2v4M3 10h18" />
      <path d="M16 16l-2.5 2.5L11 16" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3L4 7v5c0 4.8 2.8 8 8 9 5.2-1 8-4.2 8-9V7l-8-4z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  messages: (
    <>
      <path d="M5 18.5 3.5 22l4.4-1.5c1.2.6 2.6 1 4.1 1 5 0 9-3.8 9-8.5S17 4.5 12 4.5 3 8.3 3 13c0 2.1.7 4 2 5.5Z" />
      <path d="M8 11h8M8 15h5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  warning: (
    <>
      <path d="M12 3L2.5 20h19L12 3z" />
      <path d="M12 10v4M12 17v1" />
    </>
  ),
  teeth: (
    <>
      <path d="M8 3c0 0 2 2 4 2s4-2 4-2c0 4-1 7-4 10-3-3-4-6-4-10z" />
      <path d="M9 15v4M15 15v4" />
      <path d="M8 3v2c0 2 .5 3 1.5 4M16 3v2c0 2-.5 3-1.5 4" />
    </>
  ),
  refresh: (
    <>
      <path d="M4 12a8 8 0 018-8c3.2 0 6 1.9 7.3 4.7" />
      <path d="M20 12a8 8 0 01-8 8c-3.2 0-6-1.9-7.3-4.7" />
      <path d="M16 4l4 4-4 4M8 20l-4-4 4-4" />
    </>
  ),
} as Record<string, ReactNode>;

function Icon({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
      {ICONS[id]}
    </svg>
  );
}

export function PortalShell({ children, showHeader = true, showFooter = false }: { children: ReactNode; showHeader?: boolean; showFooter?: boolean }) {
  return (
    <>
      {/* SVG icon sprite — hidden from visual flow, referenced via Icon() */}
      <svg aria-hidden="true" className="svg-icons" focusable="false">
        {Object.entries(ICONS).map(([id, paths]) => (
          <symbol key={id} id={id} viewBox="0 0 24 24">
            {paths}
          </symbol>
        ))}
      </svg>

      <main className="portal-shell">
        {showHeader && (
          <header className="portal-header">
            <Link href="/" className="brand">
              {/* Tooth brand mark — inline SVG */}
              <span className="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  {ICONS.teeth}
                </svg>
              </span>
              Luna <span>Agenda</span>
            </Link>
            <p>Seu cuidado começa com tempo para você.</p>
          </header>
        )}
        {children}
        {showFooter && (
          <footer>Atendimento odontológico com simplicidade e privacidade.</footer>
        )}
      </main>
    </>
  );
}

// Export individual icon components for use in pages
export { Icon };
