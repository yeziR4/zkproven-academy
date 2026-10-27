// Local rehearsal of the reward claim against anvil (chain id 84532):
// real certificate + real rewards contract + the relayer code, with a stand-in
// aggregation contract where we publish the certificate's leaf ourselves.
//   anvil --chain-id 84532   (then)   node scripts/rehearse-reward.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
import { ExamProver, randomField } from "../src/exam.js";
import { loadCourses } from "../src/courses.js";
import { groth16Leaf } from "../src/leaf.js";
import { makeRelayer } from "../src/relayer.js";

const RPC = "http://127.0.0.1:8545";
const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // anvil's public dev account #0
const VK_HASH = "0x8af695657075b7546405f8afd2d72986f8c3d97143aa9d0127e1c674494b679f";
const root = path.resolve(import.meta.dirname, "..");
const contracts = path.join(root, "contracts");

const create = (target, args = []) => {
  const out = execFileSync("forge", ["create", target, "--rpc-url", RPC, "--private-key", ANVIL_KEY, "--broadcast", ...(args.length ? ["--constructor-args", ...args] : [])], { cwd: contracts, encoding: "utf8" });
  return out.match(/Deployed to: (0x[0-9a-fA-F]{40})/)[1];
};
const cast = (...args) => execFileSync("cast", [...args, "--rpc-url", RPC, "--private-key", ANVIL_KEY], { encoding: "utf8" });

const course = loadCourses(path.join(root, "courses")).get("agents-and-zk");
const agg = create("test/ZkProvenRewards.t.sol:MockAggregation");
const rewards = create("src/ZkProvenRewards.sol:ZkProvenRewards", [agg, VK_HASH]);
cast("send", rewards, "setCourse(uint256,uint256,uint256,uint256,bool,string)", "1", course.keyCommitment, "7", "100000000000000000000", "true", course.title);
console.log(`rewards ${rewards} (mock aggregation ${agg})`);

// A real certificate for a fresh learner.
const learner = "0x" + "be".repeat(20);
const { publicSignals } = await new ExamProver().provePass({
  courseId: course.id, key: course.secret.key, keySalt: course.secret.keySalt, passMark: course.passMark,
  attemptId: randomField(), answers: course.secret.key, answersSalt: randomField(), recipient: learner,
});
const leaf = groth16Leaf(VK_HASH, publicSignals);
cast("send", agg, "publish(uint256,uint256,bytes32)", "2", "77", leaf);
console.log(`certificate for ${learner}, leaf ${leaf} published`);

const relayer = makeRelayer({ privateKey: ANVIL_KEY, rpcUrl: RPC, rewardsAddress: rewards, chainId: 84532 });
const r = await relayer.claim({ publicSignals, aggregation: { domainId: 2, aggregationId: 77, merkleProof: [], numberOfLeaves: 1, leafIndex: 0 } });
console.log(`claim tx ${r.txHash} status=${r.status} credential #${r.tokenId}`);

const pub = createPublicClient({ chain: { ...baseSepolia, rpcUrls: { default: { http: [RPC] } } }, transport: http(RPC) });
const abi = parseAbi(["function ownerOf(uint256) view returns (address)", "function token() view returns (address)", "function balanceOf(address) view returns (uint256)"]);
const owner = await pub.readContract({ address: rewards, abi, functionName: "ownerOf", args: [BigInt(r.tokenId)] });
const token = await pub.readContract({ address: rewards, abi, functionName: "token" });
const bal = await pub.readContract({ address: token, abi, functionName: "balanceOf", args: [learner] });
console.log(`credential owner ${owner}, ZKPL balance ${bal / 10n ** 18n}`);

try {
  await relayer.claim({ publicSignals, aggregation: { domainId: 2, aggregationId: 77, merkleProof: [], numberOfLeaves: 1, leafIndex: 0 } });
  console.log("UNEXPECTED: second claim succeeded");
} catch (e) {
  console.log(`second claim rejected: ${e.shortMessage?.split("\n")[0] ?? e.message}`);
}
fs.rmSync(path.join(contracts, "broadcast"), { recursive: true, force: true });
process.exit(0);
