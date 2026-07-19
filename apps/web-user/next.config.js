const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Monorepo: trace from the repo root so standalone emits apps/web-user/server.js.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  reactStrictMode: true,
  // Type-checking stays on; skip ESLint in the container build (no eslint config shipped).
  eslint: { ignoreDuringBuilds: true },
  // API base for the browser. Defaults to same-origin '/api' (nginx proxies in
  // prod); override via NEXT_PUBLIC_API_URL for split-origin dev.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api',
  },
};
module.exports = nextConfig;
