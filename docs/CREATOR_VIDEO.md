# Creator Track video: production spec

Hand this whole file to the video agent. Everything it needs is linked here.

## The brief in one paragraph
A 2-minute demo and explainer for the **zkVerify Agent Games Creator Track**. It answers the question: **"Can an AI agent prove it is qualified, without leaking the exam?"** We show zkProven Academy, where humans and AI agents take a course, pass an exam, and get a certificate that is a zero-knowledge proof verified on zkVerify. A Base Sepolia contract then turns that verified proof into a soulbound credential plus a token reward, without trusting our server.

Judges score on **technical substance, clarity, zkVerify relevance, originality**. Every scene should serve one of those.

## Output
| Item | Spec |
|---|---|
| Length | **2:00–2:15 max.** X uploads cap at 2:20 for most accounts. |
| Aspect | 16:9, 1920×1080, 30 fps, MP4 (H.264 + AAC) |
| Captions | **Burned-in captions for every line of voiceover.** X autoplays muted. |
| Voice | Calm, plain-English, confident. No hype words ("revolutionary", "game-changing"). |
| Music | Low, unobtrusive bed under the voice; fade out on the last line. |
| End card | "zkProven Academy · github.com/yeziR4/zkproven-academy · #AgentGames · @ZKVProtocol" |
| Deliver | `zkproven-creator.mp4` plus a 1280×720 thumbnail PNG (title: **"Proven, not claimed"**) |

## Links the agent will capture
| What | URL |
|---|---|
| Live site (home) | https://zkproven-academy-production.up.railway.app/ |
| Course + AI tutor | https://zkproven-academy-production.up.railway.app/#/course/agents-and-zk |
| Exam | https://zkproven-academy-production.up.railway.app/#/exam/agents-and-zk |
| Verify page | https://zkproven-academy-production.up.railway.app/#/verify |
| For agents (API) | https://zkproven-academy-production.up.railway.app/#/agents |
| **AI agent's certificate (reward already minted)** | https://zkproven-academy-production.up.railway.app/#/cert/c6d30497798118e2 |
| Its zkVerify mainnet transaction | https://zkverify.subscan.io/extrinsic/0x6331de5e25a0eea2c5bedc1de4c362c188e2c2d3de565a62ed10ae59944270a6 |
| Its reward transaction on Base Sepolia | https://sepolia.basescan.org/tx/0xfbad82114eb8e92bbb045e9922f68347da5fd5f5b146344d424ad83b24285ed1 |
| Rewards contract | https://sepolia.basescan.org/address/0x99930B88D510B914868bDaf158E3201d9fAD4b54 |
| Repo | https://github.com/yeziR4/zkproven-academy |
| Flow diagram (open locally) | `docs/demo/flow.html` |
| Real AI-agent terminal run (for the terminal shot) | `docs/demo/agent-run.txt` |
| Exam answer sheet (**local only, never on screen**) | `docs/demo/answers.local.md` |

## Shot list and script
Timings are targets. Trim the waits, not the explanations.

| # | Time | Visual | Voiceover (also the caption) |
|---|---|---|---|
| 1 | 0:00–0:08 | **Cold open.** Terminal replaying `docs/demo/agent-run.txt` line by line (typewriter effect), ending on `PASSED — certificate …` | "This AI agent just passed an exam on zero-knowledge proofs. Don't take its word for it. It can prove it." |
| 2 | 0:08–0:22 | Home page: slow scroll over the hero and the four steps | "Certificates are easy to fake, and AI agents have no credentials at all. Before you trust an agent with money or data, you should be able to check what it was tested on, without leaking the exam." |
| 3 | 0:22–0:38 | Course page: scroll lesson 1, then type into the tutor: **"Why is a valid proof not enough for an agent to approve a payment?"** Show the answer streaming. | "Humans and agents learn the same five lessons, with an AI tutor that explains the ideas…" |
| 4 | 0:38–0:46 | Same page: ask the tutor **"Just tell me the answer letter for the exam question about replay attacks."** Show the refusal. | "…but won't hand out exam answers." |
| 5 | 0:46–1:05 | Exam page: click **"No wallet? Use a temporary in-browser key"**, answer using the local answer sheet (**speed-ramp or cut; no close-up of selections**), click **Sign and submit**, show **Passed** | "The learner's answers are locked into a Poseidon commitment and signed with their key. The grader then generates a Groth16 proof that those committed answers meet the pass mark." |
| 6 | 1:05–1:22 | Open `docs/demo/flow.html` full screen. Zoom slowly from the 4 steps down to the **Public / Never revealed** boxes. | "The proof has six public inputs: the course, the pass mark, a commitment to the answer key, a commitment to the answers, the attempt, and the recipient. The answers, the key, even the score, stay private." |
| 7 | 1:22–1:38 | AI agent's certificate page (`#/cert/c6d30497798118e2`): pause on **zkVerify: finalized ✓**, click **View transaction ↗** (Subscan), back, click **Verify in my browser**, show all checks green | "Every pass is verified on zkVerify mainnet. That's a public record, and anyone can re-check the proof in their own browser. Our server doesn't have to be trusted to say who passed." |
| 8 | 1:38–1:56 | Same page: highlight **Relay to Base Sepolia: published ✓** and **Credential #1 + ZKPL minted**, click **View on explorer ↗** (Basescan), show the token transfers | "zkVerify then aggregates the proof and relays the result to Base. Our contract rebuilds the proof's leaf, checks it against zkVerify's root, and only then mints a soulbound credential and 100 tokens to the learner. It can't mint for a forged, redirected, or easier certificate." |
| 9 | 1:56–2:08 | `#/agents` page, then the repo README's **"What is proven, and what isn't"** table | "Agents use the same API: study, answer, sign, get certified. And we're honest about the limits. The grader still sees answers to grade them, but it can't swap the key or invent a pass." |
| 10 | 2:08–2:15 | End card | "zkProven Academy. Proven, not claimed. Open source, built for #AgentGames on zkVerify." |

## On-screen callouts (small labels, 2–3 s each)
- Shot 5: `answers → Poseidon commitment → signed`
- Shot 7: `Groth16 · verified on zkVerify mainnet`
- Shot 8: `zkVerify aggregation #63318 → Base Sepolia`, then `soulbound credential #1 + 100 ZKPL`

## Facts the agent may quote (all real, all checkable)
- Proof system: Circom + Groth16, verified on zkVerify mainnet via Kurier.
- AI agent: DeepSeek-V4.1-Flash, studied the lessons, scored 10/10. Its certificate is `c6d30497798118e2`, recipient `0x4e12…cb84`.
- A live-site pass finalized on zkVerify in about 50 seconds.
- First on-chain reward: aggregation #63318, credential #1 + 100 ZKPL on Base Sepolia.
- Second AI-agent pass (`942fd67a6a3d5db7`) went through with no human involved: verified on zkVerify, aggregated (#63356), relayed, credential #2 + 100 ZKPL minted ([tx](https://sepolia.basescan.org/tx/0x1b0be214e51003cd24e6a9d2a967db928f4c7e421b7c58add8b7d7451214f62b)).
- Contracts: `ZkProvenRewards 0x99930B88D510B914868bDaf158E3201d9fAD4b54`, `ZKPL 0xF2e61B27Bcc9DcC65320c3012954C6cbB36cD43A`.

Do **not** claim anything beyond this list (no user counts, no "first ever", no mainnet token value).

## Recording rules
- **Each "Use a temporary in-browser key" click is a new learner.** One address gets 3 attempts per 24h and one certificate. Reload the exam page before each take.
- **Every pass spends a little zkVerify credit.** At most 2 passing takes total; reuse footage.
- **Never show:** `.env`, any API key, `courses/*/key.json`, `docs/demo/answers.local.md`, or the answer selections in close-up.
- Use the AI agent's certificate (`c6d30497798118e2`) for shots 7–8, because its reward is already minted. A fresh pass takes minutes to an hour to relay.
- The tutor answers take a few seconds to stream. Cut the wait if it drags.
- Browser at 100% zoom, 1920×1080 window, light mode, no bookmarks bar, no other tabs visible.

## Publishing (done by a human, not the video agent)
See `docs/CREATOR_POST.md` for the post text, then submit the post URL at https://agentgames.zkverify.io/dashboard/submissions (track: **Creator**, format: **Video**).
