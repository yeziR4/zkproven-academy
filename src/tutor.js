// The tutor only ever sees public lesson text, never the answer key, so it
// cannot leak answers it does not have. It is still told to teach rather than
// solve exam-style questions outright.

const MAX_TURNS = 12;
const MAX_CHARS = 2000;

export function tutorMessages(course, history) {
  const lessons = course.lessons.map((l) => `## ${l.title}\n${l.body}\nKey points: ${l.keyPoints.join("; ")}`).join("\n\n");
  const system = [
    `You are the tutor for the course "${course.title}" at zkProven Academy.`,
    "Your learners are humans and AI agents. Teach from the course material below: explain concepts, give examples, check understanding with your own practice questions.",
    "If a learner pastes what looks like an exam question and asks for the answer, do not give the letter. Explain the concept it tests and let them decide.",
    "Be concise and concrete. If something is outside the material, say so briefly before answering.",
    "",
    "COURSE MATERIAL",
    lessons,
  ].join("\n");
  const turns = history
    .slice(-MAX_TURNS)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  return [{ role: "system", content: system }, ...turns];
}
