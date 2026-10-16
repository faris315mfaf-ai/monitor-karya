import { describe, expect, it } from 'vitest'

/**
 * Draf form Tambah laporan di IndexedDB (Fase 1 PWA, KONTRAK-FASE1-PWA.md bagian A.4):
 *  - bentuk rekaman: isian + Idempotency-Key + bukti (Blob), foto yang masih dikompres dilewati;
 *  - pulih dari rekaman rusak tanpa galat;
 *  - satu draf per id pengguna; operasi berurutan (put yang terlambat tidak menghidupkan draf yang di-clear);
 *  - tanpa IndexedDB (mode privat) semua operasi diam.
 * IndexedDB tiruan minimal — Node tidak punya IndexedDB.
 */

import {
  createDraftStore,
  fromDraftRecord,
  isDraftEmpty,
  toDraftRecord,
} from '@/components/views/sh-admin/draft-store'
import { EMPTY_FORM, type PendingBukti, type ShForm } from '@/components/views/sh-admin/logic'

const FORM: ShForm = {
  kegiatan: 'Pemasangan panel surya',
  deskripsi: 'Pemasangan 24 dari 40 panel.',
  ptId: 'pt-1',
  reporterName: 'Rudi Hartono',
  titleKind: 'KEPALA',
  titleField: 'Proyek',
}

function photo(key: string, name = 'IMG_1.jpg', compressing = false): PendingBukti {
  const file = new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'image/jpeg', lastModified: 1_700_000_000_000 })
  return { key, kind: 'file', file, name, size: file.size, isImage: true, ...(compressing ? { compressing: true } : {}) }
}
const link: PendingBukti = { key: 'shb-tautan-0001', kind: 'link', name: 'Drive', url: 'https://drive.example.com/x' }

/* ---------- IndexedDB tiruan ---------- */

type Req = { result?: unknown; error?: unknown; onsuccess?: (() => void) | null; onerror?: (() => void) | null }

function fakeIndexedDB(opts: { failOpen?: boolean } = {}) {
  const dbs = new Map<string, Map<string, Map<string, unknown>>>()
  const later = (fn: () => void) => setTimeout(fn, 0)
  function makeDb(stores: Map<string, Map<string, unknown>>) {
    return {
      objectStoreNames: { contains: (n: string) => stores.has(n) },
      createObjectStore: (n: string) => stores.set(n, new Map()),
      close: () => {},
      onversionchange: null as null | (() => void),
      transaction(name: string) {
        const store = stores.get(name)
        if (!store) throw new Error('NotFoundError')
        const tx = {
          oncomplete: null as null | (() => void),
          onerror: null as null | (() => void),
          onabort: null as null | (() => void),
          error: null,
          objectStore: () => ({
            get: (k: string) => op(() => store.get(k)),
            put: (v: unknown, k: string) => op(() => (store.set(k, v), k)),
            delete: (k: string) => op(() => void store.delete(k)),
          }),
        }
        function op(fn: () => unknown) {
          const r: Req = {}
          later(() => {
            r.result = fn()
            r.onsuccess?.()
            later(() => tx.oncomplete?.())
          })
          return r
        }
        return tx
      },
    }
  }
  const factory = {
    open(name: string) {
      const r: Req & { onupgradeneeded?: (() => void) | null; onblocked?: (() => void) | null } = {}
      later(() => {
        if (opts.failOpen) {
          r.error = new Error('QuotaExceededError')
          r.onerror?.()
          return
        }
        let stores = dbs.get(name)
        const fresh = !stores
        if (!stores) {
          stores = new Map()
          dbs.set(name, stores)
        }
        r.result = makeDb(stores)
        if (fresh) r.onupgradeneeded?.()
        r.onsuccess?.()
      })
      return r
    },
  }
  return { factory: factory as unknown as IDBFactory, dbs }
}

/* ---------- Tes ---------- */

describe('isDraftEmpty', () => {
  it('nama pelapor saja tidak dihitung sebagai draf', () => {
    expect(isDraftEmpty(EMPTY_FORM, [])).toBe(true)
    expect(isDraftEmpty({ ...EMPTY_FORM, reporterName: 'Rudi', titleField: 'Proyek' }, [])).toBe(true)
    expect(isDraftEmpty({ ...EMPTY_FORM, kegiatan: '  ' }, [])).toBe(true)
  })

  it('kegiatan, deskripsi, PT, atau bukti → ada draf', () => {
    expect(isDraftEmpty({ ...EMPTY_FORM, kegiatan: 'a' }, [])).toBe(false)
    expect(isDraftEmpty({ ...EMPTY_FORM, deskripsi: 'a' }, [])).toBe(false)
    expect(isDraftEmpty({ ...EMPTY_FORM, ptId: 'pt' }, [])).toBe(false)
    expect(isDraftEmpty(EMPTY_FORM, [link])).toBe(false)
  })
})

describe('rekaman draf', () => {
  it('pulang-pergi: isian, Idempotency-Key, berkas (Blob) dan tautan', async () => {
    const rec = toDraftRecord(FORM, [photo('shb-foto-0001'), link], 'shr-abcdef1234567890', 42)
    expect(rec.savedAt).toBe(42)
    const back = fromDraftRecord(rec)
    expect(back?.form).toEqual(FORM)
    expect(back?.idemKey).toBe('shr-abcdef1234567890')
    expect(back?.bukti).toHaveLength(2)
    const f = back!.bukti[0]
    expect(f.kind).toBe('file')
    if (f.kind !== 'file') return
    expect(f).toMatchObject({ key: 'shb-foto-0001', name: 'IMG_1.jpg', size: 4, isImage: true })
    expect(f.file).toBeInstanceOf(File)
    expect(f.file.type).toBe('image/jpeg')
    expect(f.file.lastModified).toBe(1_700_000_000_000)
    expect(new Uint8Array(await f.file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(back!.bukti[1]).toEqual(link)
  })

  it('foto yang masih dikompres tidak ikut disimpan', () => {
    const rec = toDraftRecord(FORM, [photo('shb-foto-0001', 'a.jpg', true), photo('shb-foto-0002', 'b.jpg')], 'shr-abcdef123456')
    expect(rec.bukti.map((b) => b.key)).toEqual(['shb-foto-0002'])
  })

  it('rekaman rusak/asing → null; bukti rusak dilewati satu per satu', () => {
    expect(fromDraftRecord(undefined)).toBeNull()
    expect(fromDraftRecord('teks')).toBeNull()
    expect(fromDraftRecord({ v: 99, form: FORM })).toBeNull()
    expect(fromDraftRecord({ v: 1 })).toBeNull()
    const back = fromDraftRecord({
      v: 1,
      savedAt: 'kemarin',
      form: { kegiatan: 5, deskripsi: 'D', ptId: null, reporterName: 'R', titleKind: 'DIREKTUR', titleField: 'X' },
      idemKey: 'pendek',
      bukti: [
        null,
        { key: 'shb-ok-00001', kind: 'link', url: 'https://a.b', name: '' },
        { key: 'shb-noblob-01', kind: 'file', name: 'a.jpg', blob: 'bukan blob' },
        { key: 'k', kind: 'link', url: 'https://a.b' },
        { key: 'shb-x/../y', kind: 'link', url: 'https://a.b' },
      ],
    })
    expect(back).not.toBeNull()
    expect(back!.form).toEqual({ ...EMPTY_FORM, deskripsi: 'D', reporterName: 'R', titleKind: 'MANAJER', titleField: 'X' })
    expect(back!.idemKey).toBe('')
    expect(back!.savedAt).toBe(0)
    expect(back!.bukti).toEqual([{ key: 'shb-ok-00001', kind: 'link', name: 'https://a.b', url: 'https://a.b' }])
  })
})

describe('createDraftStore (IndexedDB)', () => {
  it('simpan → baca → hapus, per id pengguna', async () => {
    const { factory } = fakeIndexedDB()
    const store = createDraftStore(() => factory)
    expect(await store.get('u1')).toBeNull()
    expect(await store.put('u1', FORM, [photo('shb-foto-0001'), link], 'shr-abcdef123456')).toBe(true)
    expect(await store.put('u2', { ...FORM, kegiatan: 'Lain' }, [], 'shr-zzzzzz123456')).toBe(true)
    const d1 = await store.get('u1')
    expect(d1?.form.kegiatan).toBe(FORM.kegiatan)
    expect(d1?.bukti.map((b) => b.key)).toEqual(['shb-foto-0001', 'shb-tautan-0001'])
    expect((await store.get('u2'))?.form.kegiatan).toBe('Lain')
    await store.clear('u1')
    expect(await store.get('u1')).toBeNull()
    expect((await store.get('u2'))?.form.kegiatan).toBe('Lain')
  })

  it('operasi berurutan sesuai panggilan: put lalu clear (tanpa menunggu) → tidak ada draf', async () => {
    const { factory } = fakeIndexedDB()
    const store = createDraftStore(() => factory)
    void store.put('u1', FORM, [], 'shr-abcdef123456')
    void store.clear('u1')
    expect(await store.get('u1')).toBeNull()
    void store.clear('u1')
    void store.put('u1', FORM, [], 'shr-abcdef123456')
    expect((await store.get('u1'))?.form).toEqual(FORM)
  })

  it('tanpa IndexedDB / akses melempar / gagal dibuka → diam tanpa galat', async () => {
    const stores = [
      createDraftStore(() => null),
      createDraftStore(() => {
        throw new Error('SecurityError')
      }),
      createDraftStore(() => fakeIndexedDB({ failOpen: true }).factory),
    ]
    for (const s of stores) {
      await expect(s.get('u1')).resolves.toBeNull()
      await expect(s.put('u1', FORM, [], 'shr-abcdef123456')).resolves.toBe(false)
      await expect(s.clear('u1')).resolves.toBeUndefined()
    }
  })

  it('id pengguna kosong → tidak menyentuh penyimpanan', async () => {
    const { factory, dbs } = fakeIndexedDB()
    const store = createDraftStore(() => factory)
    expect(await store.put('', FORM, [], 'shr-abcdef123456')).toBe(false)
    expect(await store.get('')).toBeNull()
    expect(dbs.size).toBe(0)
  })
})
