import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("internal portal UX shell", () => {
  const consoleSource = readFileSync("src/components/admin-console.tsx", "utf8");
  const managementSource = readFileSync("src/components/admin-management.tsx", "utf8");
  const blockFormSource = readFileSync("src/components/admin-block-form.tsx", "utf8");
  const styles = readFileSync("src/app/globals.css", "utf8");

  it("provides distinct desktop and mobile navigation without constraining the workspace to a phone frame", () => {
    expect(consoleSource).toContain('className="portal-shell admin-shell admin-workspace"');
    expect(consoleSource).toContain('className="ops-sidebar"');
    expect(consoleSource).toContain('className="ops-nav"');
    expect(styles).toContain(".portal-shell.admin-workspace { width: 100%; max-width: none;");
    expect(styles).toContain("grid-template-columns: 258px minmax(0, 1fr)");
    expect(styles).toContain(".ops-mobile-header, .admin-workspace .ops-nav { display: none;");
  });

  it("keeps the application navigable and understandable with keyboard and assistive technology", () => {
    expect(consoleSource).toContain('className="skip-link"');
    expect(consoleSource).toContain('aria-current={tab === item.label ? "page" : undefined}');
    expect(consoleSource).toContain('aria-label="Navegação principal"');
    expect(managementSource).toContain('role={messageTone === "error" ? "alert" : "status"}');
    expect(styles).toContain(".admin-workspace button:focus-visible");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("uses an in-context review step for a full-day block and refreshes the view after success", () => {
    expect(blockFormSource).not.toContain("window.confirm");
    expect(blockFormSource).not.toMatch(/[^.]confirm\(/);
    expect(blockFormSource).toContain("Revisar bloqueio");
    expect(blockFormSource).toContain("Confirmar bloqueio?");
    expect(blockFormSource).toContain("router.refresh()");
  });

  it("renders the redesigned calendar with month/week/day views and an accessible toolbar", () => {
    const toolbarSource = readFileSync("src/components/admin/calendar/toolbar.tsx", "utf8");
    const monthSource = readFileSync("src/components/admin/calendar/month-view.tsx", "utf8");
    expect(toolbarSource).toContain('className="cal-toolbar"');
    expect(toolbarSource).toContain('role="tablist"');
    expect(monthSource).toContain("cal-month__grid");
    expect(styles).toContain(".cal-month__cell--today");
    expect(styles).toContain(".cal-week__hours");
  });

  it("shows live polling indicator and clipboard export on the messages tab", () => {
    const mensagensSource = readFileSync("src/components/admin/tabs/mensagens-tab.tsx", "utf8");
    const kpiSource = readFileSync("src/components/admin/conversation-analysis/kpi-card.tsx", "utf8");
    expect(mensagensSource).toContain("live-pulse");
    expect(kpiSource).toContain("conv-kpi__export");
    expect(styles).toContain(".live-pulse__dot");
    expect(styles).toContain("@keyframes live-pulse-anim");
  });

  it("keeps block form intact: in-context review step and router.refresh after success", () => {
    expect(blockFormSource).not.toContain("window.confirm");
    expect(blockFormSource).not.toMatch(/[^.]confirm\(/);
    expect(blockFormSource).toContain("Revisar bloqueio");
    expect(blockFormSource).toContain("Confirmar bloqueio?");
    expect(blockFormSource).toContain("router.refresh()");
  });

  it("exposes inline incident notes with textarea and resolve action", () => {
    const incidentsSource = readFileSync("src/components/admin-incidents.tsx", "utf8");
    expect(incidentsSource).toContain("ops-incident-notes");
    expect(styles).toContain(".ops-incident-notes textarea");
    expect(styles).toContain(".ops-incident-notes ul");
  });
});
