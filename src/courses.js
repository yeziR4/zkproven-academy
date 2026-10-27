import fs from "node:fs";
import path from "node:path";
import { keyCommitment, QUESTIONS } from "./exam.js";

/**
 * Loads every course under coursesDir. course.json is public; key.json (gitignored)
 * holds the answer key and salt and never leaves this module except into the prover.
 */
export function loadCourses(coursesDir) {
  const courses = new Map();
  for (const slug of fs.readdirSync(coursesDir)) {
    const dir = path.join(coursesDir, slug);
    if (!fs.statSync(dir).isDirectory()) continue;
    const course = JSON.parse(fs.readFileSync(path.join(dir, "course.json"), "utf8"));
    const secret = JSON.parse(fs.readFileSync(path.join(dir, "key.json"), "utf8"));
    if (course.questions.length !== QUESTIONS) throw new Error(`${slug}: exam needs exactly ${QUESTIONS} questions`);
    const commitment = keyCommitment(course.id, secret.key, secret.keySalt);
    courses.set(course.slug, { ...course, keyCommitment: commitment.toString(), secret });
  }
  return courses;
}

/** What learners and verifiers may see: everything except the key and salt. */
export function publicCourse(course, { withLessons = true } = {}) {
  const { secret, ...pub } = course;
  if (!withLessons) delete pub.lessons;
  return pub;
}

export function examQuestions(course) {
  return course.questions.map(({ id, prompt, options }) => ({ id, prompt, options }));
}
