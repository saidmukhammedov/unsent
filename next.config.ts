import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is only needed when building Docker containers.
  // On Vercel, Next.js automatically packages serverless functions and static assets.
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
