// An AI agent that studies a course, takes the exam, and checks its certificate.
//
//   node scripts/agent-learner.mjs --recipient 0xYourAddress [--course agents-and-zk] [--api http://localhost:8090]
//   (answers with LLM_BASE_URL / LLM_API_KEY / LLM_MODEL, or pass --answers B,C,A,... to skip the model)
import { parseArgs } from "node:util";
import { answersCommitment, randomField } from "../src/exam.js";
import { makeLlm } from "../src/llm.js";

const { values: args } = parseArgs({
  options: {
    api: { type: "string", default: process.env.ACADEMY_API ?? "http://localhost:8090" },
    course: { type: "string", default: "agents-and-zk" },
    recipient: { type: "string" },
    answers: { type: "string" },
  },
});
if (!args.recipient) throw new Error("--recipient 0x... is required (the certificate is bound to it)");

const api = async (method, route, body) => {
  const res = await fetch(args.api + route, { method, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`${route}: ${res.status} ${data.error}`);
  return data;
};
const LETTERS = "ABCDEFGH";

// 1. Study
const course = await api("GET", `/api/courses/${args.course}`);
console.log(`studying "${course.title}" (${course.lessons.length} lessons, pass mark ${course.passMark}/10)`);

// 2. Start an attempt (questions only; the key never leaves the grader)
const attempt = await api("POST", "/api/attempts", { course: args.course, recipient: args.recipient });

// 3. Answer
let answers;
if (args.answers) {
  answers = args.answers.split(",").map((s) => LETTERS.indexOf(s.trim().toUpperCase()));
} else {
  const llm = makeLlm();
  if (!llm) throw new Error("set LLM_BASE_URL and LLM_MODEL (and LLM_API_KEY), or pass --answers");
  const lessons = course.lessons.map((l) => `## ${l.title}\n${l.body}\nKey points: ${l.keyPoints.join("; ")}`).join("\n\n");
  const exam = attempt.questions.map((q) => `Q${q.id}. ${q.prompt}\n${q.options.map((o, i) => `${LETTERS[i]}) ${o}`).join("\n")}`).join("\n\n");
  const reply = await llm(
    [
      { role: "system", content: "You are an AI agent taking an exam. Study the course material, then answer every question. Reply with JSON only: {\"answers\": [\"A\"|\"B\"|\"C\"|\"D\", ...]} in question order." },
      { role: "user", content: `COURSE MATERIAL\n\n${lessons}\n\nEXAM\n\n${exam}` },
    ],
    { json: true },
  );
  const parsed = JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
  answers = (parsed.answers ?? []).map((a) => LETTERS.indexOf(String(a).trim().toUpperCase()[0]));
}
if (answers.length !== attempt.questions.length || answers.some((a) => a < 0)) throw new Error(`could not form ${attempt.questions.length} answers`);
console.log(`answers: ${answers.map((a) => LETTERS[a]).join(" ")}`);

// 4. Commit + submit. The salt is our receipt: we can prove later which answers were graded.
const answersSalt = randomField();
const myCommitment = answersCommitment(BigInt(attempt.attemptId), answers, answersSalt).toString();
const result = await api("POST", `/api/attempts/${attempt.attemptId}/submit`, { answers, answersSalt: answersSalt.toString() });
if (result.answersCommitment !== myCommitment) throw new Error("grader's answer commitment differs from ours — it graded something else");
console.log(`answers commitment matches our receipt: ${myCommitment.slice(0, 16)}…`);

if (!result.passed) {
  console.log("result: not passed (scores are never revealed, to protect the answer key)");
  process.exit(1);
}

// 5. Independently verify the certificate
const cert = result.certificate;
const check = await api("POST", "/api/verify", { proof: cert.proof, publicSignals: cert.publicSignals });
console.log(`PASSED — certificate ${cert.id} for ${check.recipient}`);
console.log(`verification: ${check.valid ? "valid" : "INVALID"} ${JSON.stringify(check.checks)}`);
console.log(`zkVerify: ${cert.zkverify.status}`);
process.exit(check.valid ? 0 : 1);
