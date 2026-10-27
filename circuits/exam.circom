pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

// Proves an exam was passed without revealing the answers or the answer key.
//
//   keyCommitment     = Poseidon(courseId, key[0..N-1], keySalt)          published before any attempt
//   answersCommitment = Poseidon(attemptId, answers[0..N-1], answersSalt) the learner's receipt
//   sum(answers[i] == key[i]) >= passMark
//
// recipient binds the certificate to one learner address, so a proof cannot be
// replayed or front-run for someone else.
template Exam(N) {
    // public
    signal input courseId;
    signal input keyCommitment;
    signal input answersCommitment;
    signal input passMark;
    signal input attemptId;
    signal input recipient;

    // private
    signal input answers[N];
    signal input key[N];
    signal input keySalt;
    signal input answersSalt;

    // Each choice is an option index 0..7.
    component answerBits[N];
    component keyBits[N];
    for (var i = 0; i < N; i++) {
        answerBits[i] = Num2Bits(3);
        answerBits[i].in <== answers[i];
        keyBits[i] = Num2Bits(3);
        keyBits[i].in <== key[i];
    }

    component keyHash = Poseidon(N + 2);
    keyHash.inputs[0] <== courseId;
    for (var i = 0; i < N; i++) keyHash.inputs[i + 1] <== key[i];
    keyHash.inputs[N + 1] <== keySalt;
    keyHash.out === keyCommitment;

    component answersHash = Poseidon(N + 2);
    answersHash.inputs[0] <== attemptId;
    for (var i = 0; i < N; i++) answersHash.inputs[i + 1] <== answers[i];
    answersHash.inputs[N + 1] <== answersSalt;
    answersHash.out === answersCommitment;

    component correct[N];
    signal running[N + 1];
    running[0] <== 0;
    for (var i = 0; i < N; i++) {
        correct[i] = IsEqual();
        correct[i].in[0] <== answers[i];
        correct[i].in[1] <== key[i];
        running[i + 1] <== running[i] + correct[i].out;
    }

    component markBits = Num2Bits(5);
    markBits.in <== passMark;
    component passed = GreaterEqThan(5);
    passed.in[0] <== running[N];
    passed.in[1] <== passMark;
    passed.out === 1;

    // Keep recipient in the constraint system so it cannot be optimized away.
    signal recipientSquared;
    recipientSquared <== recipient * recipient;
}

component main { public [courseId, keyCommitment, answersCommitment, passMark, attemptId, recipient] } = Exam(10);
