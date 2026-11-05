import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadCourses, keyEnvName } from "../src/courses.js";

test("the answer key can come from a secret env var instead of key.json", () => {
  const fileKey = JSON.parse(fs.readFileSync("courses/agents-and-zk/key.json", "utf8"));
  assert.equal(keyEnvName("agents-and-zk"), "COURSE_KEY_AGENTS_AND_ZK");
  const fromFile = loadCourses("courses", {}).get("agents-and-zk");
  const fromEnv = loadCourses("courses", { COURSE_KEY_AGENTS_AND_ZK: JSON.stringify(fileKey) }).get("agents-and-zk");
  assert.equal(fromEnv.keyCommitment, fromFile.keyCommitment);
});
