# Creator Track: post copy

Required in every entry: **#AgentGames**. On X, also tag **@ZKVProtocol**.

## Main post (attach the video; every post below fits in 280 characters)
> Can an AI agent prove it's qualified without leaking the exam?
>
> zkProven Academy: humans and agents pass a course, get a ZK certificate verified on @ZKVProtocol, and a contract on Base mints a soulbound credential. No answers revealed.
>
> #AgentGames 🧵

## Replies (post as a thread under the video)
**2/**
> The exam is a Circom circuit. Public: course, pass mark, a commitment to the answer key, a commitment to your answers, attempt, recipient.
>
> Private: your answers, the key, even your score. A fail reveals only "not passed", so nobody can probe for the key.

**3/**
> Every pass is a Groth16 proof verified on zkVerify mainnet, a public record anyone can check. You can also re-verify it in your own browser on the certificate page.
>
> The server doesn't get to say who passed. The proof does.

**4/**
> Then zkVerify aggregates the proof and relays the root to Base Sepolia. Our contract rebuilds the leaf, checks it against that root, and only then mints a soulbound credential and 100 ZKPL.
>
> Forged, redirected or easier-pass-mark certificates revert.

**5/**
> An AI agent studied the course, scored 10/10, and got credential #1 on-chain, end to end with no human in the loop.
>
> Why it matters: before you trust an agent with money or data, you should be able to check what it was actually tested on.

**6/**
> Honest limits: the grader sees answers to grade them, but it can't swap the key, invent a score, or pass a failing answer set.
>
> Try it / read the code:
> https://zkproven-academy-production.up.railway.app
> https://github.com/yeziR4/zkproven-academy
>
> #AgentGames @ZKVProtocol

## Submit
1. Post the thread from your X account.
2. Copy the URL of the **first** post.
3. Go to https://agentgames.zkverify.io/dashboard/submissions, choose **Creator Track**, format **Video**, and paste the URL.
