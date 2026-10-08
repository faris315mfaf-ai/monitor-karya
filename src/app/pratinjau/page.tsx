import { notFound } from 'next/navigation'

/**
 * Pratinjau desain per peran dengan data contoh — hanya di mode pengembangan.
 * Contoh: /pratinjau?peran=KEPALA_DIVISI. Di produksi halaman ini tidak ada:
 * src/proxy.ts menjawab 404 lebih dulu, dan impor dinamis di bawah berada di
 * cabang yang dibuang saat build produksi (NODE_ENV dikonstankan), jadi data
 * contoh dan penimpa `fetch` di src/components/preview tidak ikut terbundel.
 */
export default async function PratinjauPage({ searchParams }: { searchParams: Promise<{ peran?: string }> }) {
  if (process.env.NODE_ENV !== 'production') {
    const { PreviewApp } = await import('@/components/preview/preview-app')
    const { peran } = await searchParams
    return <PreviewApp role={(peran ?? 'MANAJEMEN').toUpperCase()} />
  }
  notFound()
}
