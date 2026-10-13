// Penyiap bukti unggahan (agen A1, 13 Okt 2026): membaca berkas dari Uri
// pemilih, mengompres foto (sisi panjang ≤2048 px, JPEG kualitas 85) dan
// menolak berkas >20 MB sebelum dikirim (batas server evidence/upload).
// Server mencocokkan ekstensi dengan jenis berkas, jadi foto hasil kompres
// selalu bernama *.jpg dan bermime image/jpeg.
//
// C5 (13 Okt 2026):
// - S2: ukuran dibaca dulu (OpenableColumns.SIZE) dan pembacaan dibatasi
//   20 MB + 1 bait — berkas 200 MB tidak lagi dimuat utuh ke memori (OOM).
// - S3: mime generik (application/octet-stream, kosong) ditebak dari nama;
//   foto (image/apa pun) yang bisa didekode (HEIF dsb.) dikompres ke JPEG dulu,
//   baru ditolak bila tetap bukan jenis yang diizinkan server.
// - S4: Android 8.x (BitmapFactory) menerapkan orientasi EXIF dan mendekode
//   RGB_565 dengan inSampleSize — foto tidak miring dan memori ±setengahnya.
package id.co.monitorkarya.app.ui.laporan

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.ByteArrayOutputStream
import java.io.InputStream
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Sisi panjang maksimal foto bukti (px). */
internal const val SISI_MAKS_FOTO = 2048

/** Kualitas JPEG hasil kompres. */
internal const val KUALITAS_JPEG = 85

/** Batas server per berkas (MAX_EVIDENCE_BYTES, 20 MB). */
internal const val BATAS_BERKAS = 20 * 1024 * 1024

/** Galat penyiapan berkas dengan pesan siap tampil. */
class GalatBerkas(pesan: String) : Exception(pesan)

class PenyiapBukti @Inject constructor(@param:ApplicationContext private val konteks: Context) {

    /** Baca + kompres; melempar [GalatBerkas] dengan pesan ramah. */
    suspend fun siapkan(uri: Uri): BerkasBukti = withContext(Dispatchers.IO) {
        val resolver = konteks.contentResolver
        val namaAsli = namaBerkas(resolver, uri) ?: "bukti"
        val mime = tentukanMime(resolver.getType(uri), namaAsli)
            ?: throw GalatBerkas(PESAN_JENIS)
        if (perluKompres(mime)) {
            kompresFoto(resolver, uri)?.let { isi ->
                return@withContext BerkasBukti(nama = namaJpg(namaAsli), mime = "image/jpeg", isi = isi)
            }
        }
        // Foto yang gagal dikompres dikirim apa adanya hanya bila jenisnya diterima server.
        if (mime !in MIME_DIIZINKAN) throw GalatBerkas(PESAN_JENIS)
        val ukuran = ukuranBerkas(resolver, uri)
        if (ukuran != null && ukuran > BATAS_BERKAS) throw GalatBerkas(PESAN_TERLALU_BESAR)
        val isi = resolver.openInputStream(uri)?.use { bacaTerbatas(it, BATAS_BERKAS) }
            ?: throw GalatBerkas("Berkas tidak dapat dibaca. Pilih ulang berkasnya.")
        if (isi.isEmpty()) throw GalatBerkas("Berkas kosong.")
        BerkasBukti(nama = namaDenganEkstensi(namaAsli, mime), mime = mime, isi = isi)
    }

    /** Foto → JPEG terkompres; null bila gagal didekode (dikirim apa adanya). */
    // OutOfMemoryError (Error, bukan Exception) juga ditangkap: foto raksasa
    // yang tetap gagal didekode tidak boleh menutup paksa aplikasi.
    @Suppress("TooGenericExceptionCaught")
    private fun kompresFoto(resolver: ContentResolver, uri: Uri): ByteArray? = try {
        val bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            // ImageDecoder menerapkan orientasi EXIF dan mendukung HEIC/HEIF.
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver, uri)) { dekoder, info, _ ->
                val (l, t) = ukuranTarget(info.size.width, info.size.height)
                dekoder.setTargetSize(l, t)
                dekoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        } else {
            dekodeLama(resolver, uri)
        }
        bitmap?.let {
            val keluar = ByteArrayOutputStream()
            it.compress(Bitmap.CompressFormat.JPEG, KUALITAS_JPEG, keluar)
            it.recycle()
            keluar.toByteArray().takeIf { b -> b.isNotEmpty() && b.size <= BATAS_BERKAS }
        }
    } catch (e: Exception) {
        null
    } catch (e: OutOfMemoryError) {
        null
    }

    /** API 26–27: BitmapFactory RGB_565 + inSampleSize, lalu skala + putar sesuai EXIF. */
    private fun dekodeLama(resolver: ContentResolver, uri: Uri): Bitmap? {
        val batas = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, batas) }
        val opsi = BitmapFactory.Options().apply {
            inSampleSize = sampelUkuran(batas.outWidth, batas.outHeight)
            inPreferredConfig = Bitmap.Config.RGB_565
        }
        val mentah = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opsi) } ?: return null
        val (l, t) = ukuranTarget(mentah.width, mentah.height)
        val terskala = if (l == mentah.width && t == mentah.height) {
            mentah
        } else {
            Bitmap.createScaledBitmap(mentah, l, t, true).also { if (it !== mentah) mentah.recycle() }
        }
        val derajat = resolver.openInputStream(uri)?.use { derajatExif(it) } ?: 0
        if (derajat == 0) return terskala
        val putar = Matrix().apply { postRotate(derajat.toFloat()) }
        return Bitmap.createBitmap(terskala, 0, 0, terskala.width, terskala.height, putar, true)
            .also { if (it !== terskala) terskala.recycle() }
    }

    private fun derajatExif(masuk: InputStream): Int = runCatching {
        derajatDariOrientasi(
            ExifInterface(masuk).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL),
        )
    }.getOrDefault(0)

    /** Ukuran berkas dari penyedia (null bila tidak diketahui). */
    private fun ukuranBerkas(resolver: ContentResolver, uri: Uri): Long? = runCatching {
        resolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c ->
            if (c.moveToFirst() && !c.isNull(0)) c.getLong(0) else null
        }
    }.getOrNull()?.takeIf { it >= 0 }

    private fun namaBerkas(resolver: ContentResolver, uri: Uri): String? = runCatching {
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    }.getOrNull() ?: uri.lastPathSegment?.substringAfterLast('/')
}

// ------------------------------------------------------------------
// Murni — diuji di app/src/test
// ------------------------------------------------------------------

/** Jenis berkas yang diterima server (ALLOWED_EVIDENCE_MIME). */
internal val MIME_DIIZINKAN: Map<String, List<String>> = mapOf(
    "image/jpeg" to listOf("jpg", "jpeg"),
    "image/png" to listOf("png"),
    "image/webp" to listOf("webp"),
    "image/heic" to listOf("heic"),
    "image/gif" to listOf("gif"),
    "application/pdf" to listOf("pdf"),
    "application/msword" to listOf("doc"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document" to listOf("docx"),
    "application/vnd.ms-excel" to listOf("xls"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" to listOf("xlsx"),
    "text/plain" to listOf("txt"),
    "text/csv" to listOf("csv"),
)

internal const val PESAN_JENIS = "Jenis berkas ini tidak diizinkan. Gunakan foto, PDF, dokumen Office, atau teks."
internal const val PESAN_TERLALU_BESAR = "Ukuran berkas melebihi 20 MB."

/**
 * Mime efektif (C5-S3): mime penyedia bila spesifik; mime generik
 * (octet-stream/binary/kosong) ditebak dari nama. Foto "image/..." di luar daftar
 * (mis. image/heif) tetap dikembalikan supaya dikompres ke JPEG lebih dulu.
 * null = pasti ditolak.
 */
internal fun tentukanMime(dariPenyedia: String?, nama: String): String? {
    val m = dariPenyedia?.lowercase()?.substringBefore(';')?.trim()
    val generik = m.isNullOrEmpty() || m == "application/octet-stream" || m == "application/binary" || m == "*/*"
    val efektif = if (generik) tebakMime(nama) else m
    return efektif?.takeIf { it in MIME_DIIZINKAN || it.startsWith("image/") }
}

/**
 * Baca paling banyak [batas] bait (C5-S2); lebih dari itu → [GalatBerkas]
 * TANPA memuat sisa berkas ke memori.
 */
internal fun bacaTerbatas(masuk: InputStream, batas: Int): ByteArray {
    val keluar = ByteArrayOutputStream()
    val penyangga = ByteArray(64 * 1024)
    var total = 0L
    while (true) {
        val n = masuk.read(penyangga)
        if (n < 0) break
        total += n
        if (total > batas) throw GalatBerkas(PESAN_TERLALU_BESAR)
        keluar.write(penyangga, 0, n)
    }
    return keluar.toByteArray()
}

/** Derajat putar dari nilai ExifInterface.TAG_ORIENTATION (cermin diabaikan). */
internal fun derajatDariOrientasi(orientasi: Int): Int = when (orientasi) {
    6, 7 -> 90 // ORIENTATION_ROTATE_90, TRANSVERSE
    3, 4 -> 180 // ORIENTATION_ROTATE_180, FLIP_VERTICAL
    8, 5 -> 270 // ORIENTATION_ROTATE_270, TRANSPOSE
    else -> 0
}

/** Foto yang dikompres; GIF dibiarkan (animasi). */
internal fun perluKompres(mime: String): Boolean = mime.startsWith("image/") && mime != "image/gif"

/** Mime dari ekstensi bila resolver tidak tahu. */
internal fun tebakMime(nama: String): String? {
    val ext = nama.substringAfterLast('.', "").lowercase()
    return MIME_DIIZINKAN.entries.firstOrNull { ext in it.value }?.key
}

/** Ukuran target dengan sisi panjang ≤ [maks], rasio dipertahankan; tidak memperbesar. */
internal fun ukuranTarget(lebar: Int, tinggi: Int, maks: Int = SISI_MAKS_FOTO): Pair<Int, Int> {
    if (lebar <= 0 || tinggi <= 0) return lebar to tinggi
    val panjang = maxOf(lebar, tinggi)
    if (panjang <= maks) return lebar to tinggi
    val skala = maks.toDouble() / panjang
    return maxOf(1, Math.round(lebar * skala).toInt()) to maxOf(1, Math.round(tinggi * skala).toInt())
}

/** inSampleSize pangkat dua terbesar yang masih menyisakan sisi panjang ≥ [maks]. */
internal fun sampelUkuran(lebar: Int, tinggi: Int, maks: Int = SISI_MAKS_FOTO): Int {
    var sampel = 1
    val panjang = maxOf(lebar, tinggi)
    while (panjang / (sampel * 2) >= maks) sampel *= 2
    return sampel
}

/** "IMG_001.HEIC" → "IMG_001.jpg". */
internal fun namaJpg(nama: String): String {
    val dasar = nama.substringBeforeLast('.', nama).ifBlank { "bukti" }
    return "$dasar.jpg"
}

/** Pastikan ekstensi cocok dengan mime (server menolak yang tidak sesuai). */
internal fun namaDenganEkstensi(nama: String, mime: String): String {
    val sah = MIME_DIIZINKAN[mime] ?: return nama
    val ext = nama.substringAfterLast('.', "").lowercase()
    return if (ext in sah) nama else "${nama.substringBeforeLast('.', nama).ifBlank { "bukti" }}.${sah.first()}"
}
