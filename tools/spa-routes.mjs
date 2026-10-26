// After `vite build`: give every route its own index.html, so links such as /entry/9 load with HTTP 200
// on GitHub Pages instead of going through the 404 fallback. Asset URLs in index.html are absolute
// (Vite base /bai-juyi-friends/), so the same file works at any depth.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const dist = "dist";
const rows = JSON.parse(readFileSync("src/data/records.json", "utf8")).rows;
const routes = ["summary", "method", "about", ...rows.map((r) => `entry/${r.n}`)];

for (const route of routes) {
  const out = join(dist, route, "index.html");
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(join(dist, "index.html"), out);
}
copyFileSync(join(dist, "index.html"), join(dist, "404.html")); // anything else still reaches the app's own "not found" page
console.log(`Wrote index.html for ${routes.length} routes and 404.html`);
