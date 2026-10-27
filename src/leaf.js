import { keccak_256 } from "@noble/hashes/sha3";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

/**
 * zkVerify statement hash (aggregation leaf) for a Groth16 proof, matching the
 * ZkVerifyGroth16 reference contract and ZkProvenRewards.statementHash:
 *   keccak256(keccak256("groth16") ‖ vkHash ‖ sha256("") ‖ keccak256(LE32(pub_0) ‖ … ‖ LE32(pub_n)))
 */
export function groth16Leaf(vkHash, publicSignals) {
  const le = publicSignals.map((s) => hexToBytes(BigInt(s).toString(16).padStart(64, "0")).reverse());
  const pubsHash = keccak_256(concat(le));
  const leaf = keccak_256(concat([keccak_256(utf8ToBytes("groth16")), hexToBytes(vkHash.replace(/^0x/, "")), sha256(new Uint8Array()), pubsHash]));
  return "0x" + bytesToHex(leaf);
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
