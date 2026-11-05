import fs from "node:fs";
import path from "node:path";
import { keyCommitment, QUESTIONS } from "./exam.js";

/**
 * Loads every course under coursesDir. course.json is public; the answer key and
 * salt come from key.json (gitignored, local dev) or the COURSE_KEY_<SLUG> secret
 * (deployments), and never leave this module except into the prover.
 */
export function loadCourses(coursesDir, env = process.env) {
  const courses = new Map();
  for (const slug of fs.readdirSync(coursesDir)) {
    const dir = path.join(coursesDir, slug);
    if (!fs.statSync(dir).isDirectory()) continue;
    const course = JSON.parse(fs.readFileSync(path.join(dir, "course.json"), "utf8"));
    const secret = loadKey(dir, slug, env);
    if (course.questions.length !== QUESTIONS) throw new Error(`${slug}: exam needs exactly ${QUESTIONS} questions`);
    const commitment = keyCommitment(course.id, secret.key, secret.keySalt);
    courses.set(course.slug, { ...course, keyCommitment: commitment.toString(), secret });
  }
  return courses;
}

export function keyEnvName(slug) {
  return `COURSE_KEY_${slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

function loadKey(dir, slug, env) {
  const fromEnv = env[keyEnvName(slug)];
  if (fromEnv) return JSON.parse(fromEnv);
  const file = path.join(dir, "key.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  throw new Error(`${slug}: no answer key (set ${keyEnvName(slug)} or add key.json)`);
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
