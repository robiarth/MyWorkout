import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
test("export web : rechargement hors ligne depuis le cache applicatif", async () => {
  const base = path.resolve("dist");
  const types = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".css": "text/css",
    ".wasm": "application/wasm",
  };
  const server = createServer(async (request, response) => {
    const route = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const file = path.resolve(
      base,
      "." + (route === "/" ? "/index.html" : route),
    );
    if (!file.startsWith(base + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const content = await readFile(file);
      response.writeHead(200, {
        "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
      });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    assert.equal(
      await page.evaluate(() => navigator.serviceWorker.controller !== null),
      true,
    );
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Bêta privée", exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
