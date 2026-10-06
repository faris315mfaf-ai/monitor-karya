import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { PREFS_BOOT_SCRIPT } from "@/lib/tampilan-boot";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Monitor Karya — Pemantauan kerja berbasis output",
  description:
    "Pemantauan kerja holding dan anak perusahaan: laporan harian proyek, capaian mingguan divisi, persetujuan, dan eskalasi.",
  authors: [{ name: "Monitor Karya" }],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#050506" },
  ],
  viewportFit: "cover",
};


export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonce CSP dari src/proxy.ts; skrip inline tanpa nonce diblokir di produksi.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="id"
      data-accent="merah"
      data-nav="sidebar"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
          <Toaster />
          {/* [F1-D] Toast bergaya token: latar surface (wrapper bawaan memakai
              --popover yang tidak ada di tokens.css → toast tembus pandang),
              jarak atas --toast-top agar tidak tertutup tab bar mengambang /
              baris atas ponsel; gaya lengkap di src/app/css/utang-teknis.css. */}
          <SonnerToaster
            position="top-center"
            offset={{ top: "var(--toast-top)" }}
            mobileOffset={{ top: "var(--toast-top)", left: "var(--space-4)", right: "var(--space-4)" }}
            style={
              {
                "--normal-bg": "var(--surface)",
                "--normal-text": "var(--ink)",
                "--normal-border": "var(--line)",
                "--border-radius": "var(--radius-md)",
              } as React.CSSProperties
            }
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
