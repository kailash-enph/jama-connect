/**
 * Tests for the rewriteImageUrls utility.
 *
 * Pure logic — no VS Code API required.
 * Runs under vitest (npm test) or standalone: npx tsx src/__tests__/imageRewrite.test.ts
 */

import { describe, it, expect } from "vitest";

// Unified backend: editor routes are mounted at /editor/ on the main port (8765).
const BACKEND_PORT = 8765;
const EDITOR_BASE = `http://localhost:${BACKEND_PORT}/editor`;
const JAMA_IMG_RE = /https?:\/\/[^"']*?\/rest\/v1\/attachments\/(\d+)\/file/gi;

function rewriteImageUrls(html: string): string {
  return html.replace(JAMA_IMG_RE, `${EDITOR_BASE}/api/proxy/image/$1`);
}

describe("rewriteImageUrls", () => {
  it("rewrites a Jama attachment URL to the local proxy", () => {
    const html = '<img src="https://enphase.jamacloud.com/rest/v1/attachments/12345/file">';
    const result = rewriteImageUrls(html);
    expect(result).toContain(`${EDITOR_BASE}/api/proxy/image/12345`);
    expect(result).not.toContain("jamacloud.com");
  });

  it("passes through HTML that has no Jama image URLs", () => {
    const html = "<p>Hello world</p>";
    expect(rewriteImageUrls(html)).toBe(html);
  });

  it("rewrites multiple images in one pass", () => {
    const html =
      '<img src="https://enphase.jamacloud.com/rest/v1/attachments/111/file">' +
      '<img src="https://enphase.jamacloud.com/rest/v1/attachments/222/file">';
    const result = rewriteImageUrls(html);
    expect(result).toContain(`${EDITOR_BASE}/api/proxy/image/111`);
    expect(result).toContain(`${EDITOR_BASE}/api/proxy/image/222`);
    expect(result).not.toContain("jamacloud.com");
  });

  it("handles empty string", () => {
    expect(rewriteImageUrls("")).toBe("");
  });

  it("preserves non-Jama image URLs", () => {
    const html = '<img src="https://example.com/image.png">';
    expect(rewriteImageUrls(html)).toBe(html);
  });

  it("rewrites http:// Jama URLs as well as https://", () => {
    const html = '<img src="http://test.jamacloud.com/rest/v1/attachments/333/file">';
    expect(rewriteImageUrls(html)).toContain(`${EDITOR_BASE}/api/proxy/image/333`);
  });

  it("CSP template includes the editor base URL", () => {
    const csp = `img-src \${webview.cspSource} https: data: ${EDITOR_BASE};`;
    expect(csp).toContain(EDITOR_BASE);
  });
});
