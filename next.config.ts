import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is for self-hosting (VPS/containers). On Vercel it is
  // unnecessary (Vercel builds and serves Next.js itself) — skip it there.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  // Cortex gates every route with middleware — without raising this, Next.js
  // truncates request bodies at its 10MB default and large PDF uploads arrive
  // silently cut off (broken viewer files, failed text extraction).
  experimental: {
    proxyClientMaxBodySize: "250mb",
  },
  // pdf-parse ships pdf.js internals — keep it out of the bundler.
  // The AWS SDK (Cloudflare R2) is external for the same reason: smaller
  // functions, no bundler edge cases with its native crypto dependencies.
  serverExternalPackages: ["pdf-parse", "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
