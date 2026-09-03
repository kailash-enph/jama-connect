import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  minify: !watch,
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ["src/webview/tiptapEditor.ts"],
  bundle: true,
  outfile: "out/webview/tiptap.js",
  format: "iife",
  platform: "browser",
  target: "es2020",
  sourcemap: true,
  minify: !watch,
};

/** @type {import('esbuild').BuildOptions} */
const toolkitConfig = {
  entryPoints: ["src/webview/toolkit-entry.ts"],
  bundle: true,
  outfile: "out/webview/toolkit.js",
  format: "iife",
  platform: "browser",
  target: "es2020",
  sourcemap: true,
  minify: !watch,
};

if (watch) {
  const [ctxExt, ctxWv, ctxTk] = await Promise.all([
    esbuild.context(extensionConfig),
    esbuild.context(webviewConfig),
    esbuild.context(toolkitConfig),
  ]);
  await Promise.all([ctxExt.watch(), ctxWv.watch(), ctxTk.watch()]);
  console.log("[esbuild] watching for changes...");
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(webviewConfig),
    esbuild.build(toolkitConfig),
  ]);
  console.log("[esbuild] extension + webview + toolkit build complete");
}
