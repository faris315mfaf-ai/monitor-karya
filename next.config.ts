import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone bundles a self-contained server for Docker or a plain VM. Vercel
  // builds its own output and needs the regular file traces, so asking for
  // standalone there leaves it looking for a next-server.js.nft.json that the
  // standalone build never writes. Keep it for self-hosting, skip it on Vercel.
  output: process.env.VERCEL ? undefined : "standalone",
  reactStrictMode: false,
};

export default nextConfig;
