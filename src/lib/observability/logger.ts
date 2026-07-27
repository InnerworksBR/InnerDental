type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const levelWeight: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const ansi = {
  reset: "\u001b[0m", dim: "\u001b[2m", bold: "\u001b[1m", cyan: "\u001b[36m",
  blue: "\u001b[34m", green: "\u001b[32m", yellow: "\u001b[33m", red: "\u001b[31m", magenta: "\u001b[35m",
};

const sensitiveKey = /(^|_)(authorization|cookie|secret|token|password|phone|telefone|email|otp|code|payload|message_text|api_key|credential|session)($|_)/i;
const phonePattern = /(?<!\d)\+?\d[\d\s().-]{8,}\d(?!\d)/g;
const bearerPattern = /bearer\s+[a-z0-9._~+/-]+=*/gi;
const sensitiveQueryPattern = /([?&](?:token|code|key|secret|password)=)[^&#\s]+/gi;

function sanitizeString(value: string) {
  return value.replace(bearerPattern, "Bearer [REDACTED]").replace(sensitiveQueryPattern, "$1[REDACTED]").replace(phonePattern, "[PHONE_REDACTED]");
}

export function sanitizeLogValue(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) return { name: value.name, message: sanitizeString(value.message) };
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeLogValue(item, "", seen));
  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitizeLogValue(entryValue, entryKey, seen)]));
}

export function isCorrelationId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value);
}

export function correlationIdFrom(request?: Request) {
  const supplied = request?.headers.get("x-correlation-id");
  return isCorrelationId(supplied) ? supplied : crypto.randomUUID();
}

function configuredLevel(): LogLevel {
  const value = process.env.LOG_LEVEL?.trim().toLowerCase();
  return value === "debug" || value === "warn" || value === "error" ? value : "info";
}

function shouldUsePrettyFormat() {
  const format = process.env.LOG_FORMAT?.trim().toLowerCase();
  if (format === "pretty") return true;
  if (format === "json") return false;
  return process.env.NODE_ENV !== "production" && Boolean(process.stdout.isTTY);
}

function shouldUseColors() {
  if ("NO_COLOR" in process.env || process.env.LOG_COLOR?.trim().toLowerCase() === "never") return false;
  return process.env.LOG_COLOR?.trim().toLowerCase() === "always" || Boolean(process.stdout.isTTY);
}

function paint(value: string, color: keyof typeof ansi, enabled: boolean) {
  return enabled ? `${ansi[color]}${value}${ansi.reset}` : value;
}

export function formatPrettyLog(entry: Record<string, unknown>, colors = shouldUseColors()) {
  const level = String(entry.level).toUpperCase().padEnd(5);
  const levelColor: keyof typeof ansi = entry.level === "error" ? "red" : entry.level === "warn" ? "yellow" : entry.level === "debug" ? "blue" : "green";
  const timestamp = new Date(String(entry.timestamp)).toLocaleTimeString("pt-BR", { hour12: false });
  const reserved = new Set(["timestamp", "level", "service", "event"]);
  const details = Object.entries(entry)
    .filter(([key]) => !reserved.has(key))
    .map(([key, value]) => `${paint(key, "cyan", colors)}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" ");
  return `${paint(timestamp, "dim", colors)} ${paint(level, levelColor, colors)} ${paint(`[${String(entry.service)}]`, "magenta", colors)} ${paint(String(entry.event), "bold", colors)}${details ? ` ${details}` : ""}`;
}

export function log(level: LogLevel, event: string, context: LogContext = {}) {
  if (levelWeight[level] < levelWeight[configuredLevel()]) return;
  const entry = { timestamp: new Date().toISOString(), level, service: process.env.SERVICE_NAME ?? "luna-web", event, ...sanitizeLogValue(context) as LogContext };
  const output = shouldUsePrettyFormat() ? formatPrettyLog(entry) : JSON.stringify(entry);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}
