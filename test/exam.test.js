import test, { after } from "node:test";
import assert from "node:assert/strict";
import { ExamProver, keyCommitment, randomField, score, SIGNALS } from "../src/exam.js";

after(() => setImmediate(() => process.exit(0))); // snarkjs worker threads

const prover = new ExamProver();
const KEY = [1, 2, 0, 3, 1, 0, 2, 2, 1, 3];
const keySalt = randomField();
const learner = "0x1111111111111111111111111111111111111111";

function attempt(answers, overrides = {}) {
  return { courseId: 1, key: KEY, keySalt, passMark: 7, attemptId: randomField(), answers, answersSalt: randomField(), recipient: learner, ...overrides };
}
const withWrong = (n) => KEY.map((k, i) => (i < n ? (k + 1) % 4 : k));

test("a perfect score proves, and the proof reveals neither answers nor key", async () => {
  const a = attempt(KEY);
  const { proof, publicSignals } = await prover.provePass(a);
  assert.ok(await prover.verify(publicSignals, proof));
  assert.equal(publicSignals.length, SIGNALS.length);
  // The only key-related public value is its commitment; answers and key are private inputs.
  assert.equal(publicSignals[SIGNALS.indexOf("keyCommitment")], keyCommitment(1, KEY, keySalt).toString());
});

test("exactly the pass mark (7/10) proves", async () => {
  const a = attempt(withWrong(3));
  assert.equal(score(a.answers, KEY), 7);
  await prover.provePass(a);
});

test("6/10 cannot produce a proof at all", async () => {
  await assert.rejects(prover.provePass(attempt(withWrong(4))));
});

test("grading against a different key than the committed one is impossible", async () => {
  // The grader cannot quietly use an easier key: the commitment is computed from
  // the key it proves with, so a swapped key yields a different public commitment.
  const easyKey = withWrong(10);
  const { publicSignals } = await prover.provePass(attempt(easyKey, { key: easyKey }));
  assert.notEqual(publicSignals[SIGNALS.indexOf("keyCommitment")], keyCommitment(1, KEY, keySalt).toString());
});

test("changing any public signal (recipient, pass mark, course) breaks verification", async () => {
  const { proof, publicSignals } = await prover.provePass(attempt(KEY));
  for (const name of ["recipient", "passMark", "courseId", "attemptId"]) {
    const forged = [...publicSignals];
    forged[SIGNALS.indexOf(name)] = (BigInt(forged[SIGNALS.indexOf(name)]) + 1n).toString();
    assert.equal(await prover.verify(forged, proof), false, name);
  }
});

test("the same answers in a new attempt give a different commitment (no replay)", async () => {
  const a = await prover.provePass(attempt(KEY));
  const b = await prover.provePass(attempt(KEY));
  assert.notEqual(a.publicSignals[SIGNALS.indexOf("answersCommitment")], b.publicSignals[SIGNALS.indexOf("answersCommitment")]);
});
