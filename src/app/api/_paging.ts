/**
 * Pembaca parameter angka query string untuk rute daftar (T12). `parseInt('abc')`
 * menghasilkan NaN, dan `Math.max(1, NaN)` tetap NaN: Prisma lalu menolak
 * `skip`/`take` dengan galat validasi (500) hanya karena `?page=abc`. Helper ini
 * selalu mengembalikan bilangan bulat dalam [min, max].
 *
 * Berkas ini bukan rute (Next hanya memetakan `route.ts`), jadi aman berada di
 * dalam src/app/api.
 */
export function intParam(raw: string | null | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Halaman maksimum yang wajar; mencegah OFFSET astronomis. */
export const MAX_PAGE = 10000
