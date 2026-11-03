import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      ),
    )
  ).flat();
}
const files = (await walk("dist"))
  .filter((p) => p !== "dist/sw.js" && !p.endsWith(".map"))
  .map((p) => "/" + p.slice(5));
const version = createHash("sha256")
  .update(files.join("\n") + (await readFile("dist/index.html", "utf8")))
  .digest("hex")
  .slice(0, 16);
await writeFile(
  "dist/sw.js",
  `const CACHE = 'myworkout-${version}';
const ASSETS = ${JSON.stringify(files)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('myworkout-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if(event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if(event.request.mode === 'navigate') event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
  else if(ASSETS.includes(url.pathname)) event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
`,
);
const html = await readFile("dist/index.html", "utf8");
await writeFile(
  "dist/index.html",
  html.replace('<html lang="en"', '<html lang="fr"'),
);
console.log(
  `Offline web: ${files.length} fichiers, cache myworkout-${version}`,
);
