import fs from "node:fs";
import path from "node:path";

/**
 * Tiny durable key-value collections: each collection is an append-only JSONL
 * file of full records; the last record per id wins on reload.
 */
export class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.collections = new Map();
  }

  collection(name) {
    let c = this.collections.get(name);
    if (c) return c;
    const file = path.join(this.dir, `${name}.jsonl`);
    const rows = new Map();
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        if (!line) continue;
        try {
          const row = JSON.parse(line);
          rows.set(row.id, row);
        } catch {
          // torn final line after a crash
        }
      }
    }
    c = {
      get: (id) => rows.get(id),
      all: () => [...rows.values()],
      put: (row) => {
        rows.set(row.id, row);
        fs.appendFileSync(file, JSON.stringify(row) + "\n");
        return row;
      },
    };
    this.collections.set(name, c);
    return c;
  }
}
