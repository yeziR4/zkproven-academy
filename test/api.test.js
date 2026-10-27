import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { createApi } from "../src/api.js";
import { loadCourses } from "../src/courses.js";
import { ExamProver, answersCommitment, randomField } from "../src/exam.js";
import { Store } from "../src/store.js";

let server, base;
const KEY = JSON.parse(fs.readFileSync("courses/agents-and-zk/key.json", "utf8")).key;
const learner = (n) => `0x${String(n).padStart(40, "0")}`;

before(async () => {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), "academy-")));
  server = http.createServer(createApi({ courses: loadCourses("courses"), prover: new ExamProver(), store, limits: { attemptsPerDay: 2 } }));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  setImmediate(() => process.exit(0));
});

const call = async (method, route, body) => {
  const res = await fetch(base + route, { method, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
};
async function take(recipient, answers) {
  const { data: attempt } = await call("POST", "/api/attempts", { course: "agents-and-zk", recipient });
  const salt = randomField();
  const r = await call("POST", `/api/attempts/${attempt.attemptId}/submit`, { answers, answersSalt: salt.toString() });
  return { attempt, salt, ...r };
}

test("public course data never includes the answer key", async () => {
  const { data } = await call("GET", "/api/courses/agents-and-zk");
  const text = JSON.stringify(data);
  assert.ok(data.keyCommitment && data.lessons.length === 5);
  assert.ok(!("secret" in data) && !text.includes("keySalt"));
});

test("passing yields a certificate that the public verifier accepts", async () => {
  const r = await take(learner(1), KEY);
  assert.equal(r.data.passed, true);
  assert.equal(r.data.answersCommitment, answersCommitment(BigInt(r.attempt.attemptId), KEY, r.salt).toString());
  const v = await call("POST", "/api/verify", { proof: r.data.certificate.proof, publicSignals: r.data.certificate.publicSignals });
  assert.equal(v.data.valid, true);
  assert.equal(v.data.recipient, learner(1));
});

test("failing reveals nothing but the fact of failing", async () => {
  const r = await take(learner(2), KEY.map((k) => (k + 1) % 4));
  assert.deepEqual(Object.keys(r.data).sort(), ["answersCommitment", "passed"]);
  assert.equal(r.data.passed, false);
});

test("attempts are rate limited per learner (pass/fail is an oracle on the key)", async () => {
  await take(learner(3), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  await take(learner(3), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const third = await call("POST", "/api/attempts", { course: "agents-and-zk", recipient: learner(3) });
  assert.equal(third.status, 429);
});

test("an attempt cannot be submitted twice, and a certified learner cannot re-enter", async () => {
  const r = await take(learner(4), KEY);
  const again = await call("POST", `/api/attempts/${r.attempt.attemptId}/submit`, { answers: KEY, answersSalt: "1" });
  assert.equal(again.status, 409);
  assert.equal((await call("POST", "/api/attempts", { course: "agents-and-zk", recipient: learner(4) })).status, 409);
});

test("the verifier rejects a certificate whose recipient was swapped", async () => {
  const r = await take(learner(5), KEY);
  const forged = [...r.data.certificate.publicSignals];
  forged[5] = BigInt(learner(6)).toString();
  const v = await call("POST", "/api/verify", { proof: r.data.certificate.proof, publicSignals: forged });
  assert.equal(v.data.valid, false);
  assert.equal(v.data.checks.proofValid, false);
});
