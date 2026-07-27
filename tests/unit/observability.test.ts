import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatPrettyLog, isCorrelationId, log, sanitizeLogValue } from "@/lib/observability/logger";
import { incrementCounter, observeHistogram, renderPrometheusMetrics, resetMetricsForTests, setGauge } from "@/lib/observability/metrics";

describe("observability", () => {
  beforeEach(() => { resetMetricsForTests(); vi.restoreAllMocks(); });
  it("redacts secrets, OTP and full phone numbers", () => {
    expect(sanitizeLogValue({ phone: "5513991743380", authorization: "Bearer abc", nested: { api_key: "secret" }, detail: "contato +55 (13) 99174-3380 https://x.test?a=1&token=abc", safe: "CLAIM_FAILED" })).toEqual({ phone: "[REDACTED]", authorization: "[REDACTED]", nested: { api_key: "[REDACTED]" }, detail: "contato [PHONE_REDACTED] https://x.test?a=1&token=[REDACTED]", safe: "CLAIM_FAILED" });
  });
  it("accepts only bounded correlation identifiers", () => { expect(isCorrelationId("corr-123456")).toBe(true); expect(isCorrelationId("short")).toBe(false); expect(isCorrelationId("x".repeat(81))).toBe(false); });
  it("emits structured sanitized JSON", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    log("error", "delivery_failed", { correlationId: "corr-123456", phone: "5513991743380", error: new Error("provider timeout") });
    const entry = JSON.parse(String(output.mock.calls[0][0]));
    expect(entry).toMatchObject({ level: "error", event: "delivery_failed", phone: "[REDACTED]", correlationId: "corr-123456" });
  });
  it("formats readable colored terminal logs", () => {
    const output = formatPrettyLog({ timestamp: "2026-07-23T15:04:05.000Z", level: "info", service: "luna-worker", event: "worker_poll_completed", durationMs: 42 }, true);
    expect(output).toContain("\u001b[");
    expect(output).toContain("[luna-worker]");
    expect(output).toContain("worker_poll_completed");
    expect(output).toContain("durationMs");
  });
  it("honors LOG_LEVEL", () => {
    const previous = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "warn";
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    log("info", "quiet_poll");
    expect(output).not.toHaveBeenCalled();
    if (previous === undefined) delete process.env.LOG_LEVEL; else process.env.LOG_LEVEL = previous;
  });
  it("renders bounded Prometheus counters", () => {
    incrementCounter("luna_worker_failures_total", "Worker failures.", { stage: "outbox" });
    expect(renderPrometheusMetrics()).toContain('luna_worker_failures_total{stage="outbox"} 1');
  });
  it("renders current queue gauges without identifiers", () => {
    setGauge("luna_queue_outbox_backlog", "Current queue health.", {}, 4);
    expect(renderPrometheusMetrics()).toContain("# TYPE luna_queue_outbox_backlog gauge");
    expect(renderPrometheusMetrics()).toContain("luna_queue_outbox_backlog 4");
  });
  it("renders bounded latency histograms", () => {
    observeHistogram("luna_http_request_duration_seconds", "Request latency.", { area: "api", status: "2xx" }, 0.2, [0.1, 0.5]);
    const output = renderPrometheusMetrics();
    expect(output).toContain("# TYPE luna_http_request_duration_seconds histogram");
    expect(output).toContain('luna_http_request_duration_seconds_bucket{area="api",status="2xx",le="0.5"} 1');
  });
});
