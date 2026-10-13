// Satu sumber kotak masuk (D1, S2 di docs/fase3/C1-PERBAIKAN.md). Ikon Pesan
// (:feature:pesan) dan lonceng (:feature:notifikasi) membaca data yang SAMA
// dari server — GET /api/notifications?inbox=1 → {unread, items[30]} dan
// PATCH {ids ≤200} | {all:true} (src/app/api/notifications/route.ts). Dulu
// masing-masing punya API + angka sendiri sehingga lencana bisa berbeda;
// kini keduanya mengamati [keadaan] repo @Singleton ini, tanpa dependensi
// silang antar modul fitur.
//
// Balapan (warisan C1-S5, kini berlaku lintas dua pengamat):
// - tiap muat bernomor; respons dari muat yang dimulai SEBELUM muat yang
//   sudah terbit dibuang (respons basi tidak menimpa yang lebih baru);
// - tanda baca lokal tetap diterapkan di atas hasil server sampai ada muat
//   yang DIMULAI setelah PATCH-nya selesai.
// - generasi sesi (C4 P1-3): reset() menaikkan [generasi] dan membatalkan
//   panggilan GET yang masih berjalan; respons atau PATCH yang dimulai di
//   generasi lama (akun sebelumnya) tidak pernah terbit ke sesi berikutnya.
package id.co.monitorkarya.core.data.repo

import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.api.NotificationsApi
import id.co.monitorkarya.core.network.dto.InboxItemDto
import id.co.monitorkarya.core.network.dto.TandaiBacaRequest
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import retrofit2.HttpException
import retrofit2.Response

/** Potret kotak masuk yang dibagi ikon Pesan dan lonceng. */
data class KotakMasuk(
    val belumDibaca: Int = 0,
    val items: List<InboxItemDto> = emptyList(),
    /** Sudah pernah termuat dari server di sesi ini. */
    val termuat: Boolean = false,
)

@Singleton
class KotakMasukRepo @Inject constructor(
    private val api: NotificationsApi,
) {
    private val _keadaan = MutableStateFlow(KotakMasuk())

    /** Satu-satunya sumber daftar + jumlah belum dibaca. */
    val keadaan: StateFlow<KotakMasuk> = _keadaan.asStateFlow()

    private val _belumDibaca = MutableStateFlow(0)

    /** Jumlah belum dibaca (lencana Pesan dan lonceng) — selalu = keadaan.belumDibaca. */
    val belumDibaca: StateFlow<Int> = _belumDibaca.asStateFlow()

    private val kunci = Any()

    /** id (atau [SEMUA]) → versi saat PATCH selesai; null = PATCH masih jalan. */
    private val tandaLokal = mutableMapOf<String, Long?>()
    private var versiTanda = 0L
    private var nomorMuat = 0L
    private var nomorTerbit = 0L

    /** Generasi sesi; naik setiap [reset] (keluar akun / sesi baru). */
    private var generasi = 0L

    /** GET yang sedang berjalan — dibatalkan saat [reset]. */
    private val berjalan = mutableSetOf<Deferred<*>>()

    /** Waktu monotonik (ms) terbitnya hasil server terakhir; 0 = belum ada di sesi ini. */
    private var terakhirTerbitMs = 0L

    /** Jam monotonik (ms); dapat diganti di uji. */
    internal var jam: () -> Long = { System.nanoTime() / 1_000_000 }

    /**
     * Keluar akun / sesi baru: jangan wariskan daftar maupun angka akun sebelumnya.
     * Muat yang masih berjalan dibatalkan, dan respons apa pun dari generasi lama
     * dibuang (tidak terbit) walau sempat tiba setelah reset.
     */
    fun reset() {
        val batalkan = synchronized(kunci) {
            generasi += 1
            tandaLokal.clear()
            nomorMuat += 1
            nomorTerbit = nomorMuat
            terakhirTerbitMs = 0L
            terbitkan(KotakMasuk())
            berjalan.toList().also { berjalan.clear() }
        }
        batalkan.forEach { it.cancel() }
    }

    /**
     * Tarik berkala bersama (C4 P3-1): ikon Pesan dan lonceng sama-sama menarik
     * tiap 60 detik; panggilan ini dilewati (mengembalikan keadaan kini) bila hasil
     * server terakhir masih lebih muda dari [selangMs] atau muat lain sedang berjalan,
     * sehingga dua poller hanya menghasilkan ±1 permintaan per menit.
     * Muat paksa (Sheet dibuka, tarik-segarkan) tetap lewat [muat].
     */
    suspend fun muatBerkala(selangMs: Long = SELANG_BERKALA_MS): HasilBaca<KotakMasuk> {
        val lewati = synchronized(kunci) {
            berjalan.isNotEmpty() ||
                (_keadaan.value.termuat && terakhirTerbitMs > 0L && jam() - terakhirTerbitMs < selangMs)
        }
        return if (lewati) HasilBaca.Sukses(_keadaan.value) else muat()
    }

    /** Tarik 30 pesan terbaru + jumlah belum dibaca. */
    suspend fun muat(): HasilBaca<KotakMasuk> {
        val (nomor, versiMulai, gen) = synchronized(kunci) { Triple(++nomorMuat, versiTanda, generasi) }
        val res = try {
            coroutineScope {
                val panggilan = async { api.kotakMasuk() }
                val sah = synchronized(kunci) { (generasi == gen).also { if (it) berjalan += panggilan } }
                if (!sah) panggilan.cancel()
                try {
                    panggilan.await()
                } finally {
                    synchronized(kunci) { berjalan -= panggilan }
                }
            }
        } catch (e: CancellationException) {
            // Dibatalkan oleh reset() sementara pemanggil masih hidup: keadaan kini (sesi baru).
            if (bergantiSesi(gen) && currentCoroutineContext().isActive) return HasilBaca.Sukses(_keadaan.value)
            throw e
        } catch (e: Exception) {
            if (bergantiSesi(gen)) return HasilBaca.Sukses(_keadaan.value)
            return HasilBaca.Gagal(ApiError.dari(e).pesanTampil())
        }
        if (bergantiSesi(gen)) return HasilBaca.Sukses(_keadaan.value)
        if (!res.isSuccessful) return HasilBaca.Gagal(ApiError.dari(HttpException(res)).pesanTampil())
        // 2xx tanpa badan bukan "HTTP 200" (C1-R12).
        val isi = res.body() ?: return HasilBaca.Gagal(PESAN_KOSONG)
        synchronized(kunci) {
            // Respons milik sesi sebelumnya (akun lain): jangan pernah terbit.
            if (generasi != gen) return HasilBaca.Sukses(_keadaan.value)
            // Muat yang lebih baru sudah terbit: respons ini basi, pakai keadaan kini.
            if (nomor < nomorTerbit) return HasilBaca.Sukses(_keadaan.value)
            nomorTerbit = nomor
            // PATCH yang selesai sebelum muat ini dimulai sudah tercermin di server.
            tandaLokal.entries.removeAll { (_, v) -> v != null && v <= versiMulai }
            val server = KotakMasuk(belumDibaca = isi.unread, items = isi.items, termuat = true)
            val gabung = when {
                SEMUA in tandaLokal -> server.tandaiSemua()
                tandaLokal.isNotEmpty() -> server.tandai(tandaLokal.keys)
                else -> server
            }
            terakhirTerbitMs = jam().coerceAtLeast(1L)
            terbitkan(gabung)
            return HasilBaca.Sukses(gabung)
        }
    }

    /**
     * Tandai dibaca ([ids] null = semua). Optimistis: [keadaan] langsung
     * berubah; id dipotong ≤200 per PATCH (batas server). Bila server
     * menolak, tanda lokal dilepas dan daftar dimuat ulang dari server, lalu
     * pesan galat dikembalikan.
     */
    suspend fun tandai(ids: List<String>?): HasilBaca<Int> {
        val potongan: List<List<String>?> = if (ids == null) {
            listOf(null)
        } else {
            ids.distinct().chunked(BATAS_IDS).ifEmpty { return HasilBaca.Sukses(0) }
        }
        val gen = synchronized(kunci) {
            if (ids == null) {
                tandaLokal[SEMUA] = null
                terbitkan(_keadaan.value.tandaiSemua())
            } else {
                ids.forEach { tandaLokal[it] = null }
                terbitkan(_keadaan.value.tandai(ids.toSet()))
            }
            generasi
        }
        var ditandai = 0
        for (bagian in potongan) {
            val kunciTanda = bagian?.toSet() ?: setOf(SEMUA)
            val badan = if (bagian == null) TandaiBacaRequest(all = true) else TandaiBacaRequest(ids = bagian)
            val galat = try {
                val res = api.tandaiBaca(badan)
                if (res.isSuccessful) {
                    ditandai += res.body()?.marked ?: 0
                    null
                } else {
                    ApiError.dari(HttpException(res)).pesanTampil()
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                ApiError.dari(e).pesanTampil()
            }
            // Sesi berganti selama PATCH: tanda akun lama tidak boleh menempel ke sesi baru.
            if (bergantiSesi(gen)) return HasilBaca.Sukses(ditandai)
            if (galat != null) {
                // Gagal: kembalikan ke keadaan server agar lencana tidak berbohong.
                synchronized(kunci) { kunciTanda.forEach { tandaLokal.remove(it) } }
                muat()
                return HasilBaca.Gagal(galat)
            }
            synchronized(kunci) {
                if (generasi != gen) return HasilBaca.Sukses(ditandai)
                versiTanda += 1
                kunciTanda.forEach { tandaLokal[it] = versiTanda }
            }
        }
        return HasilBaca.Sukses(ditandai)
    }

    private fun bergantiSesi(gen: Long): Boolean = synchronized(kunci) { generasi != gen }

    private fun terbitkan(k: KotakMasuk) {
        _keadaan.value = k
        _belumDibaca.value = k.belumDibaca
    }

    private fun KotakMasuk.tandai(ids: Set<String>): KotakMasuk {
        val kini = Instant.now().toString()
        var turun = 0
        val baru = items.map { n ->
            if (n.readAt == null && n.id in ids) {
                turun++
                n.copy(readAt = kini)
            } else {
                n
            }
        }
        return copy(items = baru, belumDibaca = (belumDibaca - turun).coerceAtLeast(0))
    }

    private fun KotakMasuk.tandaiSemua(): KotakMasuk {
        val kini = Instant.now().toString()
        return copy(items = items.map { if (it.readAt == null) it.copy(readAt = kini) else it }, belumDibaca = 0)
    }

    companion object {
        /** Batas server PATCH /api/notifications: maksimal 200 id per panggilan. */
        const val BATAS_IDS = 200
        const val PESAN_KOSONG = "Jawaban server kosong. Coba lagi."

        /** Umur hasil yang masih dianggap segar oleh [muatBerkala] (poller 60 detik). */
        const val SELANG_BERKALA_MS = 45_000L
        private const val SEMUA = "*"
    }
}
