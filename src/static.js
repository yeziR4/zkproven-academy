import fs from "node:fs";
import path from "node:path";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

/** Serves files from dir; unknown paths fall back to index.html (hash-routed SPA). */
export function serveStatic(dir) {
  const root = path.resolve(dir);
  return function (req, res) {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.resolve(root, "." + rel);
    if (!file.startsWith(root + path.sep) && file !== root) file = path.join(root, "index.html");
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  };
}
