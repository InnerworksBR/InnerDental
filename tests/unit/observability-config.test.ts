import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const prometheus = readFileSync("ops/observability/prometheus.yml", "utf8");
const alerts = readFileSync("ops/observability/alerts.yml", "utf8");
const dashboard = JSON.parse(readFileSync("ops/observability/dashboards/luna-operations.json", "utf8"));

describe("observability configuration", () => {
  it("scrapes only internal service names with a secret file", () => {
    expect(prometheus).toContain("credentials_file: /run/secrets/metrics_token");
    expect(prometheus).toContain('targets: ["web:3000"]'); expect(prometheus).toContain('targets: ["worker:3001"]');
    expect(prometheus).not.toMatch(/credentials:\s+\S+/);
  });
  it("links actionable alerts to the incident runbook", () => {
    expect(alerts.match(/alert:/g)?.length).toBeGreaterThanOrEqual(6);
    expect(alerts.match(/runbook: "docs\/runbooks\/incident-response.md"/g)?.length).toBeGreaterThanOrEqual(6);
    expect(alerts).toContain("for: 5m");
  });
  it("versions a bounded operational dashboard without PII", () => {
    expect(dashboard.panels.length).toBeGreaterThanOrEqual(6);
    expect(JSON.stringify(dashboard)).not.toMatch(/phone|telefone|correlation.?id/i);
  });
});
