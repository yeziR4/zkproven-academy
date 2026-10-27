import crypto from "node:crypto";
import { answersCommitment, randomField, recipientField, score, SIGNALS, QUESTIONS } from "./exam.js";
import { publicCourse, examQuestions } from "./courses.js";
import { TERMINAL } from "./kurier.js";
import { submissionMessage, recoverSigner } from "./wallet.js";
import { tutorMessages } from "./tutor.js";

const ATTEMPT_TTL_MS = 30 * 60_000;
const MAX_BODY = 64 * 1024;

/**
 * deps: { courses, prover, store, kurier?, limits?, now? }
 * Returns a node:http listener serving the JSON API under /api.
 */
export function createApi({ courses, prover, store, kurier = null, llm = null, limits = {}, now = () => Date.now(), log = () => {} }) {
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
    });
    if (kurier) submitToZkVerify(cert);
    return ok({ passed: true, answersCommitment: commitment, certificate: cert });
  }

  async function submitToZkVerify(cert) {
    try {
      const job = await kurier.submit(cert);
      certs.put({ ...certs.get(cert.id), zkverify: { status: "Submitted", ...job } });
      pollJob(cert.id, job.jobId);
    } catch (err) {
      log(`zkverify submit failed for ${cert.id}: ${err.message}`);
      certs.put({ ...certs.get(cert.id), zkverify: { status: "SubmitFailed", error: err.message } });
    }
  }

  function pollJob(certId, jobId, tries = 0) {
    setTimeout(async () => {
      try {
        const s = await kurier.status(jobId);
        const current = certs.get(certId);
        if (s.status !== current.zkverify.status) {
          certs.put({ ...current, zkverify: { ...current.zkverify, status: s.status, txHash: s.txHash ?? current.zkverify.txHash, details: s } });
        }
        if (TERMINAL.has(s.status) && !(s.status === "Finalized" && kurier.waitForAggregation)) return;
      } catch (err) {
        log(`zkverify status error for ${certId}: ${err.message}`);
      }
      if (tries < 120) pollJob(certId, jobId, tries + 1);
    }, Math.min(5_000 * 2 ** Math.min(tries, 3), 30_000));
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

  return async function api(req, res) {
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
  };
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
