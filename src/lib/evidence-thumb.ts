import 'server-only'

/**
 * Thumbnail bukti gambar (Fase 1 PWA, 16 Okt 2026).
 *
 * Saat unggah, gambar (jpeg/png/webp/heic/gif) dibuatkan versi WebP dengan
 * sisi terpanjang 320px — cukup tajam untuk kotak ≤160px di layar 2x — dan
 * disimpan di samping berkas aslinya sebagai `${storageKey}.thumb.webp`.
 * Dashboard dan antrean memintanya lewat `POST /api/evidence/signed` dengan
 * `size: 'thumb'`; lightbox dan galeri besar tetap memakai berkas asli.
 *
 * Pembuatan thumbnail bersifat tambahan: gagal (mis. HEIC yang tidak bisa
 * didekode libvips bawaan sharp, berkas rusak, waktu habis) hanya dicatat dan
 * unggahan tetap berhasil dengan `thumbKey` NULL. Metadata (EXIF/GPS) tidak
 * ikut ke thumbnail karena sharp membuangnya bila tidak diminta.
 *
 * Modul ini tidak mengimpor `./storage` (yang mengimpor modul ini untuk
 * `evidenceThumbKey`); fungsi unggah disuntikkan pemanggil.
 */

/** Sisi terpanjang thumbnail (px). */
export const THUMB_MAX_SIDE = 320
/** Anggaran ukuran thumbnail; kualitas diturunkan bertahap bila terlampaui. */
export const THUMB_TARGET_BYTES = 30 * 1024
/** Urutan kualitas WebP yang dicoba; hasil terakhir dipakai walau masih di atas anggaran. */
export const THUMB_QUALITIES = [70, 55, 40] as const
export const THUMB_MIME = 'image/webp'
export const THUMB_SUFFIX = '.thumb.webp'

/** Batas piksel masukan (≈ foto 48 MP masih lolos) supaya bom dekompresi ditolak. */
const MAX_INPUT_PIXELS = 120_000_000
/** Batas waktu pemrosesan per percobaan kualitas (detik). */
const RENDER_TIMEOUT_SECONDS = 15

const SOURCE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'])
/** Ekstensi kunci penyimpanan yang mungkin punya thumbnail (kunci berakhiran nama berkas asli). */
const SOURCE_KEY_EXT = /\.(jpe?g|png|webp|heic|gif)$/i

/** True bila jenis berkas ini dibuatkan thumbnail saat unggah. */
export function canThumbnail(mime: string | null | undefined): boolean {
  return typeof mime === 'string' && SOURCE_MIME.has(mime)
}

/** Kunci thumbnail untuk satu berkas bukti: `${storageKey}.thumb.webp`. */
export function evidenceThumbKey(storageKey: string): string {
  return `${storageKey}${THUMB_SUFFIX}`
}

/**
 * Kunci thumbnail yang MUNGKIN ada untuk `storageKey` (berkas gambar), atau
 * null bila kunci itu bukan gambar. Dipakai saat menghapus bukti tanpa
 * mengetahui kolom `thumbKey`-nya; menghapus objek yang tidak ada aman.
 */
export function possibleThumbKey(storageKey: string): string | null {
  if (!storageKey || storageKey.endsWith(THUMB_SUFFIX)) return null
  return SOURCE_KEY_EXT.test(storageKey) ? evidenceThumbKey(storageKey) : null
}

type Sharp = (typeof import('sharp'))['default']

let sharpLoader: Promise<Sharp> | null = null

/** sharp dimuat malas: modul rute tetap termuat walau biner sharp tidak tersedia. */
function loadSharp(): Promise<Sharp> {
  if (!sharpLoader) {
    const p = import('sharp').then((m) => m.default)
    sharpLoader = p
    // Gagal memuat tidak disimpan, supaya percobaan berikutnya bisa berhasil.
    p.catch(() => {
      if (sharpLoader === p) sharpLoader = null
    })
  }
  return sharpLoader
}

/** Salinan byte: render berjalan sejajar dengan unggahan asli, jadi tidak berbagi memori dengannya. */
function toBuffer(bytes: ArrayBuffer | Uint8Array): Buffer {
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
}

/**
 * WebP sisi terpanjang ≤320px dari byte gambar: orientasi EXIF dibakar
 * (`rotate()`), tidak diperbesar, frame pertama untuk GIF animasi, tanpa
 * metadata. Kualitas 70 → 55 → 40 sampai ≤30 KB. Melempar bila gagal dekode.
 */
export async function renderThumbnail(bytes: ArrayBuffer | Uint8Array): Promise<Buffer> {
  const sharp = await loadSharp()
  const input = toBuffer(bytes)
  let out = Buffer.alloc(0)
  for (const quality of THUMB_QUALITIES) {
    out = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
      .timeout({ seconds: RENDER_TIMEOUT_SECONDS })
      .rotate()
      .resize(THUMB_MAX_SIDE, THUMB_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer()
    if (out.byteLength <= THUMB_TARGET_BYTES) break
  }
  if (out.byteLength === 0) throw new Error('Thumbnail kosong')
  return out
}

export type ThumbUpload = (key: string, body: Buffer, contentType: string) => Promise<void>

/**
 * Buat dan simpan thumbnail satu bukti. Mengembalikan `thumbKey` bila
 * berhasil, null bila jenisnya bukan gambar atau langkah apa pun gagal
 * (dicatat, tidak dilempar — unggahan utama tidak boleh ikut gagal).
 * `render` dapat dimulai lebih awal oleh pemanggil (paralel dengan unggah asli).
 */
export async function storeEvidenceThumb(
  storageKey: string,
  mime: string,
  upload: ThumbUpload,
  render: Promise<Buffer> | null
): Promise<string | null> {
  if (!render || !canThumbnail(mime)) return null
  const key = evidenceThumbKey(storageKey)
  try {
    const body = await render
    await upload(key, body, THUMB_MIME)
    return key
  } catch (err) {
    console.warn('[evidence-thumb] thumbnail dilewati', storageKey, err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Mulai merender thumbnail bila jenisnya gambar; null bila bukan. Janji yang
 * dikembalikan tidak pernah menjadi penolakan tak tertangani (ditangkap di
 * `storeEvidenceThumb`, atau dibuang bila unggahan asli gagal).
 */
export function startThumbnail(bytes: ArrayBuffer | Uint8Array, mime: string): Promise<Buffer> | null {
  if (!canThumbnail(mime)) return null
  const p = renderThumbnail(bytes)
  // Penanda "sudah ditangani" supaya Node tidak melapor unhandled rejection
  // bila pemanggil batal sebelum menunggu janji ini.
  p.catch(() => {})
  return p
}
