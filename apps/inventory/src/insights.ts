import type { Database } from "bun:sqlite";
import { getSetting, setSetting } from "./db";
import { decryptSecret, encryptSecret } from "./auth";

export interface LlmConfig {
  provider: "anthropic" | "openai" | "none";
  baseUrl: string;
  model: string;
  hasKey: boolean;
  maxTokens: number;
}

const DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
};

export function getLlmConfig(db: Database): LlmConfig {
  const c = getSetting<Partial<LlmConfig> & { keyEnc?: string }>(db, "llm", {});
  const provider = (c.provider as LlmConfig["provider"]) || "none";
  const d = DEFAULTS[provider] ?? { baseUrl: "", model: "" };
  return {
    provider,
    baseUrl: c.baseUrl || d.baseUrl,
    model: c.model || d.model,
    hasKey: Boolean(c.keyEnc),
    maxTokens: c.maxTokens || 800,
  };
}

export async function setLlmConfig(
  db: Database,
  secret: string,
  patch: { provider?: string; baseUrl?: string; model?: string; apiKey?: string; maxTokens?: number; clearKey?: boolean },
): Promise<LlmConfig> {
  const cur = getSetting<Record<string, unknown>>(db, "llm", {});
  const next: Record<string, unknown> = { ...cur };
  if (patch.provider && ["anthropic", "openai", "none"].includes(patch.provider)) next.provider = patch.provider;
  if (patch.baseUrl !== undefined) next.baseUrl = String(patch.baseUrl).trim().replace(/\/+$/, "");
  if (patch.model !== undefined) next.model = String(patch.model).trim();
  if (patch.maxTokens) next.maxTokens = Math.min(4000, Math.max(100, Number(patch.maxTokens) | 0));
  if (patch.clearKey) delete next.keyEnc;
  if (patch.apiKey && patch.apiKey.trim()) next.keyEnc = await encryptSecret(secret, patch.apiKey.trim());
  setSetting(db, "llm", next);
  return getLlmConfig(db);
}

const SYSTEM_PROMPT = `You are the stock analyst for a footwear and leather goods maker-retailer in Agra, India. You receive a JSON digest of the current stock position (quantities, cost values in rupees, ageing, dead stock, top sellers, broken size runs) and a question from the owner or staff.
Answer in plain English, short sentences, with the numbers that back each point. Use Indian formatting for rupees (₹1,20,000). Point out the one or two actions that matter most; do not pad. If the digest lacks what is needed to answer, say exactly what is missing. Never invent figures that are not in the digest.`;

export async function askLlm(
  db: Database,
  secret: string,
  question: string,
  digest: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<{ answer: string; model: string }> {
  const cfg = getLlmConfig(db);
  if (cfg.provider === "none" || !cfg.hasKey) throw new Error("LLM is not configured. Admin → Settings → Insights.");
  const stored = getSetting<{ keyEnc?: string }>(db, "llm", {});
  const apiKey = await decryptSecret(secret, stored.keyEnc!);
  const user = `Stock digest (JSON):\n${JSON.stringify(digest)}\n\nQuestion: ${question}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60000);
  try {
    if (cfg.provider === "anthropic") {
      const res = await fetchImpl(`${cfg.baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: cfg.model, max_tokens: cfg.maxTokens, system: SYSTEM_PROMPT, messages: [{ role: "user", content: user }] }),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`LLM provider returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").trim();
      return { answer: text || "(empty answer)", model: cfg.model };
    }
    const res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: cfg.model, max_tokens: cfg.maxTokens, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: user }] }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`LLM provider returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { answer: data.choices?.[0]?.message?.content?.trim() || "(empty answer)", model: cfg.model };
  } finally {
    clearTimeout(timer);
  }
}
