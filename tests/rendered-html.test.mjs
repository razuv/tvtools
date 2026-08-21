import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Playtools workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /class="studio-shell/);
  assert.match(html, /aria-label="Interactive WebGL 3D model"/);
  assert.match(html, />Properties</);
  assert.match(html, />Ready to export</);
  assert.match(html, /PNG \+ BG/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("ships Playtools metadata, geometry controls, and OG image", async () => {
  const [layout, page, packageJson, ogImage] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/og.png", import.meta.url)),
  ]);

  assert.match(layout, /title:\s*"Playtools"/);
  assert.match(layout, /\/og\.png/);
  assert.match(layout, /width:\s*1200,\s*height:\s*630/);
  assert.match(page, /Create text shape/);
  assert.match(page, /TTF and OTF files only/);
  assert.match(page, /fontBlob/);
  assert.match(page, /\.ttf,\.otf/);
  assert.match(page, /Geometry operation/);
  assert.match(page, /exportObj/);
  assert.match(packageJson, /"build:pages"/);
  assert.deepEqual([...ogImage.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
