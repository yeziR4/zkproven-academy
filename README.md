# zkProven Academy

**Learn it. Prove it. Reveal nothing.**

An academy where **humans and AI agents** study a course, pass an exam, and receive a certificate that anyone can verify on **zkVerify**, without revealing the answers, the score, or the answer key. A passing certificate can then be claimed on-chain for a **soulbound credential** and a **token reward**.

Built for the zkVerify Agent Games (Wildcard).

## Why
- Certificates are easy to fake, and AI makes cheating on courses trivial.
- The usual fixes (publish answers, record everything) leak the test and destroy its reuse.
- AI agents have no credentials at all. Before trusting an agent with money or data, you should be able to check what it has actually been tested on.

## How it works
1. **Learn:** five lessons plus an AI tutor (any OpenAI-compatible provider) that teaches the concepts but won't hand over exam letters.
2. **Commit:** the learner's answers are hashed into `Poseidon(attemptId, answers, salt)` and **signed with the learner's own key** (a wallet for humans, a private key for agents), so nobody can sit an exam for someone else's address.
3. **Prove:** a Groth16 circuit ([`circuits/exam.circom`](circuits/exam.circom)) proves that:
   - the answer key matches the commitment published **before** any attempt,
   - the graded answers are the ones the learner committed and signed,
   - the score is at least the pass mark,

   and binds the certificate to the learner's address and the attempt.
4. **Verify:** the proof is submitted to zkVerify through Kurier and tracked to `Finalized`. Anyone can re-verify any certificate **in their browser** with snarkjs.
5. **Reward:** zkVerify aggregates the proof and relays it to Base Sepolia. [`ZkProvenRewards`](contracts/src/ZkProvenRewards.sol) rebuilds the zkVerify leaf from the certificate's public signals and mints a soulbound credential (ZKPC) plus 100 ZKPL to the address inside the proof.

## What is proven, and what isn't
| Claim | Proven? |
|---|---|
| Committed answers met the pass mark | ✅ |
| The answer key is the one published before the exam | ✅ |
| The graded answers are the ones the learner signed | ✅ |
| The certificate belongs to this learner and attempt (no replay or theft) | ✅ |
| The on-chain reward only follows a zkVerify-verified pass | ✅ |
| The tutor taught well | ❌ not provable today |
| Free-text answers | ❌ out of scope for v1 |

**Remaining trust:** the grader sees answers in order to grade them. The proof stops it from swapping keys, inventing scores, or passing anyone whose committed answers fail. Failed attempts reveal only "not passed", never a score, and attempts are rate-limited, so pass/fail can't be used as an oracle to recover the key.

## On-chain record
- Exam verification key on zkVerify mainnet: `vkHash 0x8af695657075b7546405f8afd2d72986f8c3d97143aa9d0127e1c674494b679f`
- First certificate finalized on zkVerify mainnet: `0xad225cdfc33e1d76fa2a4a561ea11b5c089504e8337c715de4f3924dcbfb43b8`

## For AI agents
```bash
node scripts/agent-learner.mjs --api https://<academy-url> --course agents-and-zk
```
The reference agent reads the lessons, answers with an LLM, signs its submission, checks that the grader graded exactly its answers, and verifies its certificate. The API and the signed message format are on the site's **For agents** page.

## Run locally
```bash
npm ci
cp .env.example .env        # Kurier key, LLM provider, optional reward settings
npm test                    # circuit, API, signatures, leaf vector
npm start                   # http://localhost:8090
cd contracts && forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 foundry-rs/forge-std && forge test
```
Answer keys live in `courses/<slug>/key.json`, which is gitignored; only their commitments are published. The demo trusted setup was generated locally (`scripts/build-circuit.mjs`). A production deployment should start from a public multi-party ceremony.

## Layout
| Path | What |
|---|---|
| `circuits/exam.circom` | The exam circuit |
| `src/` | Grader API, prover, zkVerify (Kurier) client, tutor, signatures, relayer |
| `public/` | Web app: course + tutor, exam, certificate, verify, agent docs |
| `contracts/` | `ZkProvenRewards` (soulbound credential + ZKPL), Foundry tests, deploy script |
| `scripts/` | Circuit build, reference agent learner, local reward rehearsal |
