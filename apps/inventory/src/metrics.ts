/** Minimal Prometheus-style metrics, no dependencies. */
const counters = new Map<string, number>();
const durations = new Map<string, { sum: number; count: number }>();
export const startedAt = Date.now();

function key(name: string, labels: Record<string, string | number>): string {
  const l = Object.entries(labels)
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
    .join(",");
  return `${name}{${l}}`;
}

export function inc(name: string, labels: Record<string, string | number>, by = 1): void {
  const k = key(name, labels);
  counters.set(k, (counters.get(k) ?? 0) + by);
}

export function observe(name: string, labels: Record<string, string | number>, seconds: number): void {
  const k = key(name, labels);
  const d = durations.get(k) ?? { sum: 0, count: 0 };
  d.sum += seconds;
  d.count++;
  durations.set(k, d);
}

export function render(gauges: Record<string, number>): string {
  const lines: string[] = [];
  lines.push("# TYPE stockroom_http_requests_total counter");
  for (const [k, v] of counters) if (k.startsWith("stockroom_http_requests_total")) lines.push(`${k} ${v}`);
  lines.push("# TYPE stockroom_http_request_seconds summary");
  for (const [k, d] of durations) {
    lines.push(`${k.replace("}", "")}} ${d.sum}`.replace("stockroom_http_request_seconds{", "stockroom_http_request_seconds_sum{"));
    lines.push(`${k.replace("}", "")}} ${d.count}`.replace("stockroom_http_request_seconds{", "stockroom_http_request_seconds_count{"));
  }
  for (const [k, v] of counters) if (!k.startsWith("stockroom_http_requests_total")) lines.push(`${k} ${v}`);
  for (const [name, v] of Object.entries(gauges)) {
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name} ${v}`);
  }
  lines.push("# TYPE stockroom_uptime_seconds gauge");
  lines.push(`stockroom_uptime_seconds ${Math.floor((Date.now() - startedAt) / 1000)}`);
  return lines.join("\n") + "\n";
}

/** Collapse dynamic path segments so label cardinality stays small. */
export function routeLabel(method: string, path: string): string {
  const p = path
    .replace(/\/api\/v1\/items\/[^/]+/, "/api/v1/items/:sku")
    .replace(/\/api\/v1\/public\/items\/[^/]+/, "/api/v1/public/items/:sku")
    .replace(/\/api\/v1\/admin\/users\/[^/]+/, "/api/v1/admin/users/:id")
    .replace(/\/api\/v1\/admin\/api-keys\/[^/]+/, "/api/v1/admin/api-keys/:id")
    .replace(/\/api\/v1\/movements\/[^/]+/, "/api/v1/movements/:id");
  return `${method} ${p.startsWith("/api/") ? p : "static"}`;
}
