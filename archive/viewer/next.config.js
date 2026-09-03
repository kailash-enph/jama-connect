/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Static export: produces pure HTML/JS/CSS in out/ directory.
  // Served by FastAPI StaticFiles — no Node.js needed at runtime.
  output: 'export',
  // basePath prefixes all <Link> hrefs and asset paths so the static
  // export works when mounted at /viewer in the FastAPI backend.
  basePath: '/viewer',
  // trailingSlash generates search/index.html (not search.html) so
  // Starlette StaticFiles(html=True) can resolve /viewer/search/ correctly.
  trailingSlash: true,
};

module.exports = nextConfig;
