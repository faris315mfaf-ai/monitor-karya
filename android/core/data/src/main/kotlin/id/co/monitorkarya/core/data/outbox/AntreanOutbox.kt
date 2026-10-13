// Pintu tulis + baca outbox untuk layar (A1-LURING.md §5 "API outbox").
//
// Pola pakai di ViewModel ("daring dulu, antre saat luring"):
//   1. kirim langsung ke API seperti biasa — 409/422 tampil seketika;
//   2. HANYA bila gagal jaringan (ApiError.Jaringan / HasilKirim.Luring) panggil
//      antre(...) dengan payload LENGKAP (termasuk minggu/tanggal sasaran —
//      pesan bisa terkirim setelah pergantian hari/minggu);
//   3. tampilkan "Menunggu kirim" lewat amati()/amatiKunci() atau composable
//      app/ui/luring/StatusAntrean.
// Jangan mengantre aksi yang harus sinkron (sandi, akun, teruskan, ingatkan) —
// daftar alasan di A1-LURING.md §6.
package id.co.monitorkarya.core.data.outbox

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import id.co.monitorkarya.core.data.db.MkDatabase
import id.co.monitorkarya.core.data.db.OutboxDao
import id.co.monitorkarya.core.data.db.OutboxEntity
import id.co.monitorkarya.core.data.prefs.MkPrefs
import id.co.monitorkarya.core.data.sync.JenisOutbox
import id.co.monitorkarya.core.data.sync.SyncScheduler
import id.co.monitorkarya.core.network.dto.PayloadUnggahBukti
import id.co.monitorkarya.core.network.mkJson
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.KSerializer

/** Status tampil pesan antrean. */
enum class StatusKirim {
    /** "Menunggu kirim" — belum terkirim, akan dicoba otomatis. */
    MENUNGGU,

    /** "Gagal kirim" — server menolak final atau kedaluwarsa; perlu tindakan pengguna. */
    GAGAL,
}

/** Satu pesan antrean untuk UI. */
data class PesanOutbox(
    val id: Long,
    val jenis: String,
    val kunci: String?,
    val label: String,
    val status: StatusKirim,
    /** Pesan server/sebab (GAGAL) atau keterangan percobaan terakhir (MENUNGGU). */
    val pesanGalat: String?,
    val dibuatPada: Long,
    val percobaan: Int,
    /** Badan permintaan apa adanya (B2: layar menumpangkan perubahan tertunda ke tampilan). */
    val payloadJson: String = "",
)

internal fun OutboxEntity.kePesan(): PesanOutbox = PesanOutbox(
    id = id,
    jenis = jenis,
    kunci = kunci,
    label = label ?: jenis,
    // MENGIRIM (klaim pemroses, C5-T2) tampil sebagai "Menunggu kirim".
    status = if (status == OutboxEntity.STATUS_GAGAL) StatusKirim.GAGAL else StatusKirim.MENUNGGU,
    pesanGalat = pesanGalat,
    dibuatPada = dibuatPada,
    percobaan = percobaan,
    payloadJson = payloadJson,
)

@Singleton
class AntreanOutbox @Inject constructor(
    @ApplicationContext private val context: Context,
    db: MkDatabase,
    private val prefs: MkPrefs,
) {
    private val dao = db.outboxDao()
    private val petaDao = db.petaIdLokalDao()
    private val berkas = BerkasAntre(context)
    private val pembuang = PembuangAntrean(dao, berkas)

    /**
     * Masukkan satu tulisan ke antrean lalu jadwalkan pengiriman saat daring.
     *
     * @param jenis salah satu konstanta JenisOutbox (harus dikenal SyncWorker).
     * @param payloadJson badan permintaan apa adanya (mkJson).
     * @param kunci kunci dependensi KunciOutbox; null = mandiri.
     * @param label kalimat tampil, mis. "Serahkan capaian minggu 41".
     * @param kunciIdempotensi (gelombang E) kunci `Idempotency-Key` yang SUDAH
     *   dipakai kiriman daring langsung dengan badan [payloadJson] yang sama
     *   (jatuh ke antrean karena galat jaringan — server mungkin sudah commit);
     *   null = UUID v4 baru. Disimpan di baris dan dikirim sama di setiap percobaan.
     * @return id pesan (urutan FIFO).
     */
    suspend fun antre(
        jenis: String,
        payloadJson: String,
        kunci: String?,
        label: String,
        kunciIdempotensi: String? = null,
    ): Long {
        val id = dao.tambah(
            OutboxEntity(
                jenis = jenis,
                payloadJson = payloadJson,
                dibuatPada = System.currentTimeMillis(),
                kunci = kunci,
                label = label,
                kunciIdempotensi = kunciIdempotensiAntre(kunciIdempotensi),
                // C5-T3: pemilik = uid sesi aktif; pekerja menolak baris milik uid lain.
                pemilikUid = prefs.uidSesi.first(),
            ),
        )
        SyncScheduler.jadwalkanSekaliSaatOnline(context)
        return id
    }

    /** Varian bertipe: [payload] diserialisasi dengan mkJson. */
    suspend fun <T> antre(
        jenis: String,
        serializer: KSerializer<T>,
        payload: T,
        kunci: String?,
        label: String,
        kunciIdempotensi: String? = null,
    ): Long = antre(jenis, mkJson.encodeToString(serializer, payload), kunci, label, kunciIdempotensi)

    /** Semua pesan MENUNGGU + GAGAL, urut FIFO. */
    fun amati(): Flow<List<PesanOutbox>> =
        dao.amatiAktif().map { daftar -> daftar.map { it.kePesan() } }.distinctUntilChanged()

    /** Pesan yang kuncinya diawali [awalan] (mis. KunciOutbox.AWALAN_MINGGUAN). */
    fun amatiKunci(awalan: String): Flow<List<PesanOutbox>> =
        dao.amatiAktif()
            .map { daftar -> daftar.filter { it.kunci?.startsWith(awalan) == true }.map { it.kePesan() } }
            .distinctUntilChanged()

    /** Pengguna meminta kirim ulang pesan GAGAL (mis. setelah buka kunci disetujui). */
    suspend fun ulangi(id: Long) {
        dao.ulangi(id, System.currentTimeMillis())
        SyncScheduler.jadwalkanSekaliSaatOnline(context)
    }

    /**
     * Pengguna membuang satu pesan (GAGAL atau yang tidak jadi dikirim).
     * B2: berkas bukti miliknya ikut dihapus; membuang TAMBAH_ENTRI ikut
     * membuang pesan penerus yang merujuk id lokal entri itu (ubah/hapus/
     * unggah bukti) — tanpa entri asal, pesan itu tidak mungkin terkirim.
     */
    suspend fun buang(id: Long) = pembuang.buang(id)

    /**
     * C5-T1/S1: hapus entri lokal yang BELUM pernah dicoba kirim = buang pesan
     * TAMBAH + semua penerusnya (tidak ada yang dikirim ke server). false bila
     * pesan sedang dikirim (MENGIRIM) atau pernah dicoba (bisa saja sudah
     * tersimpan di server) — pemanggil lalu mengantre HAPUS di belakangnya.
     */
    suspend fun buangBilaBelumDikirim(id: Long): Boolean = pembuang.buangBilaBelumDicoba(id)

    /** id server entri lokal "lokal:<n>" yang TAMBAH-nya sudah sukses (C5-T1); null bila belum. */
    suspend fun idServer(idLokal: String): String? =
        if (IdLokal.adalah(idLokal)) petaDao.idServer(idLokal) else idLokal

    /** Peta id lokal → id server (layar mengganti id Sheet yang masih lokal, C5-T1). */
    fun amatiPetaId(): Flow<Map<String, String>> =
        petaDao.amati().map { l -> l.associate { it.idLokal to it.idServer } }.distinctUntilChanged()

    /** Pesan aktif (MENUNGGU + GAGAL) berkunci tepat [kunci], FIFO. */
    suspend fun aktifKunci(kunci: String): List<PesanOutbox> =
        dao.semuaAktif().filter { it.kunci == kunci }.map { it.kePesan() }

    /**
     * Antre unggah bukti (B2): [isi] (sudah dikompres) ditulis ke folder privat
     * aplikasi, lalu pesan UNGGAH_BUKTI mengacu NAMA berkasnya.
     */
    suspend fun antreBukti(
        taskId: String,
        nama: String,
        mime: String,
        isi: ByteArray,
        kunci: String,
        label: String,
        kunciIdempotensi: String? = null,
    ): Long {
        val lokal = withContext(Dispatchers.IO) { berkas.simpan(isi, nama) }
        val payload = PayloadUnggahBukti(
            taskId = taskId,
            berkasLokal = lokal,
            nama = nama,
            mime = mime,
            ukuran = isi.size.toLong(),
        )
        return try {
            antre(JenisOutbox.UNGGAH_BUKTI, PayloadUnggahBukti.serializer(), payload, kunci, label, kunciIdempotensi)
        } catch (e: CancellationException) {
            berkas.hapus(lokal)
            throw e
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
            berkas.hapus(lokal)
            throw e
        }
    }

    /** Minta putaran kirim sekarang (tombol "Coba lagi"). */
    fun kirimSekarang() {
        SyncScheduler.jadwalkanSekaliSaatOnline(context)
    }
}

/**
 * Pembuangan pesan antrean (dipisah supaya teruji JVM). Membuang TAMBAH_ENTRI
 * ikut membuang semua pesan aktif berkunci sama yang memuat id lokalnya
 * (ubah/hapus/unggah bukti) beserta berkas buktinya.
 */
internal class PembuangAntrean(private val dao: OutboxDao, private val berkas: BerkasAntre) {

    suspend fun buang(id: Long) {
        val pesan = dao.ambil(id) ?: return
        dao.hapus(id)
        hapusBerkasMilik(pesan)
        buangPengikut(pesan)
    }

    /** Hanya bila MENUNGGU + percobaan 0 (atomik di SQL); lihat AntreanOutbox.buangBilaBelumDikirim. */
    suspend fun buangBilaBelumDicoba(id: Long): Boolean {
        val pesan = dao.ambil(id) ?: return false
        if (dao.hapusBilaBelumDicoba(id) == 0) return false
        hapusBerkasMilik(pesan)
        buangPengikut(pesan)
        return true
    }

    private suspend fun buangPengikut(pesan: OutboxEntity) {
        val kunci = pesan.kunci ?: return
        if (pesan.jenis != JenisOutbox.TAMBAH_ENTRI) return
        dao.aktifMemuat(kunci, IdLokal.kutip(IdLokal.dari(pesan.id))).filter { it.id != pesan.id }.forEach { p ->
            dao.hapus(p.id)
            hapusBerkasMilik(p)
        }
    }

    private fun hapusBerkasMilik(p: OutboxEntity) {
        if (p.jenis != JenisOutbox.UNGGAH_BUKTI) return
        runCatching { mkJson.decodeFromString(PayloadUnggahBukti.serializer(), p.payloadJson).berkasLokal }
            .getOrNull()?.let(berkas::hapus)
    }
}
