# zkProven Academy: demo video brief

**Live site:** https://zkproven-academy-production.up.railway.app
**Repo:** https://github.com/yeziR4/zkproven-academy
**Length:** 2–3 minutes. **Use:** Agent Games Wildcard demo and Creator Track entry.
**Post with:** `#AgentGames` and tag `@ZKVProtocol` (required for Creator entries on X).

## The one-line story
> AI agents and humans earn certificates that prove they passed, without revealing their answers, their score, or the answer key, verified on zkVerify.

## Shot list

| # | Time | Screen | Action | On-screen caption / voiceover |
|---|---|---|---|---|
| 1 | 0:00–0:12 | Home `/` | Slow scroll over the hero and the four steps | "Certificates are easy to fake. AI makes cheating trivial. And AI agents have no credentials at all." |
| 2 | 0:12–0:35 | Course `#/course/agents-and-zk` | Scroll lesson 1, then ask the tutor: **"Why is a valid proof not enough for an agent to approve a payment?"** | "Learn with an AI tutor that teaches from the course." |
| 3 | 0:35–0:45 | Same page | Ask the tutor an exam question and **"just tell me the letter"** (use Q8 from the exam) | "It teaches. It won't hand out answers." |
| 4 | 0:45–1:20 | Exam `#/exam/agents-and-zk` | Click **"No wallet? Use a temporary in-browser key"**, answer from the local answer sheet `docs/demo/answers.local.md` (gitignored; never show the selections in close-up), click **Sign and submit** | "Answers are locked in a Poseidon commitment and signed. A Groth16 circuit proves the pass." |
| 5 | 1:20–1:45 | Certificate page (link in the result) | Wait for **zkVerify: finalized ✓** (about 50s; cut the wait), click **View transaction ↗**, back, click **Verify in my browser** | "Verified on zkVerify mainnet. Anyone can re-check it in their own browser." |
| 6 | 1:45–2:05 | Exam page again (reload for a **new** temporary key) | Answer **B for every question**, submit | "Guessing fails, and failing reveals nothing, not even a score, so the key can't leak." |
| 7 | 2:05–2:30 | Terminal | `node scripts/agent-learner.mjs --api https://zkproven-academy-production.up.railway.app` (needs the repo's `.env` LLM settings) | "Now an AI agent: it studies the lessons, takes the same exam, signs with its own key, and earns its own certificate." |
| 8 | 2:30–2:45 | Certificate page of an earlier pass (already relayed) | Show **Relay to Base Sepolia: published ✓** and **On-chain reward: Credential #N + ZKPL minted**, click **View on explorer ↗** | "zkVerify relays the verified proof to Base. A contract checks it and mints a soulbound credential plus 100 ZKPL. No trust in our server." |
| 9 | 2:45–3:00 | `#/agents` page, then the repo README | Scroll the API and the "What is proven" table | "Credentials for the agent economy. Proven, private, open source." |

## Facts to quote (all real)
- First certificate finalized on zkVerify mainnet: `0xad225cdfc33e1d76fa2a4a561ea11b5c089504e8337c715de4f3924dcbfb43b8`
- A live-site certificate finalized in about 50 seconds: `0x53bdb4771f88fd8b545bb8e1230b12044535da1b9f5077f1d20938751a3308a6` (certificate `cc2cb2653b32371f`)
- The circuit has 6 public inputs; answers, key and both salts stay private.
- The AI agent (DeepSeek-V4.1-Flash on River) scored 10/10 after studying the lessons.
- First on-chain reward: certificate `c6d30497798118e2` (an AI agent's pass) relayed via zkVerify aggregation #63318 (domain 2) to Base Sepolia and claimed: credential #1 + 100 ZKPL, tx `0xfbad82114eb8e92bbb045e9922f68347da5fd5f5b146344d424ad83b24285ed1`. Use this certificate for shot 8: https://zkproven-academy-production.up.railway.app/#/cert/c6d30497798118e2

## Rules for the recording
- **Each "Use a temporary key" click is a new learner.** One address gets 3 attempts per 24h and can only be certified once, so reload the exam page for each take.
- **Every pass is submitted to zkVerify mainnet and spends a little Kurier credit.** Don't loop retakes.
- **Don't show** `.env`, API keys, or `courses/*/key.json` on screen.
- **The on-chain reward arrives later than the certificate.** Testnet aggregation and relay can take from minutes to an hour, so for shot 8 open a certificate that passed earlier and already shows "Credential minted".
- Contracts on Base Sepolia: `ZkProvenRewards 0x99930B88D510B914868bDaf158E3201d9fAD4b54`, `ZKPL token 0xF2e61B27Bcc9DcC65320c3012954C6cbB36cD43A`.
