# zkProven Academy — spec

**One line:** an academy where humans *and* AI agents learn, pass exams, and receive certificates anyone can verify on zkVerify — without the answers or the answer key ever being revealed.

Agent Games · Wildcard entry · deadline 19 Nov 2026

## Problem
- Certificates are easy to fake, and AI makes cheating on courses trivial.
- The usual fixes (publish answers, record everything) leak the test and destroy its reuse.
- AI agents have no credentials at all: nothing shows an agent was trained and tested on a skill before it is trusted with one.

## Users
- **Learners (human or agent):** learn with an AI tutor, take the exam, get a verifiable certificate and a reward.
- **Verifiers (employers, platforms, arenas):** check a certificate in one click; see the course, pass mark and date, never the answers.
- **Course creators:** reuse exams indefinitely because the key never leaks.

## Flow
1. **Learn** — AI tutor (any OpenAI-compatible provider) teaches the course and answers questions.
2. **Exam** — humans in the web app; agents over a JSON API. Each attempt gets a fresh `attemptId`.
3. **Commit answers** — the learner's answers are bound to `answersCommitment = Poseidon(answers, answersSalt)`; the learner keeps the salt as a receipt.
4. **Grade + prove** — the grader runs the `exam` circuit:
   - private: `answers[N]`, `key[N]`, `keySalt`, `answersSalt`
   - public: `courseId`, `keyCommitment`, `answersCommitment`, `passMark`, `attemptId`, `recipient`
   - asserts: key matches its published commitment, answers match the learner's commitment, `score >= passMark`
5. **Verify** — proof submitted to zkVerify (Kurier); the finalized verification is the certificate.
6. **Reward** — on an EVM testnet, a contract checks the zkVerify attestation and (a) mints a non-transferable credential to `recipient`, (b) pays a token reward, once per `(courseId, recipient)`.

## What is proven — and what is not
| Claim | Proven? |
|---|---|
| Score on objective questions meets the pass mark | Yes |
| The answer key used is the one published before the exam | Yes (`keyCommitment`) |
| The graded answers are the ones the learner submitted | Yes (`answersCommitment`) |
| The certificate is bound to this learner and attempt (no replay/front-running) | Yes (`recipient`, `attemptId`) |
| The AI tutor taught well | No — stated plainly |
| Free-text answers graded by an LLM | No — out of v1 |

Trust that remains: the issuer still sees answers in order to grade them; the proof stops it from swapping keys, inventing scores, or passing anyone whose committed answers fail.

## First course — "What agents can do with ZK"
1. A proof is not a permission (verify *what* was proven, not just *that* it verifies)
2. Commitments: binding now, revealing never (or later)
3. Committed policies: proving an agent followed its own rules
4. Verifying on zkVerify: proof systems, vk registration, finality
5. Private credentials: proving a fact without the data

10 multiple-choice / scenario questions, pass mark 7.

## Demo (~3 min)
Human passes → agent passes via API → both certificates verified on zkVerify → tampered score and swapped key both fail → credential + token land on-chain.

## On-chain reward (Base Sepolia)
1. The grader submits the certificate proof to Kurier with `chainId 84532`.
2. zkVerify verifies it, aggregates it, and publishes the aggregation root to its contract on Base Sepolia (`0x0807C544…e8A8`).
3. The grader checks Kurier's leaf equals the leaf it computes itself (`src/leaf.js`), then a relayer calls `ZkProvenRewards.claim(...)` so learners never need gas.
4. `claim` rebuilds the zkVerify leaf from the six public signals and checks it against zkVerify's contract, then requires the course's registered key commitment and pass mark, one claim per attempt and per learner. It mints a **soulbound credential (ZKPC)** and **100 ZKPL** to the recipient inside the proof — whoever submits.

The academy server is not trusted on-chain: it cannot mint for an unverified, redirected, or easier-pass-mark certificate (see `contracts/test`).

## On-chain record
- Exam verification key registered on zkVerify mainnet (Kurier): `vkHash 0x8af695657075b7546405f8afd2d72986f8c3d97143aa9d0127e1c674494b679f`
- First certificate finalized on zkVerify mainnet: tx `0xad225cdfc33e1d76fa2a4a561ea11b5c089504e8337c715de4f3924dcbfb43b8` (27 Oct 2026)

## Plan
| Week | Deliverable |
|---|---|
| 1 | Exam circuit, setup, tests; grader API; agent exam client; zkVerify submission |
| 2 | Web app: tutor chat, exam, certificate page, public verifier |
| 3 | Reward contract (credential + token), cheating demo, write-up, video |
