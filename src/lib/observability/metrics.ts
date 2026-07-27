type MetricLabels = Record<string, string>;
type Metric = { name: string; help: string; labels: MetricLabels; value: number; type: "counter" | "gauge" };
type Histogram = { name: string; help: string; labels: MetricLabels; buckets: number[]; counts: number[]; sum: number; count: number };

const metricsKey = Symbol.for("luna.metrics");
const histogramsKey = Symbol.for("luna.histograms");
const globalMetrics = globalThis as typeof globalThis & { [metricsKey]?: Map<string, Metric>; [histogramsKey]?: Map<string, Histogram> };
const metrics = globalMetrics[metricsKey] ??= new Map<string, Metric>();
const histograms = globalMetrics[histogramsKey] ??= new Map<string, Histogram>();

function labelKey(labels: MetricLabels) {
  return Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join(",");
}

export function incrementCounter(name: string, help: string, labels: MetricLabels = {}, amount = 1) {
  if (!/^luna_[a-z0-9_]+_total$/.test(name)) throw new Error("INVALID_METRIC_NAME");
  const key = `${name}|${labelKey(labels)}`;
  const current = metrics.get(key) ?? { name, help, labels, value: 0, type: "counter" as const };
  if (current.type !== "counter") throw new Error("METRIC_TYPE_CONFLICT");
  current.value += amount;
  metrics.set(key, current);
}

export function setGauge(name: string, help: string, labels: MetricLabels = {}, value: number) {
  if (!/^luna_[a-z0-9_]+$/.test(name) || !Number.isFinite(value)) throw new Error("INVALID_GAUGE");
  const key = `${name}|${labelKey(labels)}`;
  const current = metrics.get(key);
  if (current && current.type !== "gauge") throw new Error("METRIC_TYPE_CONFLICT");
  metrics.set(key, { name, help, labels, value, type: "gauge" });
}

export function observeHistogram(name: string, help: string, labels: MetricLabels, value: number, buckets = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]) {
  if (!/^luna_[a-z0-9_]+_seconds$/.test(name) || !Number.isFinite(value) || value < 0) throw new Error("INVALID_HISTOGRAM");
  const ordered = [...new Set(buckets)].filter((bucket) => Number.isFinite(bucket) && bucket > 0).sort((a, b) => a - b);
  const key = `${name}|${labelKey(labels)}`;
  const current = histograms.get(key) ?? { name, help, labels, buckets: ordered, counts: ordered.map(() => 0), sum: 0, count: 0 };
  if (current.buckets.join(",") !== ordered.join(",")) throw new Error("HISTOGRAM_BUCKET_CONFLICT");
  current.buckets.forEach((bucket, index) => { if (value <= bucket) current.counts[index] += 1; });
  current.sum += value; current.count += 1; histograms.set(key, current);
}

function escapeLabel(value: string) { return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n"); }

export function renderPrometheusMetrics() {
  const byName = new Map<string, Metric[]>();
  for (const metric of metrics.values()) byName.set(metric.name, [...(byName.get(metric.name) ?? []), metric]);
  const lines: string[] = [];
  for (const [name, entries] of [...byName.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`# HELP ${name} ${entries[0].help}`, `# TYPE ${name} ${entries[0].type}`);
    for (const entry of entries) {
      const labels = Object.entries(entry.labels).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(",");
      lines.push(`${name}${labels ? `{${labels}}` : ""} ${entry.value}`);
    }
  }
  for (const histogram of [...histograms.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`# HELP ${histogram.name} ${histogram.help}`, `# TYPE ${histogram.name} histogram`);
    const baseLabels = Object.entries(histogram.labels).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}="${escapeLabel(value)}"`);
    histogram.buckets.forEach((bucket, index) => lines.push(`${histogram.name}_bucket{${[...baseLabels, `le="${bucket}"`].join(",")}} ${histogram.counts[index]}`));
    lines.push(`${histogram.name}_bucket{${[...baseLabels, 'le="+Inf"'].join(",")}} ${histogram.count}`);
    const labels = baseLabels.length ? `{${baseLabels.join(",")}}` : "";
    lines.push(`${histogram.name}_sum${labels} ${histogram.sum}`, `${histogram.name}_count${labels} ${histogram.count}`);
  }
  return `${lines.join("\n")}\n`;
}

export function resetMetricsForTests() { metrics.clear(); histograms.clear(); }
