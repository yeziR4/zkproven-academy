import crypto from "node:crypto";
import { answersCommitment, randomField, recipientField, score, SIGNALS, QUESTIONS } from "./exam.js";
import { publicCourse, examQuestions } from "./courses.js";
import { TERMINAL } from "./kurier.js";
import { submissionMessage, recoverSigner } from "./wallet.js";
import { tutorMessages } from "./tutor.js";
import { groth16Leaf } from "./leaf.js";

const ATTEMPT_TTL_MS = 30 * 60_000;
const MAX_BODY = 64 * 1024;

/**
 * deps: { courses, prover, store, kurier?, limits?, now? }
 * Returns a node:http listener serving the JSON API under /api.
 */
export function createApi({ courses, prover, store, kurier = null, rewardKurier = null, llm = null, relayer = null, limits = {}, now = () => Date.now(), log = () => {} }) {
  // A passing certificate is submitted to zkVerify for the certificate record and,
  // when rewards are on, separately to the zkVerify network that relays to the
  // reward chain (mainnet zkVerify only relays to mainnet chains).
  const certTrack = kurier && { field: "zkverify", client: kurier, done: TERMINAL };
  const relayTrack = rewardKurier && relayer && { field: "relay", client: rewardKurier, done: new Set(["AggregationPublished", "Failed"]), afterPoll: (id) => maybeClaim(id) };
  const tracks = [certTrack, relayTrack].filter(Boolean);
  const attempts = store.collection("attempts");
  const certs = store.collection("certificates");
  const maxAttempts = limits.attemptsPerDay ?? 3;

  const routes = [
    ["GET", /^\/api\/courses$/, () => ok([...courses.values()].map((c) => publicCourse(c, { withLessons: false })))],
    ["GET", /^\/api\/courses\/([\w-]+)$/, (_, [slug]) => {
      const c = courses.get(slug);
      return c ? ok(publicCourse(c)) : fail(404, "unknown course");
    }],
    ["POST", /^\/api\/attempts$/, startAttempt],
    ["POST", /^\/api\/attempts\/(\d+)\/submit$/, submitAttempt],
    ["GET", /^\/api\/certificates\/(\w+)$/, (_, [id]) => {
      const c = certs.get(id);
      return c ? ok(c) : fail(404, "unknown certificate");
    }],
    ["GET", /^\/api\/certificates$/, (req) => {
      const r = new URL(req.url, "http://x").searchParams.get("recipient")?.toLowerCase();
      return ok(certs.all().filter((c) => !r || c.recipient === r));
    }],
    ["POST", /^\/api\/verify$/, verify],
    ["GET", /^\/api\/vk$/, () => ok(prover.vk)],
    ["GET", /^\/api\/rewards$/, () => ok(relayer ? { chainId: relayer.chain.id, chain: relayer.chain.name, contract: relayer.rewardsAddress, explorer: relayer.chain.blockExplorers.default.url } : null)],
    ["POST", /^\/api\/tutor$/, tutor],
  ];

  const tutorUse = new Map(); // client ip -> recent request timestamps

  async function tutor(req) {
    if (!llm) return fail(503, "tutor is not configured (set LLM_BASE_URL and LLM_MODEL)");
    const ip = req.socket.remoteAddress ?? "?";
    const recent = (tutorUse.get(ip) ?? []).filter((t) => now() - t < 60_000);
    if (recent.length >= (limits.tutorPerMinute ?? 10)) return fail(429, "slow down: tutor limit per minute reached");
    tutorUse.set(ip, [...recent, now()]);

    const { course: slug, messages } = await body(req);
    const course = courses.get(slug);
    if (!course) return fail(404, "unknown course");
    if (!Array.isArray(messages) || messages.length === 0) return fail(400, "messages required");
    const reply = await llm(tutorMessages(course, messages), { temperature: 0.3 });
    return ok({ reply });
  }

  async function startAttempt(req) {
    const { course: slug, recipient } = await body(req);
    const course = courses.get(slug);
    if (!course) return fail(404, "unknown course");
    try {
      recipientField(recipient ?? "");
    } catch (e) {
      return fail(400, e.message);
    }
    const who = recipient.toLowerCase();
    if (certs.all().some((c) => c.course === slug && c.recipient === who)) return fail(409, "already certified for this course");
    // Pass/fail is an oracle on the key; cap how often anyone can query it.
    const recent = attempts.all().filter((a) => a.course === slug && a.recipient === who && now() - a.createdAt < 86_400_000);
    if (recent.length >= maxAttempts) return fail(429, `limit of ${maxAttempts} attempts per 24h reached`);

    const attempt = attempts.put({
      id: randomField().toString(),
      course: slug,
      recipient: who,
      createdAt: now(),
      expiresAt: now() + ATTEMPT_TTL_MS,
      status: "open",
    });
    return ok({
      attemptId: attempt.id,
      course: slug,
      passMark: course.passMark,
      expiresAt: new Date(attempt.expiresAt).toISOString(),
      questions: examQuestions(course),
      commitment: "Poseidon(attemptId, answers[10], answersSalt) — keep your answersSalt as a receipt",
    });
  }

  async function submitAttempt(req, [attemptId]) {
    const attempt = attempts.get(attemptId);
    if (!attempt) return fail(404, "unknown attempt");
    if (attempt.status !== "open") return fail(409, "attempt already submitted");
    if (now() > attempt.expiresAt) return fail(410, "attempt expired");
    const { answers, answersSalt, signature } = await body(req);
    if (!Array.isArray(answers) || answers.length !== QUESTIONS || !answers.every((a) => Number.isInteger(a) && a >= 0 && a <= 3)) {
      return fail(400, `answers must be ${QUESTIONS} option indexes 0..3`);
    }
    let salt;
    try {
      salt = BigInt(answersSalt);
    } catch {
      return fail(400, "answersSalt must be an integer string");
    }

    const course = courses.get(attempt.course);
    const commitment = answersCommitment(attempt.id, answers, salt).toString();
    // Only the recipient's own key can submit, so nobody can sit an exam for someone else's address.
    const message = submissionMessage({ course: attempt.course, attemptId: attempt.id, answersCommitment: commitment, recipient: attempt.recipient });
    if (typeof signature !== "string" || recoverSigner(message, signature) !== attempt.recipient) {
      return fail(401, "signature must be the recipient's personal_sign of the submission message");
    }
    const passed = score(answers, course.secret.key) >= course.passMark;
    attempts.put({ ...attempt, status: passed ? "passed" : "failed", submittedAt: now(), answersCommitment: commitment });
    if (!passed) return ok({ passed: false, answersCommitment: commitment });

    const { proof, publicSignals } = await prover.provePass({
      courseId: course.id,
      key: course.secret.key,
      keySalt: course.secret.keySalt,
      passMark: course.passMark,
      attemptId: attempt.id,
      answers,
      answersSalt: salt,
      recipient: attempt.recipient,
    });
    const cert = certs.put({
      id: crypto.createHash("sha256").update(publicSignals.join(",")).digest("hex").slice(0, 16),
      course: attempt.course,
      courseTitle: course.title,
      recipient: attempt.recipient,
      issuedAt: new Date(now()).toISOString(),
      publicSignals,
      proof,
      zkverify: kurier ? { status: "Submitting" } : { status: "NotSubmitted" },
      ...(relayTrack ? { relay: { status: "Submitting" } } : {}),
    });
    for (const track of tracks) submit(cert.id, track);
    return ok({ passed: true, answersCommitment: commitment, certificate: cert });
  }

  async function submit(certId, track) {
    try {
      const job = await track.client.submit(certs.get(certId));
      certs.put({ ...certs.get(certId), [track.field]: { status: "Submitted", ...job } });
      pollJob(certId, job.jobId, track);
    } catch (err) {
      log(`${track.field} submit failed for ${certId}: ${err.message}`);
      certs.put({ ...certs.get(certId), [track.field]: { status: "SubmitFailed", error: err.message } });
    }
  }

  function pollJob(certId, jobId, track, tries = 0) {
    setTimeout(async () => {
      try {
        const s = await track.client.status(jobId);
        const current = certs.get(certId);
        const prev = current[track.field];
        if (s.status !== prev.status) {
          const next = { ...prev, status: s.status, txHash: s.txHash ?? prev.txHash };
          if (s.aggregationDetails) next.aggregation = await aggregationOf(s, current.publicSignals, track.client);
          certs.put({ ...current, [track.field]: next });
        }
        // Kurier can report "Aggregated" long after the root is already on the reward chain,
        // so check the chain itself on every poll instead of waiting for "AggregationPublished".
        if (track.afterPoll && certs.get(certId)[track.field]?.aggregation && (await track.afterPoll(certId))) return;
        if (track.done.has(s.status)) return;
      } catch (err) {
        log(`${track.field} status error for ${certId}: ${err.message}`);
      }
      // Aggregation and relay can take a while; keep checking for up to ~2h.
      if (tries < 300) pollJob(certId, jobId, track, tries + 1);
    }, Math.min(5_000 * 2 ** Math.min(tries, 3), 30_000));
  }

  /** Normalizes Kurier's aggregation data and checks it is the leaf our contract will rebuild. */
  async function aggregationOf(s, publicSignals, client) {
    const d = s.aggregationDetails;
    const expectedLeaf = groth16Leaf(await client.vkHash(), publicSignals);
    const agg = {
      domainId: s.domainId ?? d.domainId ?? limits.domainId ?? null,
      aggregationId: s.aggregationId ?? d.aggregationId,
      leaf: d.leaf,
      leafIndex: d.leafIndex,
      numberOfLeaves: d.numberOfLeaves,
      merkleProof: d.merkleProof,
      receipt: d.receipt,
      leafMatches: d.leaf?.toLowerCase() === expectedLeaf.toLowerCase(),
    };
    if (!agg.leafMatches) log(`leaf mismatch: kurier ${d.leaf} vs ours ${expectedLeaf}`);
    return agg;
  }

  /** Claims once the aggregation root is on-chain. Returns true when there is nothing left to wait for. */
  async function maybeClaim(certId) {
    const cert = certs.get(certId);
    if (!relayer || ["Claimed", "Claiming"].includes(cert.reward?.status)) return true;
    const agg = cert.relay?.aggregation;
    if (!agg) return false;
    if (!agg.leafMatches) return claimReward(certId).then(() => true);
    let domainId = agg.domainId;
    const root = domainId != null ? await relayer.publishedRoot(domainId, agg.aggregationId) : null;
    if (!root || root.toLowerCase() !== agg.receipt?.toLowerCase()) {
      domainId = await relayer.findDomain(agg.aggregationId, agg.receipt);
      if (domainId == null) return false; // not published on the reward chain yet
    }
    if (String(domainId) !== String(agg.domainId)) {
      certs.put({ ...cert, relay: { ...cert.relay, aggregation: { ...agg, domainId } } });
    }
    await claimReward(certId);
    return true;
  }

  /** After a restart, pick up certificates whose verification or reward is still in flight. */
  function resume() {
    for (const cert of certs.all()) {
      for (const track of tracks) {
        const t = cert[track.field];
        if (!t?.jobId || track.done.has(t.status)) continue;
        if (track === relayTrack && cert.reward?.status === "Claimed") continue;
        log(`resuming ${track.field} for ${cert.id} (${t.status})`);
        pollJob(cert.id, t.jobId, track);
      }
      if (relayTrack && relayTrack.done.has(cert.relay?.status) && cert.relay?.aggregation && cert.reward?.status !== "Claimed") {
        log(`retrying reward for ${cert.id}`);
        maybeClaim(cert.id).catch((err) => log(`reward retry failed for ${cert.id}: ${err.message}`));
      }
    }
  }

  async function claimReward(certId) {
    const cert = certs.get(certId);
    if (!relayer) return;
    const agg = cert.relay?.aggregation;
    if (!agg?.leafMatches || agg.domainId == null) {
      certs.put({ ...cert, reward: { status: "NotClaimable", reason: !agg?.leafMatches ? "leaf mismatch" : "unknown domainId" } });
      return;
    }
    certs.put({ ...cert, reward: { status: "Claiming" } });
    try {
      const r = await relayer.claim({ publicSignals: cert.publicSignals, aggregation: agg });
      certs.put({ ...certs.get(certId), reward: { status: r.status === "success" ? "Claimed" : "Reverted", ...r, contract: relayer.rewardsAddress, chainId: relayer.chain.id } });
    } catch (err) {
      log(`reward claim failed for ${certId}: ${err.shortMessage ?? err.message}`);
      certs.put({ ...certs.get(certId), reward: { status: "ClaimFailed", error: err.shortMessage ?? err.message } });
    }
  }

  /** Anyone can check a certificate: valid proof AND it is for a real course's committed key and pass mark. */
  async function verify(req) {
    const { proof, publicSignals } = await body(req);
    if (!proof || !Array.isArray(publicSignals) || publicSignals.length !== SIGNALS.length) return fail(400, "need proof and publicSignals");
    const field = (n) => publicSignals[SIGNALS.indexOf(n)];
    const course = [...courses.values()].find((c) => String(c.id) === field("courseId"));
    const checks = {
      proofValid: await prover.verify(publicSignals, proof).catch(() => false),
      knownCourse: Boolean(course),
      keyCommitmentMatches: course ? field("keyCommitment") === course.keyCommitment : false,
      passMarkMatches: course ? field("passMark") === String(course.passMark) : false,
    };
    return ok({
      valid: Object.values(checks).every(Boolean),
      checks,
      course: course?.slug ?? null,
      recipient: "0x" + BigInt(field("recipient")).toString(16).padStart(40, "0"),
    });
  }

  async function api(req, res) {
    const pathname = new URL(req.url, "http://x").pathname;
    for (const [method, re, handler] of routes) {
      const m = pathname.match(re);
      if (m && req.method === method) {
        try {
          return send(res, await handler(req, m.slice(1)));
        } catch (err) {
          if (err.status) return send(res, fail(err.status, err.message));
          log(`error ${method} ${pathname}: ${err.message}`);
          return send(res, fail(500, "internal error"));
        }
      }
    }
    return send(res, fail(404, "not found"));
  }
  api.resume = resume;
  return api;
}

const ok = (data) => ({ status: 200, data });
const fail = (status, error) => ({ status, data: { error } });

function send(res, { status, data }) {
  const json = JSON.stringify(data);
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "content-length": Buffer.byteLength(json) });
  res.end(json);
}

function body(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("body too large"), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(Object.assign(new Error("invalid json"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}
