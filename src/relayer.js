import { createPublicClient, createWalletClient, http, parseAbi, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const ABI = parseAbi([
  "function claim(uint256[6] pubs, uint256 domainId, uint256 aggregationId, bytes32[] merklePath, uint256 leafCount, uint256 index) returns (uint256)",
  "function credentialOf(uint256 courseId, address holder) view returns (uint256)",
  "function statementHash(uint256[6] pubs) view returns (bytes32)",
  "event Certified(uint256 indexed courseId, address indexed holder, uint256 indexed tokenId, uint256 aggregationId, uint256 reward)",
]);

const CHAINS = { 84532: baseSepolia };

/**
 * Submits reward claims on the learner's behalf, so learners never need gas.
 * The contract pays the proof's recipient regardless of who submits.
 */
export function makeRelayer({ privateKey, rpcUrl, rewardsAddress, chainId }) {
  if (!privateKey || !rewardsAddress) return null;
  const chain = CHAINS[Number(chainId)];
  if (!chain) throw new Error(`unsupported reward chain ${chainId}`);
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl || undefined);
  const pub = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ chain, transport, account });

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

  return { claim, address: account.address, chain, rewardsAddress };
}
