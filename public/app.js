import { poseidon12 } from "https://cdn.jsdelivr.net/npm/poseidon-lite@0.3.0/+esm";

const app = document.getElementById("app");
const LETTERS = "ABCDEFGH";
const TERMINAL = new Set(["Finalized", "Failed", "AggregationPublished", "SubmitFailed", "NotSubmitted"]);
const STATUS_LABEL = {
  NotSubmitted: "not submitted (this server has no zkVerify key)",
  Submitting: "submitting…",
  IncludedInBlock: "included in a block",
  Finalized: "finalized ✓",
  AggregationPending: "finalized ✓, waiting to be relayed on-chain",
  Aggregated: "finalized ✓, aggregated",
  AggregationPublished: "finalized and relayed ✓",
  SubmitFailed: "submission failed",
};
const SIGNALS = ["courseId", "keyCommitment", "answersCommitment", "passMark", "attemptId", "recipient"];
let pollTimer = null;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const short = (s, n = 10) => (s && s.length > 2 * n + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);

async function api(method, route, body) {
  const res = await fetch(route, { method, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `request failed (${res.status})`);
  return data;
}

// Must match src/wallet.js submissionMessage exactly.
function submissionMessage({ course, attemptId, answersCommitment, recipient }) {
  return ["zkProven Academy exam submission", `Course: ${course}`, `Attempt: ${attemptId}`, `Answers commitment: ${answersCommitment}`, `Recipient: ${recipient.toLowerCase()}`].join("\n");
}

function randomField() {
  const b = crypto.getRandomValues(new Uint8Array(31));
  return BigInt("0x" + [...b].map((x) => x.toString(16).padStart(2, "0")).join(""));
}

// ---------- routing ----------
const routes = [
  [/^#?\/?$/, home],
  [/^#\/course\/([\w-]+)$/, course],
  [/^#\/exam\/([\w-]+)$/, exam],
  [/^#\/cert\/(\w+)$/, certificate],
  [/^#\/verify$/, verifyPage],
  [/^#\/agents$/, agentsPage],
];
async function render() {
  clearTimeout(pollTimer);
  const hash = location.hash || "#/";
  for (const [re, view] of routes) {
    const m = hash.match(re);
    if (m) {
      try {
        await view(...m.slice(1));
      } catch (err) {
        app.innerHTML = `<div class="notice bad">${esc(err.message)}</div>`;
      }
      app.focus();
      window.scrollTo(0, 0);
      return;
    }
  }
  app.innerHTML = `<div class="notice">Page not found. <a href="#/">Go home</a></div>`;
}
window.addEventListener("hashchange", render);
render();

// ---------- views ----------
async function home() {
  const courses = await api("GET", "/api/courses");
  app.innerHTML = `
    <section class="hero">
      <span class="eyebrow">For humans and AI agents</span>
      <h1>Learn it. Prove it.<br>Reveal nothing.</h1>
      <p>Take a course, pass the exam, and get a certificate anyone can check on zkVerify. The proof shows you passed, but not your answers, your score, or the answer key.</p>
    </section>
    <section class="grid grid-3" aria-label="How it works">
      ${[
        ["01", "Learn", "Study the lessons and ask the AI tutor anything."],
        ["02", "Commit", "Your answers are locked in a Poseidon commitment and signed with your wallet."],
        ["03", "Prove", "A Groth16 circuit proves your committed answers met the pass mark against a pre-committed key."],
        ["04", "Verify", "The proof is verified and finalized on zkVerify. Anyone can check it."],
      ].map(([n, t, d]) => `<div class="card"><div class="step-num">${n}</div><h3>${t}</h3><p class="muted">${d}</p></div>`).join("")}
    </section>
    <h2 style="margin-top:40px">Courses</h2>
    <div class="grid grid-3">
      ${courses.map((c) => `
        <article class="card stack">
          <div><span class="badge">${c.audience.map(esc).join(" + ")}</span></div>
          <h3>${esc(c.title)}</h3>
          <p class="muted">${esc(c.summary)}</p>
          <p class="muted">${c.questions.length} questions · pass mark ${c.passMark}/${c.questions.length}</p>
          <div class="btn-row"><a class="btn" href="#/course/${esc(c.slug)}">Start learning</a><a class="btn secondary" href="#/exam/${esc(c.slug)}">Take the exam</a></div>
        </article>`).join("")}
    </div>`;
}

async function course(slug) {
  const c = await api("GET", `/api/courses/${slug}`);
  app.innerHTML = `
    <p><a href="#/">← All courses</a></p>
    <h1>${esc(c.title)}</h1>
    <p class="muted" style="max-width:680px">${esc(c.summary)}</p>
    <div class="split" style="margin-top:24px">
      <section class="card">
        ${c.lessons.map((l) => `
          <article class="lesson">
            <h3>${esc(l.title)}</h3>
            <p>${esc(l.body)}</p>
            <ul>${l.keyPoints.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>
          </article>`).join("")}
        <div class="btn-row" style="margin-top:16px"><a class="btn" href="#/exam/${esc(slug)}">I'm ready: take the exam</a></div>
      </section>
      <aside class="card chat" aria-label="AI tutor">
        <h3>AI tutor</h3>
        <div class="chat-log" id="log" aria-live="polite">
          <div class="msg assistant">Hi! Ask me anything about the lessons, like "why isn't a valid proof enough?" or "quiz me on commitments".</div>
        </div>
        <form id="ask"><input id="q" placeholder="Ask the tutor…" autocomplete="off" aria-label="Your question"><button class="btn" type="submit">Send</button></form>
      </aside>
    </div>`;

  const history = [];
  const log = document.getElementById("log");
  const add = (role, text) => {
    const div = document.createElement("div");
    div.className = `msg ${role}`;
    div.textContent = text;
    log.append(div);
    log.scrollTop = log.scrollHeight;
    return div;
  };
  document.getElementById("ask").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("q");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    history.push({ role: "user", content: text });
    add("user", text);
    const pending = add("assistant", "…");
    try {
      const { reply } = await api("POST", "/api/tutor", { course: slug, messages: history });
      history.push({ role: "assistant", content: reply });
      pending.textContent = reply;
    } catch (err) {
      pending.textContent = `Tutor unavailable: ${err.message}`;
      history.pop();
    }
  });
}

async function exam(slug) {
  const c = await api("GET", `/api/courses/${slug}`);
  app.innerHTML = `
    <p><a href="#/course/${esc(slug)}">← Back to the course</a></p>
    <h1>Exam: ${esc(c.title)}</h1>
    <p class="muted">${c.questions.length} questions · pass mark ${c.passMark}. You get only "passed" or "not passed", never a score, so the answer key stays secret. 3 attempts per 24 hours.</p>
    <div class="card stack" id="wallet">
      <h3>1. Choose the address your certificate goes to</h3>
      <p class="muted">You'll sign your submission with this address, so nobody else can sit the exam for it.</p>
      <div class="btn-row">
        <button class="btn" id="connect">Connect wallet</button>
        <button class="btn secondary" id="temp">No wallet? Use a temporary in-browser key</button>
      </div>
      <div id="who"></div>
    </div>
    <div id="paper"></div>`;

  let signer = null;
  const who = document.getElementById("who");
  const ready = () => {
    who.innerHTML = `<div class="notice ok">Certificate address: <span class="mono">${esc(signer.address)}</span>${signer.temp ? " (temporary key, kept only in this tab)" : ""}</div>`;
    startPaper();
  };

  document.getElementById("connect").onclick = async () => {
    if (!window.ethereum) {
      who.innerHTML = `<div class="notice warn">No browser wallet found. Install one (e.g. MetaMask), or use a temporary key.</div>`;
      return;
    }
    try {
      const [address] = await window.ethereum.request({ method: "eth_requestAccounts" });
      signer = {
        address: address.toLowerCase(),
        sign: (msg) => window.ethereum.request({ method: "personal_sign", params: ["0x" + [...new TextEncoder().encode(msg)].map((b) => b.toString(16).padStart(2, "0")).join(""), address] }),
      };
      ready();
    } catch (err) {
      who.innerHTML = `<div class="notice bad">${esc(err.message)}</div>`;
    }
  };
  document.getElementById("temp").onclick = async () => {
    const { secp256k1 } = await import("https://cdn.jsdelivr.net/npm/@noble/curves@1.4.0/secp256k1/+esm");
    const { keccak_256 } = await import("https://cdn.jsdelivr.net/npm/@noble/hashes@1.4.0/sha3/+esm");
    const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    const priv = secp256k1.utils.randomPrivateKey();
    const address = "0x" + hex(keccak_256(secp256k1.getPublicKey(priv, false).slice(1)).slice(-20));
    signer = {
      address,
      temp: true,
      sign: async (msg) => {
        const body = new TextEncoder().encode(msg);
        const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${body.length}`);
        const sig = secp256k1.sign(keccak_256(new Uint8Array([...prefix, ...body])), priv);
        return "0x" + sig.toCompactHex() + (27 + sig.recovery).toString(16);
      },
    };
    ready();
  };

  async function startPaper() {
    const paper = document.getElementById("paper");
    let attempt;
    try {
      attempt = await api("POST", "/api/attempts", { course: slug, recipient: signer.address });
    } catch (err) {
      paper.innerHTML = `<div class="notice bad" style="margin-top:16px">${esc(err.message)}</div>`;
      return;
    }
    paper.innerHTML = `
      <form class="card" id="examForm" style="margin-top:16px">
        <h3>2. Answer all ${attempt.questions.length} questions</h3>
        <p class="muted">This attempt expires at ${new Date(attempt.expiresAt).toLocaleTimeString()}.</p>
        ${attempt.questions.map((q, i) => `
          <div class="question"><fieldset>
            <legend>${i + 1}. ${esc(q.prompt)}</legend>
            ${q.options.map((o, j) => `<label class="option"><input type="radio" name="q${i}" value="${j}" required> <span><b>${LETTERS[j]}</b> ${esc(o)}</span></label>`).join("")}
          </fieldset></div>`).join("")}
        <h3>3. Commit, sign and submit</h3>
        <p class="muted">Your answers are hashed with a random salt into a commitment. You sign that commitment, then the grader proves the result.</p>
        <button class="btn" type="submit" id="submit">Sign and submit</button>
        <div id="result" style="margin-top:16px"></div>
      </form>`;

    document.getElementById("examForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("submit");
      const out = document.getElementById("result");
      const answers = attempt.questions.map((_, i) => Number(new FormData(e.target).get(`q${i}`)));
      const salt = randomField();
      const commitment = poseidon12([BigInt(attempt.attemptId), ...answers.map(BigInt), salt]).toString();
      btn.disabled = true;
      try {
        out.innerHTML = `<div class="notice">Waiting for your signature…</div>`;
        const signature = await signer.sign(submissionMessage({ course: slug, attemptId: attempt.attemptId, answersCommitment: commitment, recipient: signer.address }));
        out.innerHTML = `<div class="notice">Grading and generating your proof…</div>`;
        const r = await api("POST", `/api/attempts/${attempt.attemptId}/submit`, { answers, answersSalt: salt.toString(), signature });
        if (r.answersCommitment !== commitment) throw new Error("The grader's commitment doesn't match yours, so it graded something else. Not accepting this result.");
        const receipt = { course: slug, attemptId: attempt.attemptId, recipient: signer.address, answers, answersSalt: salt.toString(), answersCommitment: commitment };
        try { localStorage.setItem(`receipt:${attempt.attemptId}`, JSON.stringify(receipt)); } catch {}
        const dl = `data:application/json,${encodeURIComponent(JSON.stringify(receipt, null, 2))}`;
        if (!r.passed) {
          out.innerHTML = `<div class="notice bad">Not passed this time. Review the lessons and try again. Your <a download="zkproven-receipt.json" href="${dl}">answer receipt</a> proves what you submitted.</div>`;
          return;
        }
        const onChain = r.certificate.zkverify?.status !== "NotSubmitted";
        out.innerHTML = `<div class="notice ok">Passed! ${onChain ? "Your certificate is being verified on zkVerify." : "Your certificate proof is ready."} <a href="#/cert/${esc(r.certificate.id)}">View certificate →</a> · <a download="zkproven-receipt.json" href="${dl}">Download receipt</a></div>`;
      } catch (err) {
        out.innerHTML = `<div class="notice bad">${esc(err.message)}</div>`;
        btn.disabled = false;
      }
    });
  }
}

async function certificate(id) {
  const c = await api("GET", `/api/certificates/${id}`);
  const sig = (n) => c.publicSignals[SIGNALS.indexOf(n)];
  const z = c.zkverify ?? {};
  const statusClass = z.status === "Finalized" || z.status === "AggregationPublished" ? "ok" : /Fail/.test(z.status) ? "bad" : "warn";
  app.innerHTML = `
    <div class="card stack">
      <div class="cert-seal">Certificate of completion</div>
      <h1>${esc(c.courseTitle)}</h1>
      <p>Awarded to <span class="mono">${esc(c.recipient)}</span> on ${new Date(c.issuedAt).toLocaleDateString()}.</p>
      <p><span class="badge ${statusClass}">zkVerify: ${esc(STATUS_LABEL[z.status] ?? z.status ?? "unknown")}</span>
        ${z.txHash ? ` <a href="https://zkverify.subscan.io/extrinsic/${esc(z.txHash)}" target="_blank" rel="noopener">View transaction ↗</a>` : ""}</p>
      <dl class="kv">
        <dt>Certificate ID</dt><dd class="mono">${esc(c.id)}</dd>
        <dt>Course ID</dt><dd class="mono">${esc(sig("courseId"))}</dd>
        <dt>Pass mark</dt><dd>${esc(sig("passMark"))} / 10</dd>
        <dt>Answer-key commitment</dt><dd class="mono">${esc(short(sig("keyCommitment"), 14))}</dd>
        <dt>Answers commitment</dt><dd class="mono">${esc(short(sig("answersCommitment"), 14))}</dd>
        ${z.txHash ? `<dt>zkVerify tx</dt><dd class="mono">${esc(short(z.txHash, 14))}</dd>` : ""}
        ${z.jobId ? `<dt>Kurier job</dt><dd class="mono">${esc(z.jobId)}</dd>` : ""}
        ${relayRow(c.relay)}
        ${rewardRow(c.reward)}
      </dl>
      <p class="muted">What this proves: answers committed by this address scored at least the pass mark against the answer key committed for this course. The answers, the score and the key stay private.</p>
      <div class="btn-row"><button class="btn" id="check">Verify in my browser</button><button class="btn secondary" id="copy">Copy proof JSON</button></div>
      <div id="checks"></div>
    </div>`;

  document.getElementById("check").onclick = () => runChecks(c.proof, c.publicSignals, document.getElementById("checks"));
  document.getElementById("copy").onclick = async () => {
    await navigator.clipboard.writeText(JSON.stringify({ proof: c.proof, publicSignals: c.publicSignals }));
    document.getElementById("copy").textContent = "Copied";
  };
  const relayPending = c.relay && !["AggregationPublished", "Failed", "SubmitFailed"].includes(c.relay.status);
  const rewardPending = c.reward?.status === "Claiming" || (c.relay?.status === "AggregationPublished" && !c.reward);
  if (!TERMINAL.has(z.status) || relayPending || rewardPending) pollTimer = setTimeout(render, 5000);
}

function relayRow(r) {
  if (!r) return "";
  const label = {
    Submitting: "submitting…",
    Submitted: "verifying…",
    IncludedInBlock: "verifying…",
    Finalized: "verified, waiting for aggregation",
    AggregationPending: "waiting for aggregation (can take a while)",
    Aggregated: "aggregated, relaying to Base Sepolia…",
    AggregationPublished: "published on Base Sepolia ✓",
  }[r.status] ?? r.status;
  const agg = r.aggregation ? ` · aggregation #${esc(r.aggregation.aggregationId)} · leaf ${r.aggregation.leafMatches ? "✓" : "✗"}` : "";
  return `<dt>Relay to Base Sepolia</dt><dd><span class="badge ${r.status === "AggregationPublished" ? "ok" : /Fail/.test(r.status) ? "bad" : "warn"}">${esc(label)}</span><span class="mono">${agg}</span></dd>`;
}

function rewardRow(r) {
  if (!r) return "";
  if (r.status === "Claimed") {
    return `<dt>On-chain reward</dt><dd><span class="badge ok">Credential #${esc(r.tokenId)} + ZKPL minted</span> <a href="${esc(r.explorer)}" target="_blank" rel="noopener">View on explorer ↗</a></dd>`;
  }
  const label = { Claiming: "claiming…", ClaimFailed: `claim failed: ${r.error ?? ""}`, NotClaimable: `not claimable: ${r.reason ?? ""}`, Reverted: "claim reverted" }[r.status] ?? r.status;
  return `<dt>On-chain reward</dt><dd><span class="badge ${r.status === "Claiming" ? "warn" : "bad"}">${esc(label)}</span></dd>`;
}

async function runChecks(proof, publicSignals, target) {
  target.innerHTML = `<div class="notice">Checking…</div>`;
  try {
    const vk = await api("GET", "/api/vk");
    const local = await window.snarkjs.groth16.verify(vk, publicSignals, proof);
    const server = await api("POST", "/api/verify", { proof, publicSignals });
    const row = (ok, text) => `<li>${ok ? "✅" : "❌"} ${text}</li>`;
    target.innerHTML = `
      <div class="notice ${local && server.valid ? "ok" : "bad"}">${local && server.valid ? "Valid certificate" : "Invalid certificate"}</div>
      <ul class="checks">
        ${row(local, "Groth16 proof verifies <b>in your browser</b> against the published verification key")}
        ${row(server.checks.knownCourse, "Course exists")}
        ${row(server.checks.keyCommitmentMatches, "Answer-key commitment matches the one published for this course")}
        ${row(server.checks.passMarkMatches, "Pass mark matches the course")}
      </ul>
      <p class="muted">Certificate holder: <span class="mono">${esc(server.recipient)}</span></p>`;
  } catch (err) {
    target.innerHTML = `<div class="notice bad">${esc(err.message)}</div>`;
  }
}

async function verifyPage() {
  app.innerHTML = `
    <h1>Verify a certificate</h1>
    <p class="muted">Paste a certificate ID, or the proof JSON someone shared with you. Verification runs in your browser.</p>
    <div class="card stack">
      <form id="byId" class="btn-row"><input id="cid" placeholder="Certificate ID, e.g. 77e89a575089126a" aria-label="Certificate ID" style="flex:1;min-width:220px"><button class="btn">Open</button></form>
      <label for="json"><b>…or paste proof JSON</b></label>
      <textarea id="json" placeholder='{"proof": {...}, "publicSignals": [...]}'></textarea>
      <div class="btn-row"><button class="btn" id="checkJson">Verify JSON</button></div>
      <div id="out"></div>
    </div>`;
  document.getElementById("byId").addEventListener("submit", (e) => {
    e.preventDefault();
    location.hash = `#/cert/${document.getElementById("cid").value.trim()}`;
  });
  document.getElementById("checkJson").onclick = () => {
    const out = document.getElementById("out");
    try {
      const { proof, publicSignals } = JSON.parse(document.getElementById("json").value);
      runChecks(proof, publicSignals, out);
    } catch {
      out.innerHTML = `<div class="notice bad">That isn't valid JSON with "proof" and "publicSignals".</div>`;
    }
  };
}

function agentsPage() {
  const origin = location.origin;
  app.innerHTML = `
    <h1>For AI agents</h1>
    <p class="muted" style="max-width:700px">Agents take the same exams over a JSON API and get the same proven certificates. An agent signs with its own key, so the certificate is bound to the agent's address.</p>
    <div class="card stack">
      <h3>Run the reference agent</h3>
      <pre>node scripts/agent-learner.mjs --api ${esc(origin)} --course agents-and-zk</pre>
      <p class="muted">It studies the lessons, answers with any OpenAI-compatible model (<code>LLM_BASE_URL</code>, <code>LLM_API_KEY</code>, <code>LLM_MODEL</code>), signs its submission, checks the grader graded exactly its answers, and verifies its certificate.</p>
      <h3>API</h3>
      <pre>GET  /api/courses/:slug                  lessons + questions (no key)
POST /api/attempts                       { course, recipient } → attemptId, questions
POST /api/attempts/:id/submit            { answers, answersSalt, signature }
GET  /api/certificates/:id               certificate + zkVerify status
POST /api/verify                         { proof, publicSignals } → checks
POST /api/tutor                          { course, messages } → reply</pre>
      <h3>What to sign</h3>
      <p class="muted">An EIP-191 <code>personal_sign</code> of:</p>
      <pre>zkProven Academy exam submission
Course: &lt;slug&gt;
Attempt: &lt;attemptId&gt;
Answers commitment: Poseidon(attemptId, answers[10], answersSalt)
Recipient: &lt;lowercase address&gt;</pre>
    </div>`;
}
