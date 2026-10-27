import test from "node:test";
import assert from "node:assert/strict";
import { groth16Leaf } from "../src/leaf.js";

// The same vector is asserted in contracts/test/ZkProvenRewards.t.sol, so the
// grader and the contract agree on the zkVerify leaf for a certificate.
test("groth16 leaf matches the Solidity statementHash vector", () => {
  const leaf = groth16Leaf("0x8af695657075b7546405f8afd2d72986f8c3d97143aa9d0127e1c674494b679f", [
    "1",
    "18360246782440852246325871050199419319593607117014465374689068033622809689613",
    "123456789",
    "7",
    "987654321",
    "1096126254017519566419577023049838005413224891683",
  ]);
  assert.equal(leaf, "0xccd38dbf8f357006e8035e193488e27a74e5f05bc175e20b1c6797d538e39444");
});
