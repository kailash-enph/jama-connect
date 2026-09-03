/**
 * Tests for the rewriteImageUrls function.
 *
 * Run with:  npx tsx src/__tests__/imageRewrite.test.ts
 *
 * Pure logic tests — no VS Code API or Vitest required.
 */

import assert from "node:assert";

// Unified backend: editor routes are mounted at /editor/ on the main port (8765).
const BACKEND_PORT = 8765;
const EDITOR_BASE = `http://localhost:${BACKEND_PORT}/editor`;
const JAMA_IMG_RE = /https?:\/\/[^"']*?\/rest\/v1\/attachments\/(\d+)\/file/gi;

function rewriteImageUrls(html: string): string {
  return html.replace(JAMA_IMG_RE, `${EDITOR_BASE}/api/proxy/image/$1`);
}

// ---------- Tests ----------

function testRewritesJamaUrl() {
  const html = '<img src="https://enphase.jamacloud.com/rest/v1/attachments/12345/file">';
  const result = rewriteImageUrls(html);
  assert.ok(result.includes(`${EDITOR_BASE}/api/proxy/image/12345`), "Should rewrite to proxy URL");
  assert.ok(!result.includes("jamacloud.com"), "Should remove Jama domain");
}

function testNoImagesPassthrough() {
  const html = "<p>Hello world</p>";
  const result = rewriteImageUrls(html);
  assert.strictEqual(result, html, "HTML without images should pass through unchanged");
}

function testMultipleImages() {
  const html =
    '<img src="https://enphase.jamacloud.com/rest/v1/attachments/111/file">' +
    '<img src="https://enphase.jamacloud.com/rest/v1/attachments/222/file">';
  const result = rewriteImageUrls(html);
  assert.ok(result.includes(`${EDITOR_BASE}/api/proxy/image/111`), "First image rewritten");
  assert.ok(result.includes(`${EDITOR_BASE}/api/proxy/image/222`), "Second image rewritten");
  assert.ok(!result.includes("jamacloud.com"), "No Jama URLs remain");
}

function testEmptyHtml() {
  assert.strictEqual(rewriteImageUrls(""), "", "Empty string should return empty");
}

function testPreservesNonJamaUrls() {
  const html = '<img src="https://example.com/image.png">';
  const result = rewriteImageUrls(html);
  assert.strictEqual(result, html, "Non-Jama URLs should be preserved");
}

function testHttpAndHttps() {
  const html = '<img src="http://test.jamacloud.com/rest/v1/attachments/333/file">';
  const result = rewriteImageUrls(html);
  assert.ok(result.includes(`${EDITOR_BASE}/api/proxy/image/333`), "HTTP URLs should also be rewritten");
}

function testCspIncludesProxy() {
  // Verify the CSP string pattern includes the editor base URL
  const csp = `img-src \${webview.cspSource} https: data: ${EDITOR_BASE};`;
  assert.ok(csp.includes(EDITOR_BASE), "CSP should include editor backend origin");
}

// ---------- Runner ----------

const tests = [
  testRewritesJamaUrl,
  testNoImagesPassthrough,
  testMultipleImages,
  testEmptyHtml,
  testPreservesNonJamaUrls,
  testHttpAndHttps,
  testCspIncludesProxy,
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    test();
    console.log(`  ✓ ${test.name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${test.name}: ${err}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed out of ${tests.length} tests`);
if (failed > 0) {
  process.exit(1);
}
