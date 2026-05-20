import env from "@/env";
import { getInternalToken } from "@/auth";

/** Server-only fetch wrapper that talks to FastAPI with a fresh bearer token. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getInternalToken();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const r = await fetch(`${env.INTERNAL_API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  const txt = await r.text();
  const body = txt ? safeJson(txt) : null;
  if (!r.ok) {
    throw new ApiError(r.status, body);
  }
  return body as T;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`API ${status}`);
    this.status = status;
    this.body = body;
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
