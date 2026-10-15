/**
 * Logika murni pop-up rincian laporan (Opsi A, 15 Okt 2026) dan pengambil URL
 * bukti bertanda tangan yang mengelompokkan permintaan. Tanpa React supaya
 * bisa diuji di Node: `fetch` dan penjadwal disuntikkan.
 */

/** Batas id per `POST /api/evidence/signed` (lebih → 422 di server). */
export const SIGNED_BATCH_MAX = 60
/** Sisakan 30 detik sebelum URL (5 menit) kedaluwarsa agar gambar tidak gagal di tengah jalan. */
export const SIGNED_TTL_MS = 270_000

export type SignedKind = 'file' | 'link'
export type Signed = { url: string; kind: SignedKind; until: number }

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
export type Scheduler = (run: () => void) => void

/* ---------- Pemilihan foto ---------- */

/** Indeks foto yang aman: bilangan bulat di [0, length-1]; daftar kosong → 0. */
export function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(length) || length <= 0) return 0
  if (!Number.isFinite(index)) return 0
  return Math.min(Math.max(Math.trunc(index), 0), Math.trunc(length) - 1)
}

/** Teks alternatif foto bukti, mis. "Foto bukti 1 dari 3: Pengecoran lantai 2". */
export function photoAlt(index: number, length: number, kegiatan: string): string {
  const n = Math.max(length, 1)
  const base = `Foto bukti ${clampIndex(index, n) + 1} dari ${n}`
  const k = kegiatan.trim()
  return k ? `${base}: ${k}` : base
}

/** Label tombol dokumen menurut jenis bukti. */
export function docActionLabel(kind: SignedKind | null | undefined): string {
  return kind === 'link' ? 'Buka tautan' : 'Buka berkas'
}

/* ---------- Pengelompokan permintaan URL ---------- */

/** Id unik tak kosong (urutan pertama dipertahankan), dipotong per `max` (≥1). */
export function chunkIds(ids: readonly string[], max = SIGNED_BATCH_MAX): string[][] {
  const size = Math.max(1, Math.trunc(max) || 1)
  const seen = new Set<string>()
  const unique: string[] = []
  for (const id of ids) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue
    seen.add(id)
    unique.push(id)
  }
  const out: string[][] = []
  for (let i = 0; i < unique.length; i += size) out.push(unique.slice(i, i + size))
  return out
}

/**
 * Gabungkan balasan `{ items: [{ id, url, kind }] }` dengan id yang diminta.
 * Butir tak dikenal, tanpa URL, atau id yang tidak diminta diabaikan; id yang
 * tidak kembali masuk `missing` (ditolak/tidak ada — alasannya tidak dibocorkan).
 */
export function mergeSigned(
  requested: readonly string[],
  body: unknown,
  now: number,
  ttl = SIGNED_TTL_MS
): { found: Map<string, Signed>; missing: string[] } {
  const wanted = new Set(requested)
  const found = new Map<string, Signed>()
  const items = body && typeof body === 'object' ? (body as { items?: unknown }).items : null
  if (Array.isArray(items)) {
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue
      const { id, url, kind } = raw as { id?: unknown; url?: unknown; kind?: unknown }
      if (typeof id !== 'string' || !wanted.has(id) || found.has(id)) continue
      if (typeof url !== 'string' || !url) continue
      found.set(id, { url, kind: kind === 'link' ? 'link' : 'file', until: now + ttl })
    }
  }
  const missing = [...wanted].filter((id) => !found.has(id))
  return { found, missing }
}

/** Status yang berarti endpoint kelompok belum ada → pakai GET per id. */
export function batchUnsupported(status: number): boolean {
  return status === 404 || status === 405
}

/** Balasan GET /api/evidence/:id → Signed, atau null bila gagal. */
export function signedFromSingle(ok: boolean, body: unknown, now: number, ttl = SIGNED_TTL_MS): Signed | null {
  if (!ok || !body || typeof body !== 'object') return null
  const { url, kind } = body as { url?: unknown; kind?: unknown }
  if (typeof url !== 'string' || !url) return null
  return { url, kind: kind === 'link' ? 'link' : 'file', until: now + ttl }
}

const defaultSchedule: Scheduler = (run) => {
  setTimeout(run, 0)
}

/**
 * Pengambil URL bertanda tangan dengan cache TTL. Permintaan dalam satu tick
 * dikumpulkan lalu dikirim ke `POST /api/evidence/signed` (≤60 id per kiriman).
 * Endpoint 404/405 atau jaringan gagal → GET /api/evidence/:id per id; 404/405
 * diingat sehingga kiriman berikutnya langsung memakai GET. Galat lain (401,
 * 503, …) → semua id di kiriman itu gagal. Janji selalu selesai (tidak menolak).
 */
export function createSignedFetcher(opts: {
  fetch: FetchLike
  schedule?: Scheduler
  now?: () => number
  ttl?: number
  max?: number
}) {
  const fetchImpl = opts.fetch
  const schedule = opts.schedule ?? defaultSchedule
  const now = opts.now ?? Date.now
  const ttl = opts.ttl ?? SIGNED_TTL_MS
  const max = opts.max ?? SIGNED_BATCH_MAX

  const cache = new Map<string, Signed>()
  const pending = new Map<string, Promise<Signed | null>>()
  let waiting = new Map<string, (s: Signed | null) => void>()
  let scheduled = false
  let batchOff = false

  async function single(id: string): Promise<Signed | null> {
    try {
      const r = await fetchImpl(`/api/evidence/${encodeURIComponent(id)}`)
      const j = await r.json().catch(() => null)
      const s = signedFromSingle(r.ok, j, now(), ttl)
      if (s) cache.set(id, s)
      return s
    } catch {
      return null
    }
  }

  async function viaSingles(ids: string[]): Promise<Map<string, Signed | null>> {
    const res = await Promise.all(ids.map(single))
    return new Map(ids.map((id, i) => [id, res[i] ?? null]))
  }

  async function runChunk(ids: string[]): Promise<Map<string, Signed | null>> {
    if (batchOff) return viaSingles(ids)
    let res: Response
    try {
      res = await fetchImpl('/api/evidence/signed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
    } catch {
      return viaSingles(ids)
    }
    if (batchUnsupported(res.status)) {
      batchOff = true
      return viaSingles(ids)
    }
    if (!res.ok) return new Map(ids.map((id) => [id, null]))
    const body = await res.json().catch(() => null)
    const { found } = mergeSigned(ids, body, now(), ttl)
    found.forEach((s, id) => cache.set(id, s))
    return new Map(ids.map((id) => [id, found.get(id) ?? null]))
  }

  function flush() {
    const batch = waiting
    waiting = new Map()
    scheduled = false
    for (const ids of chunkIds([...batch.keys()], max)) {
      runChunk(ids)
        .catch(() => new Map<string, Signed | null>())
        .then((out) => {
          for (const id of ids) batch.get(id)?.(out.get(id) ?? null)
        })
    }
  }

  function peek(id: string): Signed | null {
    const hit = cache.get(id)
    return hit && hit.until > now() ? hit : null
  }

  function get(id: string): Promise<Signed | null> {
    const hit = peek(id)
    if (hit) return Promise.resolve(hit)
    const inflight = pending.get(id)
    if (inflight) return inflight
    const p = new Promise<Signed | null>((resolve) => {
      waiting.set(id, resolve)
    }).finally(() => pending.delete(id))
    pending.set(id, p)
    if (!scheduled) {
      scheduled = true
      schedule(flush)
    }
    return p
  }

  return { get, peek }
}
