// Auto-generated stub. Regenerate via `pnpm openapi:codegen` once the FastAPI app is running.
// Until generation, this is a thin manually-typed fetch wrapper that mirrors the endpoints we expose.

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  authToken?: string;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message = `API error ${status}`) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function createApiClient(opts: ApiClientOptions) {
  const f = opts.fetchImpl ?? globalThis.fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    if (opts.authToken) headers.set("authorization", `Bearer ${opts.authToken}`);
    const res = await f(`${opts.baseUrl}${path}`, { ...init, headers });
    const text = await res.text();
    const data = text ? safeJson(text) : null;
    if (!res.ok) throw new ApiError(res.status, data);
    return data as T;
  }

  return {
    invoices: {
      generate(orderId: string) {
        return request<{ invoiceId: string; pdfUrl: string }>(`/invoices/generate`, {
          method: "POST",
          body: JSON.stringify({ orderId }),
        });
      },
      download(invoiceId: string) {
        return request<{ pdfUrl: string }>(`/invoices/${invoiceId}/pdf`);
      },
    },
    payments: {
      createOrder(orderId: string) {
        return request<{
          razorpayOrderId: string;
          amount: number;
          currency: string;
          keyId: string;
        }>(`/payments/razorpay/order`, {
          method: "POST",
          body: JSON.stringify({ orderId }),
        });
      },
    },
    tenders: {
      list() {
        return request<unknown[]>(`/tenders`);
      },
      pollRss() {
        return request<{ ingested: number }>(`/tenders/poll/rss`, { method: "POST" });
      },
    },
    gstr: {
      export1(month: string) {
        return request<{ jobId: string }>(`/gstr/r1/export`, {
          method: "POST",
          body: JSON.stringify({ month }),
        });
      },
    },
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export type ApiClient = ReturnType<typeof createApiClient>;
