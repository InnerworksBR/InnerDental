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

  it("keeps week days independently collapsible and opens today by default", () => {
    expect(consoleSource).toContain('<details className={`ops-card ops-week-day');
    expect(consoleSource).toContain("open={expandedWeekDays.has(weekDate)}");
    expect(consoleSource).toContain("onToggle={(event)");
    expect(consoleSource).toContain('summary className="ops-week-day-header"');
    expect(consoleSource).toContain('className="ops-week-day-content"');
  });
});
