import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Cortex gates every route with middleware — without raising this, Next.js
  // truncates request bodies at its 10MB default and large PDF uploads arrive
  // silently cut off (broken viewer files, failed text extraction).
  experimental: {
    proxyClientMaxBodySize: "250mb",
  },
  // pdf-parse ships pdf.js internals — keep it out of the bundler
  serverExternalPackages: ["pdf-parse"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
