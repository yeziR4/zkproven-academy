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
import { makeRelayer } from "./relayer.js";

const root = path.resolve(import.meta.dirname, "..");
const config = {
  port: Number(process.env.PORT ?? 8090),
  dataDir: process.env.DATA_DIR ?? path.join(root, "data"),
  coursesDir: process.env.COURSES_DIR ?? path.join(root, "courses"),
  kurierApiKey: process.env.KURIER_API_KEY ?? "",
  kurierApiUrl: process.env.KURIER_API_URL ?? "https://api-testnet.kurier.xyz/api/v1",
  // Optional on-chain rewards: a second zkVerify submission (usually testnet) relayed to this EVM chain.
  rewardKurierApiKey: process.env.KURIER_TESTNET_API_KEY ?? "",
  rewardKurierApiUrl: process.env.KURIER_TESTNET_API_URL ?? "https://api-testnet.kurier.xyz/api/v1",
  aggregationChainId: process.env.ZKVERIFY_CHAIN_ID ?? "",
  // Fallback when Kurier's job status does not carry the aggregation domain.
  domainId: process.env.ZKVERIFY_DOMAIN_ID ?? null,
  rewardsAddress: process.env.REWARDS_ADDRESS ?? "",
  relayerKey: process.env.RELAYER_PRIVATE_KEY ?? "",
  rewardRpcUrl: process.env.REWARD_RPC_URL ?? "",
};

const store = new Store(config.dataDir);
const courses = loadCourses(config.coursesDir);
const prover = new ExamProver();
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const vk = JSON.parse(fs.readFileSync(path.join(root, "build", "exam_vk.json"), "utf8"));
const kurier = makeKurier({ apiKey: config.kurierApiKey, apiUrl: config.kurierApiUrl, vk, cache: store.collection("kurier"), log });
if (!kurier) log("KURIER_API_KEY not set: certificates are proven locally but not submitted to zkVerify");
const rewardKurier = config.aggregationChainId
  ? makeKurier({ apiKey: config.rewardKurierApiKey, apiUrl: config.rewardKurierApiUrl, vk, chainId: config.aggregationChainId, cache: store.collection("kurier-reward"), log })
  : null;

for (const c of courses.values()) log(`course ${c.slug}: keyCommitment ${c.keyCommitment}`);

const llm = makeLlm();
if (!llm) log("LLM_BASE_URL / LLM_MODEL not set: the tutor will be unavailable");

const relayer = rewardKurier
  ? makeRelayer({ privateKey: config.relayerKey, rpcUrl: config.rewardRpcUrl, rewardsAddress: config.rewardsAddress, chainId: config.aggregationChainId, zkVerifyAddress: process.env.ZKVERIFY_AGGREGATION })
  : null;
if (relayer) log(`rewards: ${relayer.rewardsAddress} on ${relayer.chain.name}, relayer ${relayer.address}`);
else log("rewards disabled (set ZKVERIFY_CHAIN_ID, KURIER_TESTNET_API_KEY, REWARDS_ADDRESS, RELAYER_PRIVATE_KEY)");

const api = createApi({ courses, prover, store, kurier, rewardKurier, llm, relayer, limits: { domainId: config.domainId }, log });
api.resume();
const web = serveStatic(path.join(root, "public"));
http
  .createServer((req, res) => (req.url.startsWith("/api/") ? api(req, res) : web(req, res)))
  .listen(config.port, () => log(`zkProven Academy API on :${config.port}`));
