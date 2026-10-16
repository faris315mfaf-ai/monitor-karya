import { describe, expect, it, vi } from 'vitest'

/**
 * Kompresi foto di peramban (Fase 1 PWA, docs/zcode/KONTRAK-FASE1-PWA.md bagian A):
 *  - fitSize: sisi terpanjang ≤ 1600, rasio terjaga, tidak memperbesar;
 *  - keputusan pakai asli atau hasil;
 *  - compressImage dengan codec tiruan (kanvas tidak ada di Node): jenis yang
 *    dilewati, gagal dekode → asli, nama .jpg, ukuran yang diminta ke enkoder.
 */

import {
  COMPRESS_MAX_SIDE,
  COMPRESS_QUALITY,
  chooseOutput,
  compressImage,
  fitSize,
  isCompressible,
  jpgName,
  type DecodedImage,
  type ImageCodec,
} from '@/lib/image-compress'

function photo(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type, lastModified: 1_700_000_000_000 })
}

function codec(dim: { width: number; height: number }, outBytes: number, outType = 'image/jpeg') {
  const close = vi.fn()
  const encodeCalls: { width: number; height: number; quality: number }[] = []
  const c: ImageCodec = {
    decode: vi.fn(async () => ({ ...dim, source: {} as CanvasImageSource, close }) satisfies DecodedImage),
    encodeJpeg: vi.fn(async (_img: DecodedImage, width: number, height: number, quality: number) => {
      encodeCalls.push({ width, height, quality })
      return new Blob([new Uint8Array(outBytes)], { type: outType })
    }),
  }
  return { c, close, encodeCalls }
}

describe('fitSize', () => {
  it('lanskap 4032×3024 → 1600×1200', () => {
    expect(fitSize(4032, 3024)).toEqual({ width: 1600, height: 1200, scaled: true })
  })

  it('potret 3024×4032 → 1200×1600', () => {
    expect(fitSize(3024, 4032)).toEqual({ width: 1200, height: 1600, scaled: true })
  })

  it('sudah kecil atau tepat 1600 → tidak diperbesar/diubah', () => {
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600, scaled: false })
    expect(fitSize(1600, 900)).toEqual({ width: 1600, height: 900, scaled: false })
  })

  it('panorama ekstrem: sisi pendek minimal 1 px', () => {
    expect(fitSize(20000, 3)).toEqual({ width: 1600, height: 1, scaled: true })
  })

  it('batas lain bisa diberikan; dimensi tidak sah → 0×0', () => {
    expect(fitSize(1000, 500, 320)).toEqual({ width: 320, height: 160, scaled: true })
    expect(fitSize(0, 100)).toEqual({ width: 0, height: 0, scaled: false })
    expect(fitSize(Number.NaN, 100).width).toBe(0)
    expect(fitSize(-5, 100).width).toBe(0)
  })

  it('bawaan sesuai kontrak: 1600 px, kualitas 0,8', () => {
    expect(COMPRESS_MAX_SIDE).toBe(1600)
    expect(COMPRESS_QUALITY).toBe(0.8)
  })
})

describe('chooseOutput (pakai asli atau hasil)', () => {
  it('hasil lebih kecil → hasil', () => {
    expect(chooseOutput({ originalBytes: 3_000_000, resultBytes: 400_000, width: 4032, height: 3024 })).toBe('hasil')
    expect(chooseOutput({ originalBytes: 300_000, resultBytes: 200_000, width: 1200, height: 900 })).toBe('hasil')
  })

  it('hasil lebih besar dan asli sudah ≤ 1600 px → asli', () => {
    expect(chooseOutput({ originalBytes: 100_000, resultBytes: 150_000, width: 1200, height: 900 })).toBe('asli')
    expect(chooseOutput({ originalBytes: 100_000, resultBytes: 150_000, width: 1600, height: 1600 })).toBe('asli')
  })

  it('hasil lebih besar tetapi asli > 1600 px → tetap hasil (ukuran piksel wajib turun)', () => {
    expect(chooseOutput({ originalBytes: 100_000, resultBytes: 150_000, width: 3000, height: 2000 })).toBe('hasil')
  })

  it('hasil kosong → asli', () => {
    expect(chooseOutput({ originalBytes: 100, resultBytes: 0, width: 3000, height: 2000 })).toBe('asli')
  })
})

describe('jpgName & isCompressible', () => {
  it('ekstensi diganti .jpg', () => {
    expect(jpgName('IMG_0012.HEIC')).toBe('IMG_0012.jpg')
    expect(jpgName('foto.lapangan.png')).toBe('foto.lapangan.jpg')
    expect(jpgName('tanpa-ekstensi')).toBe('tanpa-ekstensi.jpg')
    expect(jpgName('.tersembunyi')).toBe('.tersembunyi.jpg')
    expect(jpgName('')).toBe('foto.jpg')
  })

  it('hanya jpeg/png/webp/heic; gif & dokumen tidak disentuh', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'IMAGE/JPEG']) expect(isCompressible(t)).toBe(true)
    for (const t of ['image/gif', 'application/pdf', 'text/plain', '', 'image/svg+xml']) expect(isCompressible(t)).toBe(false)
  })
})

describe('compressImage', () => {
  it('foto besar: dikecilkan ke 1600 px, JPEG 0,8, nama .jpg, bitmap ditutup', async () => {
    const { c, close, encodeCalls } = codec({ width: 4032, height: 3024 }, 450_000)
    const src = photo('IMG_1.HEIC', 'image/heic', 3_000_000)
    const out = await compressImage(src, { codec: c })
    expect(out.compressed).toBe(true)
    expect(out.file.name).toBe('IMG_1.jpg')
    expect(out.file.type).toBe('image/jpeg')
    expect(out.file.size).toBe(450_000)
    expect(out.file.lastModified).toBe(src.lastModified)
    expect(encodeCalls).toEqual([{ width: 1600, height: 1200, quality: 0.8 }])
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('foto kecil yang hasilnya lebih besar → berkas asli utuh', async () => {
    const { c, close } = codec({ width: 640, height: 480 }, 90_000)
    const src = photo('kecil.jpg', 'image/jpeg', 60_000)
    const out = await compressImage(src, { codec: c })
    expect(out).toEqual({ file: src, compressed: false })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('foto kecil yang hasilnya lebih kecil → hasil (metadata/GPS ikut hilang)', async () => {
    const { c } = codec({ width: 1200, height: 900 }, 200_000)
    const out = await compressImage(photo('a.png', 'image/png', 900_000), { codec: c })
    expect(out.compressed).toBe(true)
    expect(out.file.name).toBe('a.jpg')
  })

  it('gagal dekode (mis. HEIC di Chrome) → asli, tanpa galat', async () => {
    const c: ImageCodec = {
      decode: vi.fn(async () => {
        throw new Error('format tidak didukung')
      }),
      encodeJpeg: vi.fn(),
    }
    const src = photo('IMG_2.heic', 'image/heic', 2_000_000)
    await expect(compressImage(src, { codec: c })).resolves.toEqual({ file: src, compressed: false })
    expect(c.encodeJpeg).not.toHaveBeenCalled()
  })

  it('gagal enkode atau enkoder memberi bukan JPEG → asli, bitmap tetap ditutup', async () => {
    const close = vi.fn()
    const c: ImageCodec = {
      decode: async () => ({ width: 3000, height: 2000, source: {} as CanvasImageSource, close }),
      encodeJpeg: async () => {
        throw new Error('kanvas habis memori')
      },
    }
    const src = photo('b.jpg', 'image/jpeg', 2_000_000)
    expect(await compressImage(src, { codec: c })).toEqual({ file: src, compressed: false })
    expect(close).toHaveBeenCalledTimes(1)

    const png = codec({ width: 3000, height: 2000 }, 10_000, 'image/png')
    expect((await compressImage(src, { codec: png.c })).compressed).toBe(false)
  })

  it('gif, dokumen, dan berkas kosong tidak didekode sama sekali', async () => {
    const { c } = codec({ width: 3000, height: 2000 }, 10)
    for (const f of [photo('a.gif', 'image/gif', 5000), photo('a.pdf', 'application/pdf', 5000), photo('k.jpg', 'image/jpeg', 0)]) {
      expect(await compressImage(f, { codec: c })).toEqual({ file: f, compressed: false })
    }
    expect(c.decode).not.toHaveBeenCalled()
  })

  it('tanpa codec tiruan di Node (tanpa createImageBitmap) → asli', async () => {
    const src = photo('c.jpg', 'image/jpeg', 1000)
    expect(await compressImage(src)).toEqual({ file: src, compressed: false })
  })
})
