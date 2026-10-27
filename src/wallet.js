import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

/**
 * The exact text a learner signs to submit an exam. Binding the answers
 * commitment means the signature also confirms which answers get graded.
 */
export function submissionMessage({ course, attemptId, answersCommitment, recipient }) {
  return [
    "zkProven Academy exam submission",
    `Course: ${course}`,
    `Attempt: ${attemptId}`,
    `Answers commitment: ${answersCommitment}`,
    `Recipient: ${recipient.toLowerCase()}`,
  ].join("\n");
}

function personalHash(message) {
  const body = utf8ToBytes(message);
  const prefix = utf8ToBytes(`\x19Ethereum Signed Message:\n${body.length}`);
  return keccak_256(new Uint8Array([...prefix, ...body]));
}

export function addressOfPublicKey(pub) {
  const uncompressed = pub.length === 65 ? pub : secp256k1.ProjectivePoint.fromHex(pub).toRawBytes(false);
  return "0x" + bytesToHex(keccak_256(uncompressed.slice(1)).slice(-20));
}

/** EIP-191 personal_sign recovery; returns the lowercase signer address or null. */
export function recoverSigner(message, signature) {
  try {
    const sig = hexToBytes(signature.replace(/^0x/, ""));
    if (sig.length !== 65) return null;
    let v = sig[64];
    if (v >= 27) v -= 27;
    const pub = secp256k1.Signature.fromCompact(sig.slice(0, 64)).addRecoveryBit(v).recoverPublicKey(personalHash(message));
    return addressOfPublicKey(pub.toRawBytes(false));
  } catch {
    return null;
  }
}

/** For agents and tests: sign like a wallet's personal_sign. */
export function signMessage(privateKeyHex, message) {
  const sig = secp256k1.sign(personalHash(message), privateKeyHex.replace(/^0x/, ""));
  return "0x" + sig.toCompactHex() + (27 + sig.recovery).toString(16);
}

export function newAgentKey() {
  const priv = secp256k1.utils.randomPrivateKey();
  return { privateKey: "0x" + bytesToHex(priv), address: addressOfPublicKey(secp256k1.getPublicKey(priv, false)) };
}
