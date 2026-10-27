import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { ExamProver } from "./exam.js";
import { loadCourses } from "./courses.js";
import { Store } from "./store.js";
import { makeKurier } from "./kurier.js";
import { createApi } from "./api.js";
import { makeLlm } from "./llm.js";
import { serveStatic } from "./static.js";

const root = path.resolve(import.meta.dirname, "..");
const config = {
  port: Number(process.env.PORT ?? 8090),
  dataDir: process.env.DATA_DIR ?? path.join(root, "data"),
  coursesDir: process.env.COURSES_DIR ?? path.join(root, "courses"),
  kurierApiKey: process.env.KURIER_API_KEY ?? "",
  kurierApiUrl: process.env.KURIER_API_URL ?? "https://api-testnet.kurier.xyz/api/v1",
  // Optional: relay verified certificates to this EVM chain (e.g. 11155111 Sepolia) for on-chain rewards.
  aggregationChainId: process.env.ZKVERIFY_CHAIN_ID ?? "",
};

const store = new Store(config.dataDir);
const courses = loadCourses(config.coursesDir);
const prover = new ExamProver();
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const kurier = makeKurier({
  apiKey: config.kurierApiKey,
  apiUrl: config.kurierApiUrl,
  vk: JSON.parse(fs.readFileSync(path.join(root, "build", "exam_vk.json"), "utf8")),
  chainId: config.aggregationChainId,
  cache: store.collection("kurier"),
  log,
});
if (kurier) kurier.waitForAggregation = Boolean(config.aggregationChainId);
else log("KURIER_API_KEY not set: certificates are proven locally but not submitted to zkVerify");

for (const c of courses.values()) log(`course ${c.slug}: keyCommitment ${c.keyCommitment}`);

const llm = makeLlm();
if (!llm) log("LLM_BASE_URL / LLM_MODEL not set: the tutor will be unavailable");

const api = createApi({ courses, prover, store, kurier, llm, log });
const web = serveStatic(path.join(root, "public"));
http
  .createServer((req, res) => (req.url.startsWith("/api/") ? api(req, res) : web(req, res)))
  .listen(config.port, () => log(`zkProven Academy API on :${config.port}`));
