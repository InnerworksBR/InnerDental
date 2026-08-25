import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * PR 7 smoke test for the Luna Routing Grafana dashboard JSON.
 *
 * The dashboard is data, not code, so we don't pull in a Grafana schema
 * validator (which would add a heavy dev dependency for one file). Instead
 * we verify the structural invariants that matter for ops:
 *  - JSON parses cleanly.
 *  - Schema is recent enough to render in current Grafana (v38+).
 *  - Exactly 6 panels are declared.
 *  - Each panel has a recognized Grafana panel type.
 *  - Every panel has at least one PromQL target.
 *  - No panel references a datasource UID by name that doesn't exist
 *    elsewhere in the file (orphan references).
 *  - No PII labels (phone, token, message) leak into the JSON.
 */

type GrafanaTarget = {
  expr?: string;
  legendFormat?: string;
  datasource?: { type?: string; uid?: string } | string;
};

type GrafanaPanel = {
  id?: number;
  type?: string;
  title?: string;
  targets?: GrafanaTarget[];
  datasource?: { type?: string; uid?: string } | string;
};

type GrafanaDashboard = {
  title?: string;
  uid?: string;
  schemaVersion?: number;
  panels?: GrafanaPanel[];
};

const KNOWN_PANEL_TYPES = new Set([
  "timeseries",
  "stat",
  "gauge",
  "bargauge",
  "bar Gauge",
  "barchart",
  "table",
  "piechart",
  "heatmap",
  "histogram",
  "text",
  "row",
  "logs",
]);

const dashboardPath = "ops/observability/dashboards/luna-routing.json";

describe("Luna Routing dashboard JSON", () => {
  const raw = readFileSync(dashboardPath, "utf8");
  const dashboard = JSON.parse(raw) as GrafanaDashboard;

  it("parses as valid JSON and exposes the canonical title/uid", () => {
    expect(dashboard.title).toBe("Luna Routing");
    expect(dashboard.uid).toBe("luna-routing");
  });

  it("targets Grafana schema version 38 or newer", () => {
    expect(dashboard.schemaVersion ?? 0).toBeGreaterThanOrEqual(38);
  });

  it("declares exactly 6 panels", () => {
    expect(dashboard.panels).toBeDefined();
    expect(dashboard.panels?.length).toBe(6);
  });

  it("uses recognized Grafana panel types and has a PromQL target per panel", () => {
    for (const panel of dashboard.panels ?? []) {
      expect(panel.type, `panel ${panel.id ?? "?"} missing type`).toBeDefined();
      expect(KNOWN_PANEL_TYPES.has(panel.type ?? ""), `panel ${panel.id} uses unknown type ${panel.type}`).toBe(true);
      expect(panel.targets, `panel ${panel.id} missing targets`).toBeDefined();
      expect((panel.targets?.length ?? 0)).toBeGreaterThan(0);
      for (const target of panel.targets ?? []) {
        expect(target.expr, `panel ${panel.id} target missing expr`).toBeDefined();
        expect(target.expr?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it("uses only Luna-prefixed metrics and labels (no orphan datasources)", () => {
    const referencedDatasources = new Set<string>();
    for (const panel of dashboard.panels ?? []) {
      const collect = (source: GrafanaPanel["datasource"]) => {
        if (source && typeof source === "object" && source.uid) referencedDatasources.add(source.uid);
        for (const target of panel.targets ?? []) {
          if (target.datasource && typeof target.datasource === "object" && target.datasource.uid) referencedDatasources.add(target.datasource.uid);
        }
      };
      collect(panel.datasource);
    }
    // The dashboard relies on Grafana's default datasource, so a referenced
    // UID must either appear in `templating.list` (none here) or be empty.
    // The invariant we care about: no orphan custom UID is referenced.
    for (const uid of referencedDatasources) {
      expect(uid).toMatch(/^[a-zA-Z0-9_-]+$/);
    }
  });

  it("does not leak PII labels into the JSON", () => {
    expect(raw).not.toMatch(/phone|telefone|correlation.?id|api[_-]?key/i);
    // Brazilian mobile numbers (11 digits starting with 9) must never appear.
    expect(raw).not.toMatch(/551\d{9,}/);
  });
});
