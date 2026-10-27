/**
 * Minimal OpenAI-compatible chat client, so any inference provider works
 * (set LLM_BASE_URL, LLM_API_KEY, LLM_MODEL).
 */
export function makeLlm({ baseUrl = process.env.LLM_BASE_URL, apiKey = process.env.LLM_API_KEY, model = process.env.LLM_MODEL } = {}) {
  if (!baseUrl || !model) return null;
  return async function chat(messages, { temperature = 0, json = false } = {}) {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model, messages, temperature, ...(json ? { response_format: { type: "json_object" } } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`LLM ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    return data.choices?.[0]?.message?.content ?? "";
  };
}
