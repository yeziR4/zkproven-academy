/**
 * zkVerify submission through Kurier: register the exam vk once, submit each
 * certificate proof, and poll until it is Finalized (or Failed).
 * The API key lives in the URL path, so URLs are never logged.
 */
export function makeKurier({ apiKey, apiUrl, vk, chainId, cache, log = () => {} }) {
  if (!apiKey) return null;

  async function call(method, route, body) {
    const res = await fetch(`${apiUrl}/${route}/${apiKey}${method === "GET" && body ? `/${body}` : ""}`, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`kurier ${route} ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    return json;
  }

  async function vkHash() {
    const cached = cache.get("exam-vk");
    if (cached?.vkHash) return cached.vkHash;
    const r = await call("POST", "register-vk", { proofType: "groth16", proofOptions: { library: "snarkjs", curve: "bn128" }, vk });
    const hash = r.vkHash ?? r.meta?.vkHash;
    if (!hash) throw new Error(`register-vk returned no vkHash: ${JSON.stringify(r).slice(0, 300)}`);
    cache.put({ id: "exam-vk", vkHash: hash, at: new Date().toISOString() });
    log(`registered exam vk: ${hash}`);
    return hash;
  }

  async function submit({ proof, publicSignals }) {
    const body = {
      proofType: "groth16",
      vkRegistered: true,
      proofOptions: { library: "snarkjs", curve: "bn128" },
      proofData: { proof, publicSignals, vk: await vkHash() },
    };
    if (chainId) body.chainId = Number(chainId);
    const r = await call("POST", "submit-proof", body);
    return { jobId: r.jobId, optimisticVerify: r.optimisticVerify };
  }

  const status = (jobId) => call("GET", "job-status", jobId);

  return { submit, status, vkHash };
}

export const TERMINAL = new Set(["Finalized", "Failed", "AggregationPublished"]);
