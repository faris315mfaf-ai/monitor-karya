import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./src/lib/security-headers";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // Standalone bundles a self-contained server for Docker or a plain VM. Vercel
  // builds its own output and needs the regular file traces, so asking for
  // standalone there leaves it looking for a next-server.js.nft.json that the
  // standalone build never writes. Keep it for self-hosting, skip it on Vercel.
  output: process.env.VERCEL ? undefined : "standalone",
  reactStrictMode: false,
  // Tidak mengiklankan kerangka & versi server.
  poweredByHeader: false,
  // Lencana "N" Next.js di pojok layar dev menutupi Dock/tab bar; dimatikan.
  devIndicators: false,
  experimental: {
    // src/proxy.ts menyangga badan permintaan; unggah bukti boleh 20 MB
    // (+ pembungkus multipart), jadi batas bawaan 10 MB akan memotongnya.
    proxyClientMaxBodySize: "22mb",
  },
  // Header keamanan statis untuk semua respons, termasuk aset _next/static.
  // CSP bernonce dipasang per permintaan oleh src/proxy.ts. Larangan dibingkai
  // (X-Frame-Options) & COOP hanya di produksi supaya panel pratinjau dev tetap
  // bisa menampilkan aplikasi. Lihat docs/KEAMANAN.md.
  async headers() {
    const all = staticSecurityHeaders(isProd).filter(
      (h) => isProd || (h.key !== "X-Frame-Options" && h.key !== "Cross-Origin-Opener-Policy")
    );
    return [
      { source: "/:path*", headers: all },
      // Data API bersifat pribadi per akun: jangan pernah disimpan cache bersama.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }] },
    ];
  },
};

export default nextConfig;
