import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

test("builds a self-contained Playtools SPA", async () => {
  const [html, assets] = await Promise.all([
    readFile(new URL("../dist-pages/index.html", import.meta.url), "utf8"),
    readdir(new URL("../dist-pages/assets", import.meta.url)),
  ]);

  assert.match(html, /<title>Playtools<\/title>/);
  assert.match(html, /name="description"/);
  assert.match(html, /property="og:image"/);
  assert.match(html, /name="twitter:card"/);
  assert.match(html, /id="root"/);
  assert.ok(assets.some((file) => /^index-.*\.js$/.test(file)));
  assert.ok(assets.some((file) => /^index-.*\.css$/.test(file)));
  assert.ok(assets.some((file) => /^geometry\.worker-.*\.js$/.test(file)));
});

test("ships the editor features and public assets", async () => {
  const [page, packageJson, ogImage, favicon] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../dist-pages/og.png", import.meta.url)),
    readFile(new URL("../dist-pages/favicon.svg", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Create text shape/);
  assert.match(page, /TTF and OTF files only/);
  assert.match(page, /Geometry operation/);
  assert.match(page, /Post-processing effect/);
  assert.match(page, /Halftone/);
  assert.match(page, /exportObj/);
  assert.doesNotMatch(packageJson, /vinext|next|cloudflare|wrangler|drizzle/i);
  assert.deepEqual([...ogImage.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.match(favicon, /<svg/);
});
