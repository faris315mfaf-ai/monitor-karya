/**
 * Kompresi foto di peramban sebelum diunggah (Fase 1 PWA, 16 Okt 2026).
 *
 * - Sisi terpanjang paling besar 1600 px, JPEG kualitas 0,8.
 * - Orientasi EXIF "dibakar" ke piksel (`createImageBitmap(..., { imageOrientation: 'from-image' })`),
 *   lalu digambar ulang ke kanvas sehingga seluruh metadata (termasuk GPS) hilang.
 * - Hanya JPEG/PNG/WebP/HEIC. GIF (mungkin beranimasi) dan dokumen tidak disentuh.
 * - Gagal dekode/enkode (mis. HEIC di Chrome) → berkas asli dikembalikan apa adanya.
 * - Hasil lebih besar dari asli padahal asli sudah ≤ 1600 px → pakai asli.
 *
 * Bagian kanvas dibungkus `ImageCodec` agar logika keputusan bisa diuji di Node
 * dengan codec tiruan (tests/ui/image-compress.test.ts).
 */

export const COMPRESS_MAX_SIDE = 1600
export const COMPRESS_QUALITY = 0.8
export const COMPRESSIBLE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const

/** Jenis berkas yang dikompres; gif, dokumen, dan jenis tak dikenal dibiarkan. */
export function isCompressible(type: string): boolean {
  return (COMPRESSIBLE_MIME as readonly string[]).includes((type || '').toLowerCase())
}

export type FitSize = { width: number; height: number; scaled: boolean }

/**
 * Ukuran tujuan dengan rasio terjaga: sisi terpanjang ≤ `max`. Gambar yang sudah
 * cukup kecil tidak diperbesar. Dimensi tidak sah → 0×0 (pemanggil memakai berkas asli).
 */
export function fitSize(w: number, h: number, max: number = COMPRESS_MAX_SIDE): FitSize {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { width: 0, height: 0, scaled: false }
  const width = Math.round(w)
  const height = Math.round(h)
  const lim = Math.max(1, Math.floor(max))
  const long = Math.max(width, height)
  if (long <= lim) return { width, height, scaled: false }
  const k = lim / long
  return {
    width: Math.max(1, Math.min(lim, Math.round(width * k))),
    height: Math.max(1, Math.min(lim, Math.round(height * k))),
    scaled: true,
  }
}

/**
 * Pakai asli atau hasil kompres? Hasil dipakai bila tidak lebih besar dari asli,
 * atau bila gambar memang perlu diperkecil (asli > `max`). Selain itu asli.
 */
export function chooseOutput(input: {
  originalBytes: number
  resultBytes: number
  width: number
  height: number
  max?: number
}): 'asli' | 'hasil' {
  if (!(input.resultBytes > 0)) return 'asli'
  const max = input.max ?? COMPRESS_MAX_SIDE
  const needsResize = Math.max(input.width, input.height) > max
  if (input.resultBytes > input.originalBytes && !needsResize) return 'asli'
  return 'hasil'
}

/** "IMG_0012.HEIC" → "IMG_0012.jpg"; tanpa ekstensi → tambah ".jpg". */
export function jpgName(name: string): string {
  const base = (name || '').trim() || 'foto'
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  return `${stem}.jpg`
}

/* ---------- Codec (kanvas) ---------- */

export type DecodedImage = {
  width: number
  height: number
  /** Sumber untuk `drawImage`. */
  source: CanvasImageSource
  close: () => void
}

export type ImageCodec = {
  /** Melempar galat bila tidak bisa didekode. */
  decode: (file: Blob) => Promise<DecodedImage>
  /** Melempar galat bila tidak bisa dienkode; hasil wajib `image/jpeg`. */
  encodeJpeg: (img: DecodedImage, width: number, height: number, quality: number) => Promise<Blob>
}

async function decodeBrowser(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap !== 'function') throw new Error('createImageBitmap tidak tersedia')
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Peramban lama yang menolak opsi: dekode biasa (orientasi bawaan modern = from-image).
    bmp = await createImageBitmap(file)
  }
  return { width: bmp.width, height: bmp.height, source: bmp, close: () => bmp.close() }
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function paint(ctx: Ctx2D, img: DecodedImage, width: number, height: number) {
  // JPEG tanpa kanal alfa: area transparan (PNG/WebP) diberi alas putih, bukan hitam.
  // Ini isi piksel berkas, bukan gaya antarmuka, jadi tidak memakai token tema.
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img.source, 0, 0, width, height)
}

async function encodeBrowser(img: DecodedImage, width: number, height: number, quality: number): Promise<Blob> {
  let blob: Blob | null = null
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (ctx) {
      paint(ctx, img, width, height)
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
    }
  }
  if (!blob) {
    if (typeof document === 'undefined') throw new Error('Kanvas tidak tersedia')
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Kanvas 2D tidak tersedia')
    paint(ctx, img, width, height)
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    canvas.width = 0
    canvas.height = 0
  }
  if (!blob) throw new Error('Enkode JPEG gagal')
  return blob
}

export const browserCodec: ImageCodec = { decode: decodeBrowser, encodeJpeg: encodeBrowser }

/* ---------- Kompres ---------- */

export type CompressResult = {
  file: File
  /** true bila berkas diganti hasil kompres (.jpg). */
  compressed: boolean
}

/**
 * Kompres satu berkas. Tidak pernah melempar galat: kegagalan apa pun →
 * `{ file: aslinya, compressed: false }`.
 */
export async function compressImage(
  file: File,
  opts: { max?: number; quality?: number; codec?: ImageCodec } = {}
): Promise<CompressResult> {
  const original: CompressResult = { file, compressed: false }
  if (!file || !isCompressible(file.type) || !(file.size > 0)) return original
  const max = opts.max ?? COMPRESS_MAX_SIDE
  const quality = opts.quality ?? COMPRESS_QUALITY
  const codec = opts.codec ?? browserCodec
  let img: DecodedImage | null = null
  try {
    img = await codec.decode(file)
    const fit = fitSize(img.width, img.height, max)
    if (!fit.width || !fit.height) return original
    const blob = await codec.encodeJpeg(img, fit.width, fit.height, quality)
    if (!blob || blob.type !== 'image/jpeg') return original
    const pick = chooseOutput({ originalBytes: file.size, resultBytes: blob.size, width: img.width, height: img.height, max })
    if (pick === 'asli') return original
    const out = new File([blob], jpgName(file.name), { type: 'image/jpeg', lastModified: file.lastModified || Date.now() })
    return { file: out, compressed: true }
  } catch {
    return original
  } finally {
    try {
      img?.close()
    } catch {}
  }
}
