// Bangkitkan logo & ikon aplikasi dari logo PT. BIKE Tbk (28 Okt 2026).
//
//   node scripts/buat-ikon-merek.mjs <logo-sumber.png>
//
// Sumber: PNG berlatar transparan. Hasil:
//  - public/brand/pt-bike-logo.png  logo terpangkas (transparan) — halaman masuk & layar pembuka
//  - public/favicon.png             ikon tab peramban (transparan, 256 px)
//  - public/icon-192.png, icon-512.png            ikon PWA (latar putih)
//  - public/icon-maskable-192.png, -512.png       ikon maskable (logo di zona aman 80%)
//  - public/apple-touch-icon.png                  ikon layar utama iOS (latar putih, buram)
import sharp from 'sharp'

const sumber = process.argv[2]
if (!sumber) {
  console.error('Pakai: node scripts/buat-ikon-merek.mjs <logo-sumber.png>')
  process.exit(1)
}

const PUTIH = { r: 255, g: 255, b: 255, alpha: 1 }
const BENING = { r: 0, g: 0, b: 0, alpha: 0 }

// Pangkas ruang kosong transparan di sekeliling logo.
const terpangkas = await sharp(sumber).ensureAlpha().trim({ threshold: 10 }).png().toBuffer()
const meta = await sharp(terpangkas).metadata()
console.log('logo terpangkas', meta.width, '×', meta.height)

await sharp(terpangkas)
  .extend({ top: 8, bottom: 8, left: 8, right: 8, background: BENING })
  .png({ compressionLevel: 9 })
  .toFile('public/brand/pt-bike-logo.png')

/** Logo di tengah kanvas persegi; `porsi` = lebar logo terhadap sisi kanvas. */
async function persegi(sisi, porsi, latar, tujuan) {
  const lebar = Math.round(sisi * porsi)
  const logo = await sharp(terpangkas).resize({ width: lebar, fit: 'inside' }).png().toBuffer()
  const m = await sharp(logo).metadata()
  await sharp({ create: { width: sisi, height: sisi, channels: 4, background: latar } })
    .composite([{ input: logo, left: Math.round((sisi - m.width) / 2), top: Math.round((sisi - m.height) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(tujuan)
  console.log('tersimpan', tujuan)
}

await persegi(256, 0.96, BENING, 'public/favicon.png')
await persegi(192, 0.84, PUTIH, 'public/icon-192.png')
await persegi(512, 0.84, PUTIH, 'public/icon-512.png')
// Maskable: launcher memotong ke lingkaran/squircle; isi wajib di lingkaran 80% → lebar logo ≤ 68%.
await persegi(192, 0.68, PUTIH, 'public/icon-maskable-192.png')
await persegi(512, 0.68, PUTIH, 'public/icon-maskable-512.png')
// iOS mengabaikan transparansi (jadi hitam) → latar putih penuh.
await persegi(180, 0.82, PUTIH, 'public/apple-touch-icon.png')
