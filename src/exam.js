import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as snarkjs from "snarkjs";
import { poseidon12 } from "poseidon-lite";

export const FIELD_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const QUESTIONS = 10;

const root = path.resolve(import.meta.dirname, "..");

export function randomField() {
  return BigInt("0x" + crypto.randomBytes(31).toString("hex"));
}

function checkChoices(list, label) {
  if (!Array.isArray(list) || list.length !== QUESTIONS) throw new Error(`${label} must have ${QUESTIONS} entries`);
  for (const v of list) if (!Number.isInteger(v) || v < 0 || v > 7) throw new Error(`${label} entries must be integers 0..7`);
}

export function keyCommitment(courseId, key, keySalt) {
  checkChoices(key, "key");
  return poseidon12([BigInt(courseId), ...key.map(BigInt), BigInt(keySalt)]);
}

export function answersCommitment(attemptId, answers, answersSalt) {
  checkChoices(answers, "answers");
  return poseidon12([BigInt(attemptId), ...answers.map(BigInt), BigInt(answersSalt)]);
}

export function score(answers, key) {
  return answers.reduce((n, a, i) => n + (a === key[i] ? 1 : 0), 0);
}

/** An EVM address (or any 0x id) as a field element. */
export function recipientField(address) {
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(address)) throw new Error("recipient must be a 0x address");
  return BigInt(address) % FIELD_P;
}

export class ExamProver {
  constructor(buildDir = path.join(root, "build")) {
    this.wasm = new Uint8Array(fs.readFileSync(path.join(buildDir, "exam.wasm")));
    this.zkey = new Uint8Array(fs.readFileSync(path.join(buildDir, "exam_final.zkey")));
    this.vk = JSON.parse(fs.readFileSync(path.join(buildDir, "exam_vk.json"), "utf8"));
  }

  /**
   * Proves the pass. Throws if the answers do not meet the pass mark — the
   * circuit cannot produce a proof for a fail, so there is nothing to fake.
   */
  async provePass({ courseId, key, keySalt, passMark, attemptId, answers, answersSalt, recipient }) {
    const input = {
      courseId: BigInt(courseId),
      keyCommitment: keyCommitment(courseId, key, keySalt),
      answersCommitment: answersCommitment(attemptId, answers, answersSalt),
      passMark: BigInt(passMark),
      attemptId: BigInt(attemptId),
      recipient: recipientField(recipient),
      answers: answers.map(BigInt),
      key: key.map(BigInt),
      keySalt: BigInt(keySalt),
      answersSalt: BigInt(answersSalt),
    };
    const norm = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : v.toString()]));
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(norm, this.wasm, this.zkey);
    if (!(await this.verify(publicSignals, proof))) throw new Error("self-verification failed");
    return { proof, publicSignals };
  }

  verify(publicSignals, proof) {
    return snarkjs.groth16.verify(this.vk, publicSignals, proof);
  }
}

/** Public signal order, as declared in the circuit's main component. */
export const SIGNALS = ["courseId", "keyCommitment", "answersCommitment", "passMark", "attemptId", "recipient"];
