// Compiles circuits/exam.circom and runs a Groth16 setup into build/.
//
// The powers-of-tau and phase-2 contributions are generated locally with fresh
// randomness. That is fine for a demo; a production deployment should start from
// a public multi-party ceremony (e.g. the Hermez/Perpetual Powers of Tau files).
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as snarkjs from "snarkjs";

const root = path.resolve(import.meta.dirname, "..");
const build = path.join(root, "build");
fs.mkdirSync(build, { recursive: true });
const circom = path.join(root, "bin", process.platform === "win32" ? "circom.exe" : "circom");
const out = (f) => path.join(build, f);
const entropy = () => crypto.randomBytes(32).toString("hex");

console.log("compiling…");
execFileSync(circom, ["circuits/exam.circom", "--r1cs", "--wasm", "--sym", "-o", "build"], { cwd: root, stdio: "inherit" });

const info = await snarkjs.r1cs.info(out("exam.r1cs"));
const power = Math.max(10, Math.ceil(Math.log2(info.nConstraints + info.nPubInputs + info.nOutputs + 1)) + 1);
console.log(`constraints=${info.nConstraints} public=${info.nPubInputs} -> ptau power ${power}`);

await snarkjs.powersOfTau.newAccumulator(await curve(), power, out("pot_0.ptau"));
await snarkjs.powersOfTau.contribute(out("pot_0.ptau"), out("pot_1.ptau"), "zkproven-1", entropy());
await snarkjs.powersOfTau.preparePhase2(out("pot_1.ptau"), out("pot_final.ptau"));
await snarkjs.zKey.newZKey(out("exam.r1cs"), out("pot_final.ptau"), out("exam_0.zkey"));
await snarkjs.zKey.contribute(out("exam_0.zkey"), out("exam_final.zkey"), "zkproven-phase2", entropy());
const vk = await snarkjs.zKey.exportVerificationKey(out("exam_final.zkey"));
fs.writeFileSync(out("exam_vk.json"), JSON.stringify(vk, null, 2));
for (const f of ["pot_0.ptau", "pot_1.ptau", "exam_0.zkey"]) fs.rmSync(out(f));
fs.copyFileSync(path.join(build, "exam_js", "exam.wasm"), out("exam.wasm"));
console.log("done: build/exam.wasm, build/exam_final.zkey, build/exam_vk.json");
process.exit(0);

async function curve() {
  const { getCurveFromName } = await import("ffjavascript");
  return getCurveFromName("bn128");
}
