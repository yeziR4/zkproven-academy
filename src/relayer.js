import { createPublicClient, createWalletClient, http, parseAbi, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const ABI = parseAbi([
  "function claim(uint256[6] pubs, uint256 domainId, uint256 aggregationId, bytes32[] merklePath, uint256 leafCount, uint256 index) returns (uint256)",
  "function credentialOf(uint256 courseId, address holder) view returns (uint256)",
  "function statementHash(uint256[6] pubs) view returns (bytes32)",
  "event Certified(uint256 indexed courseId, address indexed holder, uint256 indexed tokenId, uint256 aggregationId, uint256 reward)",
]);

const ZKV_ABI = parseAbi(["function proofsAggregations(uint256 domainId, uint256 aggregationId) view returns (bytes32)"]);
const ZERO = "0x" + "0".repeat(64);

const CHAINS = { 84532: baseSepolia };
// zkVerify aggregation proxy per chain (overridable with ZKVERIFY_AGGREGATION).
const ZKVERIFY = { 84532: "0x0807C544D38aE7729f8798388d89Be6502A1e8A8" };

/**
 * Submits reward claims on the learner's behalf, so learners never need gas.
 * The contract pays the proof's recipient regardless of who submits.
 */
export function makeRelayer({ privateKey, rpcUrl, rewardsAddress, chainId, zkVerifyAddress }) {
  if (!privateKey || !rewardsAddress) return null;
  const chain = CHAINS[Number(chainId)];
  if (!chain) throw new Error(`unsupported reward chain ${chainId}`);
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl || undefined);
  const pub = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ chain, transport, account });
  const zkv = zkVerifyAddress || ZKVERIFY[chain.id];

  /** The aggregation root zkVerify has published on this chain, or null if not yet. */
  async function publishedRoot(domainId, aggregationId) {
    const root = await pub.readContract({ address: zkv, abi: ZKV_ABI, functionName: "proofsAggregations", args: [BigInt(domainId), BigInt(aggregationId)] });
    return root === ZERO ? null : root;
  }

  /** Kurier's job status omits the domain; find the one whose published root is our receipt. */
  async function findDomain(aggregationId, receipt, candidates = 16) {
    for (let d = 0; d < candidates; d++) {
      const root = await publishedRoot(d, aggregationId);
      if (root && root.toLowerCase() === receipt?.toLowerCase()) return d;
    }
    return null;
  }

  async function claim({ publicSignals, aggregation }) {
    const args = [
      publicSignals.map(BigInt),
      BigInt(aggregation.domainId),
      BigInt(aggregation.aggregationId),
      aggregation.merkleProof,
      BigInt(aggregation.numberOfLeaves),
      BigInt(aggregation.leafIndex),
    ];
    // Simulate first: a revert (already certified, not yet published, ...) costs no gas.
    const { request } = await pub.simulateContract({ address: rewardsAddress, abi: ABI, functionName: "claim", args, account });
    const hash = await wallet.writeContract(request);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    let tokenId = null;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics });
        if (ev.eventName === "Certified") tokenId = ev.args.tokenId.toString();
      } catch {}
    }
    return { txHash: hash, tokenId, status: receipt.status, explorer: `${chain.blockExplorers.default.url}/tx/${hash}` };
  }

  return { claim, publishedRoot, findDomain, address: account.address, chain, rewardsAddress };
}
