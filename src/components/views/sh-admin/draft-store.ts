/**
 * Draf form "Tambah laporan" Admin subholding di IndexedDB perangkat (Fase 1 PWA).
 *
 * - Satu draf per id pengguna: akun admin dipakai bersama di satu perangkat.
 * - Isi: kegiatan, deskripsi, PT, pelapor, jabatan, Idempotency-Key laporan,
 *   dan bukti (berkas disimpan sebagai Blob, tautan sebagai teks).
 * - Idempotency-Key & kunci bukti ikut disimpan: bila halaman tertutup tepat
 *   setelah laporan tersimpan, kirim ulang dari draf dibalas laporan yang sama
 *   oleh server (bukan laporan ganda) dan bukti yang sudah masuk tidak berganda.
 * - Toleran galat: tanpa IndexedDB (mode privat, kuota penuh, data rusak) semua
 *   fungsi diam — get → null, put → false, clear → selesai tanpa galat.
 */

import { EMPTY_FORM, type PendingBukti, type ShForm } from './logic'

const DB_NAME = 'mk-sh-draf'
const DB_VERSION = 1
const STORE = 'draf'
const OPEN_TIMEOUT_MS = 3000
export const DRAFT_VERSION = 1

type DraftFile = {
  key: string
  kind: 'file'
  name: string
  type: string
  lastModified: number
  blob: Blob
}
type DraftLink = { key: string; kind: 'link'; name: string; url: string }

export type ShDraftRecord = {
  v: typeof DRAFT_VERSION
  savedAt: number
  form: ShForm
  idemKey: string
  bukti: (DraftFile | DraftLink)[]
}

export type ShDraft = { form: ShForm; bukti: PendingBukti[]; idemKey: string; savedAt: number }

/* ---------- Logika murni ---------- */

/** Draf tidak berarti bila belum ada kegiatan, deskripsi, PT, atau bukti (nama pelapor saja tidak dihitung). */
export function isDraftEmpty(form: ShForm, bukti: PendingBukti[]): boolean {
  return !form.kegiatan.trim() && !form.deskripsi.trim() && !form.ptId && bukti.length === 0
}

/** Bentuk yang disimpan. Foto yang masih dikompres dilewati (disimpan setelah selesai). */
export function toDraftRecord(form: ShForm, bukti: PendingBukti[], idemKey: string, now: number = Date.now()): ShDraftRecord {
  const items: ShDraftRecord['bukti'] = []
  for (const b of bukti) {
    if (b.kind === 'link') items.push({ key: b.key, kind: 'link', name: b.name, url: b.url })
    else if (!b.compressing)
      items.push({ key: b.key, kind: 'file', name: b.name, type: b.file.type, lastModified: b.file.lastModified, blob: b.file })
  }
  return {
    v: DRAFT_VERSION,
    savedAt: now,
    form: {
      kegiatan: form.kegiatan,
      deskripsi: form.deskripsi,
      ptId: form.ptId,
      reporterName: form.reporterName,
      titleKind: form.titleKind,
      titleField: form.titleField,
    },
    idemKey,
    bukti: items,
  }
}

/** Selaras pola Idempotency-Key server (src/lib/idempotency.ts). */
const IDEM_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,63}$/
/** Kunci bukti dipakai sebagai `up-${key}` (≤ 64 karakter). */
const BUKTI_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{4,59}$/

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')
const isBlob = (v: unknown): v is Blob => typeof Blob !== 'undefined' && v instanceof Blob

/** Rekaman → state layar. Data tak dikenal/rusak → null; bukti rusak dilewati satu per satu. */
export function fromDraftRecord(raw: unknown): ShDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<ShDraftRecord>
  if (r.v !== DRAFT_VERSION || !r.form || typeof r.form !== 'object') return null
  const f = r.form as Partial<ShForm>
  const form: ShForm = {
    ...EMPTY_FORM,
    kegiatan: str(f.kegiatan, 400),
    deskripsi: str(f.deskripsi, 8000),
    ptId: str(f.ptId, 100),
    reporterName: str(f.reporterName, 240),
    titleKind: f.titleKind === 'KEPALA' ? 'KEPALA' : 'MANAJER',
    titleField: str(f.titleField, 160),
  }
  const bukti: PendingBukti[] = []
  for (const b of Array.isArray(r.bukti) ? r.bukti : []) {
    if (!b || typeof b !== 'object' || typeof b.key !== 'string' || !BUKTI_KEY.test(b.key)) continue
    if (b.kind === 'link' && typeof b.url === 'string' && b.url) {
      bukti.push({ key: b.key, kind: 'link', name: str(b.name, 200) || b.url, url: b.url })
    } else if (b.kind === 'file' && isBlob(b.blob)) {
      const name = str(b.name, 255) || 'berkas'
      const type = str(b.type, 120) || b.blob.type
      const file = new File([b.blob], name, { type, lastModified: typeof b.lastModified === 'number' ? b.lastModified : Date.now() })
      bukti.push({ key: b.key, kind: 'file', file, name, size: file.size, isImage: type.startsWith('image/') })
    }
  }
  // Kunci yang tidak sah ditolak server (400) — lebih baik dibuat baru oleh pemanggil.
  const idemKey = typeof r.idemKey === 'string' && IDEM_KEY.test(r.idemKey) ? r.idemKey : ''
  const savedAt = typeof r.savedAt === 'number' ? r.savedAt : 0
  return { form, bukti, idemKey, savedAt }
}

/* ---------- IndexedDB ---------- */

export type ShDraftStore = {
  get: (userId: string) => Promise<ShDraft | null>
  /** false bila tidak tersimpan (tanpa IndexedDB, kuota penuh, dst.). */
  put: (userId: string, form: ShForm, bukti: PendingBukti[], idemKey: string) => Promise<boolean>
  clear: (userId: string) => Promise<void>
}

const keyOf = (userId: string) => `u:${userId}`

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error ?? new Error('IndexedDB gagal'))
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Transaksi IndexedDB gagal'))
    tx.onabort = () => reject(tx.error ?? new Error('Transaksi IndexedDB dibatalkan'))
  })
}

/**
 * `factory` = sumber IDBFactory (bawaan: `globalThis.indexedDB`, dibaca saat
 * dipakai agar aman di server). Tes menyuntikkan tiruan.
 */
export function createDraftStore(factory: () => IDBFactory | null | undefined = defaultFactory): ShDraftStore {
  let dbp: Promise<IDBDatabase | null> | null = null

  function open(): Promise<IDBDatabase | null> {
    if (dbp) return dbp
    dbp = new Promise<IDBDatabase | null>((resolve) => {
      let idb: IDBFactory | null | undefined
      try {
        idb = factory()
      } catch {
        idb = null
      }
      if (!idb) return resolve(null)
      let settled = false
      const finish = (db: IDBDatabase | null) => {
        if (settled) {
          db?.close()
          return
        }
        settled = true
        clearTimeout(timer)
        resolve(db)
      }
      const timer = setTimeout(() => finish(null), OPEN_TIMEOUT_MS)
      try {
        const r = idb.open(DB_NAME, DB_VERSION)
        r.onupgradeneeded = () => {
          try {
            if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE)
          } catch {}
        }
        r.onsuccess = () => {
          const db = r.result
          db.onversionchange = () => {
            db.close()
            dbp = null
          }
          finish(db)
        }
        r.onerror = () => finish(null)
        r.onblocked = () => finish(null)
      } catch {
        finish(null)
      }
    }).then((db) => {
      // Gagal dibuka → dicoba lagi pada panggilan berikutnya.
      if (!db) dbp = null
      return db
    })
    return dbp
  }

  // Operasi dijalankan berurutan sesuai urutan panggilan: `put` yang terlambat
  // tidak boleh menghidupkan lagi draf yang baru saja di-`clear`.
  let tail: Promise<unknown> = Promise.resolve()
  function serial<T>(op: () => Promise<T>): Promise<T> {
    const run = tail.then(op, op)
    tail = run.catch(() => undefined)
    return run
  }

  return {
    get: (userId) => serial(() => getNow(userId)),
    put: (userId, form, bukti, idemKey) => serial(() => putNow(userId, form, bukti, idemKey)),
    clear: (userId) => serial(() => clearNow(userId)),
  }

  async function getNow(userId: string): Promise<ShDraft | null> {
    if (!userId) return null
    try {
      const db = await open()
      if (!db) return null
      const tx = db.transaction(STORE, 'readonly')
      const raw = await req(tx.objectStore(STORE).get(keyOf(userId)))
      return fromDraftRecord(raw)
    } catch {
      return null
    }
  }

  async function putNow(userId: string, form: ShForm, bukti: PendingBukti[], idemKey: string): Promise<boolean> {
    if (!userId) return false
    try {
      const db = await open()
      if (!db) return false
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(toDraftRecord(form, bukti, idemKey), keyOf(userId))
      await done(tx)
      return true
    } catch {
      return false
    }
  }

  async function clearNow(userId: string): Promise<void> {
    if (!userId) return
    try {
      const db = await open()
      if (!db) return
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(keyOf(userId))
      await done(tx)
    } catch {}
  }
}

function defaultFactory(): IDBFactory | null {
  try {
    return typeof indexedDB === 'undefined' ? null : indexedDB
  } catch {
    // Beberapa peramban melempar SecurityError saat `indexedDB` diakses di mode privat.
    return null
  }
}

/** Penyimpanan draf bersama untuk layar Admin subholding. */
export const shDraftStore: ShDraftStore = createDraftStore()
