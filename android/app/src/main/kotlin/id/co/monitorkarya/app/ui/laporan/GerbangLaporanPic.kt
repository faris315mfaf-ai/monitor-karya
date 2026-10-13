// Gerbang laporan harian PIC (agen A1 → B2, 13 Okt 2026) — SATU-SATUNYA
// titik baca/tulis layar Laporan harian.
//
// Baca (B2): daring dulu; tiap tarik sukses disimpan ke Room (CacheLayar).
// Saat jaringan gagal, potret terakhir dipakai dan hasilnya membawa
// `tersimpanPada` → layar menampilkan "Luring · data tersimpan HH.MM".
//
// Tulis (B2, keputusan per aksi — android/docs/fase3/B2-OUTBOX-PIC.md §3):
//   tambah/ubah/hapus entri, simpan draf/kirim laporan, unggah bukti →
//     daring dulu; DIANTRE bila gagal jaringan, atau langsung diantre bila
//     laporan yang sama masih punya pesan tertunda (FIFO per laporan: tulisan
//     baru tidak boleh mendahului tulisan lama yang belum sampai).
//   hapus laporan, hapus bukti server, ajukan buka kunci, urungkan →
//     SELALU daring (destruktif / butuh keputusan server seketika).
// 409/422 tidak pernah diantre: tampil seketika (daring) atau menjadi
// "Gagal kirim" final di antrean (luring).
//
// Idempotensi (gelombang E, android/docs/fase3/E-ANDROID.md): setiap tulisan
// yang bisa diantre membawa `Idempotency-Key`. Kunci dibuat SEKALI per aksi
// (entri baru: sekali per Sheet — klik ganda/ulang setelah galat memakai kunci
// yang sama) dan, bila kiriman daring jatuh ke antrean karena galat jaringan,
// pesan antrean menyimpan kunci YANG SAMA dengan badan yang sama: bila server
// sudah commit sebelum koneksi putus, ulangan dari antrean dibalas respons
// pertama — tidak ada entri/bukti ganda, `submittedAt` tidak bergeser.
//
// C5 (13 Okt 2026):
// - T1: id lokal "lokal:<n>" yang TAMBAH-nya sudah sukses diterjemahkan lewat
//   peta id (AntreanOutbox.idServer) sebelum memutuskan daring/antre — bukti
//   atau ubahan dari Sheet yang masih terbuka tidak lagi gagal permanen.
// - S1: hapus entri lokal: belum pernah dicoba → buang pesan antrean (tidak
//   ada yang dikirim); sudah terkirim → DELETE id server; sedang/pernah dicoba
//   (ambigu) → HAPUS diantre di belakang TAMBAH-nya.
// - T4: potret meja dikunci per tanggal WIB nyata; mulai luring hari baru
//   memakai meja hari ini yang dibangun dari potret terakhir (mejaHariBaru).
package id.co.monitorkarya.app.ui.laporan

import id.co.monitorkarya.core.data.outbox.AntreanOutbox
import id.co.monitorkarya.core.data.outbox.IdLokal
import id.co.monitorkarya.core.data.outbox.PesanOutbox
import id.co.monitorkarya.core.data.outbox.StatusKirim
import id.co.monitorkarya.core.data.repo.CacheLayar
import id.co.monitorkarya.core.data.sync.JenisOutbox
import id.co.monitorkarya.core.data.sync.KunciOutbox
import id.co.monitorkarya.core.domain.time.Wib
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.Idempotensi
import id.co.monitorkarya.core.network.api.AuthApi
import id.co.monitorkarya.core.network.api.DailyInputApi
import id.co.monitorkarya.core.network.api.EntriLaporanApi
import id.co.monitorkarya.core.network.api.EvidenceApi
import id.co.monitorkarya.core.network.api.LaporanPicApi
import id.co.monitorkarya.core.network.api.TasksApi
import id.co.monitorkarya.core.network.api.UndoApi
import id.co.monitorkarya.core.network.api.UnlockApi
import id.co.monitorkarya.core.network.dto.DailyInputGetResponse
import id.co.monitorkarya.core.network.dto.DailyInputKirimResponse
import id.co.monitorkarya.core.network.dto.DailyInputRequest
import id.co.monitorkarya.core.network.dto.EntriHariResponse
import id.co.monitorkarya.core.network.dto.EntriSimpanRequest
import id.co.monitorkarya.core.network.dto.PayloadHapusEntri
import id.co.monitorkarya.core.network.dto.UndoRequest
import id.co.monitorkarya.core.network.dto.UnlockCreateRequest
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.HttpException
import retrofit2.Response
import retrofit2.Retrofit

/** Hasil satu panggilan gerbang. */
sealed interface HasilLaporan<out T> {
    /**
     * Berhasil di server; [undoToken] bila route menerbitkan tiket Urungkan.
     * [tersimpanPada] terisi (epoch millis) bila data BACA berasal dari potret
     * Room karena perangkat luring.
     */
    data class Sukses<T>(val data: T, val undoToken: String? = null, val tersimpanPada: Long? = null) : HasilLaporan<T>

    /**
     * Masuk antrean outbox — terkirim otomatis saat daring. [idLokal] = id
     * sementara entri baru ("lokal:<n>") agar bukti bisa langsung dilampirkan.
     */
    data class Antre(
        val pesan: String = PESAN_ANTRE,
        val idLokal: String? = null,
    ) : HasilLaporan<Nothing>

    data class Gagal(val galat: ApiError) : HasilLaporan<Nothing>
}

internal const val PESAN_ANTRE = "Tersimpan di perangkat · menunggu kirim. Terkirim otomatis saat daring."

/** Berkas bukti siap kirim (sudah dikompres bila foto). */
class BerkasBukti(val nama: String, val mime: String, val isi: ByteArray)

class GerbangLaporanPic @Inject constructor(
    retrofit: Retrofit,
    private val dailyInputApi: DailyInputApi,
    private val tasksApi: TasksApi,
    private val evidenceApi: EvidenceApi,
    private val unlockApi: UnlockApi,
    private val undoApi: UndoApi,
    private val authApi: AuthApi,
    private val antrean: AntreanOutbox,
    private val cache: CacheLayar,
) {
    /** Antarmuka tambahan A1 dibuat dari Retrofit tunggal (tanpa menyentuh AppModule). */
    private val entriApi: EntriLaporanApi = retrofit.create(EntriLaporanApi::class.java)
    private val laporanApi: LaporanPicApi = retrofit.create(LaporanPicApi::class.java)

    private var namaSaya: String? = null

    /** Tanggal meja yang dibangun dari potret hari sebelumnya (luring, C5-T4); null = meja nyata. */
    private var hariSintetis: String? = null

    // ------------------------------------------------------------ baca

    /** GET /api/daily-input — meja satu hari ([tanggal] null = hari ini); luring → potret Room. */
    suspend fun meja(tanggal: String?): HasilLaporan<DeskLaporan> {
        val s = DailyInputGetResponse.serializer()
        return when (val h = panggil({ dailyInputApi.meja(tanggal) }) { it }) {
            is HasilLaporan.Sukses -> {
                hariSintetis = null
                cache.simpan(CacheLayar.mejaLaporan(h.data.reportDateKey), s, h.data)
                if (tanggal == null) cache.simpan(CacheLayar.MEJA_LAPORAN_TERAKHIR, s, h.data)
                HasilLaporan.Sukses(h.data.keDesk())
            }
            is HasilLaporan.Gagal -> if (tanggal != null) {
                dariPotret(h, CacheLayar.mejaLaporan(tanggal), s) { it.keDesk() }
            } else {
                mejaHariIniLuring(h)
            }
            is HasilLaporan.Antre -> h
        }
    }

    /**
     * Meja hari ini saat luring (C5-T4): potret tanggal WIB hari ini bila ada;
     * bila belum (mulai luring hari baru), meja hari ini dibangun dari potret
     * hari ini terakhir — BUKAN potret kemarin yang ditampilkan sebagai hari ini.
     */
    private suspend fun mejaHariIniLuring(gagal: HasilLaporan.Gagal): HasilLaporan<DeskLaporan> {
        if (gagal.galat !is ApiError.Jaringan) return gagal
        val s = DailyInputGetResponse.serializer()
        val hariIni = Wib.hariIni()
        cache.ambil(CacheLayar.mejaLaporan(hariIni.toString()), s)?.let {
            hariSintetis = null
            return HasilLaporan.Sukses(it.nilai.keDesk(), tersimpanPada = it.disimpanPada)
        }
        val terakhir = cache.ambil(CacheLayar.MEJA_LAPORAN_TERAKHIR, s) ?: return gagal
        val baru = mejaHariBaru(terakhir.nilai, hariIni, Instant.now()) ?: return gagal
        hariSintetis = baru.reportDateKey
        return HasilLaporan.Sukses(baru.keDesk(), tersimpanPada = terakhir.disimpanPada)
    }

    /** GET /api/tasks?projectId=&date= — entri laporan proyek pada tanggal meja; luring → potret Room. */
    suspend fun entri(projectId: String, tanggalKunci: String): HasilLaporan<EntriHari> {
        val kunci = CacheLayar.entriLaporan(projectId, tanggalKunci)
        return when (val h = panggil({ entriApi.entriHari(projectId, tanggalKunci.ifBlank { null }) }) { it }) {
            is HasilLaporan.Sukses -> {
                cache.simpan(kunci, EntriHariResponse.serializer(), h.data)
                HasilLaporan.Sukses(h.data.keEntriHari())
            }
            is HasilLaporan.Gagal -> {
                val potret = dariPotret(h, kunci, EntriHariResponse.serializer()) { it.keEntriHari() }
                // Meja hari baru (luring) belum punya entri apa pun di perangkat:
                // daftar kosong, entri baru tetap bisa diantre untuk hari ini.
                if (potret is HasilLaporan.Gagal && h.galat is ApiError.Jaringan && tanggalKunci == hariSintetis) {
                    HasilLaporan.Sukses(EntriHariResponse(workDate = tanggalKunci).keEntriHari())
                } else {
                    potret
                }
            }
            is HasilLaporan.Antre -> h
        }
    }

    /** Peta id lokal → id server (Sheet entri baru berganti id begitu TAMBAH terkirim). */
    fun amatiPetaId(): Flow<Map<String, String>> = antrean.amatiPetaId()

    /** Pesan antrean semua laporan harian (difilter per proyek+tanggal di ViewModel). */
    fun amatiAntrean(): Flow<List<PesanOutbox>> = antrean.amatiKunci(KunciOutbox.AWALAN_LAPORAN)

    /** Nama akun (bawaan "Nama pelaksana"); kosong bila gagal dimuat. */
    suspend fun namaPengguna(): String {
        namaSaya?.let { return it }
        val hasil = panggil({ authApi.saya() }) { it.user.name }
        return (hasil as? HasilLaporan.Sukses)?.data.orEmpty().also { if (it.isNotEmpty()) namaSaya = it }
    }

    /** GET /api/evidence/{id} — tautan buka (luar atau bertanda 5 menit). */
    suspend fun urlBukti(id: String): HasilLaporan<String> = panggil({ evidenceApi.buka(id) }) { it.url }

    // ------------------------------------------------------------ tulis yang bisa diantre

    /**
     * Tambah (POST, [idTersimpan] null) atau ubah (PUT) satu entri. [lama]
     * membawa kolom meja kerja yang tidak ada di Sheet (tag, urgensi, jam,
     * subtask, akun PIC) agar tidak hilang saat mengubah. Entri lokal
     * ([idTersimpan] "lokal:<n>") selalu diantre di belakang pesan tambahnya.
     * [kunciTambah] = kunci idempotensi Sheet entri baru (dibuat sekali saat
     * Sheet dibuka) sehingga klik ganda/ulang tidak menggandakan entri.
     */
    suspend fun simpanEntri(
        projectId: String,
        tanggalKunci: String,
        idTersimpanAwal: String?,
        lama: Entri?,
        isian: IsianEntri,
        kunciTambah: String? = null,
    ): HasilLaporan<Entri> {
        // C5-T1: entri lokal yang sudah terkirim → ubah memakai id server.
        val idTersimpan = terjemahkanId(idTersimpanAwal)
        val badan = susunPermintaanEntri(projectId, tanggalKunci, idTersimpan, lama, isian)
        val kunci = KunciOutbox.laporanHarian(projectId, tanggalKunci)
        val baru = idTersimpan == null
        val kunciIdem = kunciAksi(if (baru) kunciTambah else null)
        suspend fun keAntre(): HasilLaporan.Antre {
            val id = antrean.antre(
                if (baru) JenisOutbox.TAMBAH_ENTRI else JenisOutbox.UBAH_ENTRI,
                EntriSimpanRequest.serializer(),
                badan,
                kunci,
                labelAntreEntri(baru, isian.judul),
                kunciIdempotensi = kunciIdem,
            )
            return HasilLaporan.Antre(idLokal = if (baru) IdLokal.dari(id) else idTersimpan)
        }
        if (IdLokal.adalah(idTersimpan) || adaTertunda(kunci)) return keAntre()
        val hasil = if (baru) {
            panggil({ entriApi.tambahEntri(badan, kunciIdem) }) { it.task?.keEntri() ?: badan.keEntriRingkas(it.resourceId) }
        } else {
            panggil({ entriApi.ubahEntri(badan, kunciIdem) }) { it.task?.keEntri() ?: badan.keEntriRingkas(idTersimpan) }
        }
        return when {
            luring(hasil) -> keAntre()
            // R3: ulangan ringkas tanpa task maupun resourceId — tidak bisa dipetakan.
            hasil is HasilLaporan.Sukses && hasil.data == null ->
                HasilLaporan.Gagal(ApiError.Lainnya("Jawaban server tidak dikenali. Muat ulang lalu periksa entrinya."))
            hasil is HasilLaporan.Sukses -> HasilLaporan.Sukses(hasil.data!!, hasil.undoToken, hasil.tersimpanPada)
            hasil is HasilLaporan.Gagal -> hasil
            else -> keAntre()
        }
    }

    /**
     * DELETE /api/tasks?id=&context=HARIAN. Entri lokal (C5-S1/T1):
     * - TAMBAH-nya GAGAL, atau MENUNGGU dan belum pernah dicoba → buang pesan
     *   tambah + penerusnya; tidak ada yang dikirim ke server;
     * - TAMBAH-nya sudah sukses (ada di peta id) → hapus id server seperti biasa;
     * - TAMBAH sedang/pernah dicoba (ambigu, mungkin sudah tersimpan) → HAPUS
     *   diantre di belakangnya (id lokal diganti id server saat terkirim);
     * - tidak di antrean dan tidak di peta → sudah dibuang; tidak ada di server.
     */
    suspend fun hapusEntri(entri: Entri, projectId: String, tanggalKunci: String): HasilLaporan<Unit> {
        val kunci = KunciOutbox.laporanHarian(projectId, tanggalKunci)
        val tertunda = antrean.aktifKunci(kunci)
        var idHapus = entri.id
        if (entri.lokal) {
            val tambah = tertunda.firstOrNull { it.id == entri.idOutbox }
            when {
                tambah != null && tambah.status == StatusKirim.GAGAL -> {
                    antrean.buang(tambah.id)
                    return HasilLaporan.Sukses(Unit)
                }
                tambah != null && antrean.buangBilaBelumDikirim(tambah.id) -> return HasilLaporan.Sukses(Unit)
                tambah != null -> Unit // ambigu: antre HAPUS di belakang TAMBAH
                else -> idHapus = antrean.idServer(entri.id) ?: return HasilLaporan.Sukses(Unit)
            }
        }
        val lokal = IdLokal.adalah(idHapus)
        val kunciIdem = kunciAksi(null)
        suspend fun keAntre(): HasilLaporan.Antre {
            antrean.antre(
                JenisOutbox.HAPUS_ENTRI,
                PayloadHapusEntri.serializer(),
                PayloadHapusEntri(idHapus),
                kunci,
                "Hapus entri “${entri.judul.take(60)}”",
                kunciIdempotensi = kunciIdem,
            )
            return HasilLaporan.Antre()
        }
        if (lokal || antrean.aktifKunci(kunci).isNotEmpty()) return keAntre()
        val hasil = panggil({ tasksApi.hapus(idHapus, "HARIAN", kunciIdem) }) { }
        return if (luring(hasil)) keAntre() else hasil
    }

    /**
     * PUT /api/daily-input — simpan draf atau kirim ke Admin PT. Status,
     * progres, dan bukti dihitung server dari entri (roll-up); yang dikirim
     * hanya gabungan narasi entri. Tanggal sasaran ada di payload (reportDate)
     * sehingga pesan yang baru terkirim esok hari tetap untuk hari yang benar;
     * keterlambatan dinilai server menurut waktu terima.
     */
    suspend fun kirimLaporan(
        projectId: String,
        namaProyek: String,
        tanggalKunci: String,
        aksi: AksiLaporan,
        narasi: NarasiLaporan,
    ): HasilLaporan<DailyInputKirimResponse> {
        val badan = DailyInputRequest(
            projectId = projectId,
            action = aksi.nilai,
            status = "",
            achievementToday = narasi.capaian,
            obstacle = narasi.kendala,
            followUp = narasi.rencana,
            progressPct = 0,
            reportDate = tanggalKunci,
        )
        val kunci = KunciOutbox.laporanHarian(projectId, tanggalKunci)
        val kunciIdem = kunciAksi(null)
        suspend fun keAntre(): HasilLaporan.Antre {
            antrean.antre(
                JenisOutbox.KIRIM_LAPORAN,
                DailyInputRequest.serializer(),
                badan,
                kunci,
                "${if (aksi == AksiLaporan.KIRIM) "Kirim laporan" else "Simpan draf"} $namaProyek · ${tanggalKunciPendek(tanggalKunci)}",
                kunciIdempotensi = kunciIdem,
            )
            return HasilLaporan.Antre(
                pesan = if (aksi == AksiLaporan.KIRIM) {
                    "Laporan menunggu kirim. Terkirim otomatis ke Admin PT saat daring."
                } else {
                    "Draf menunggu kirim. Tersimpan di server saat daring."
                },
            )
        }
        if (adaTertunda(kunci)) return keAntre()
        val hasil = panggil({ laporanApi.kirim(badan, kunciIdem) }) { it }
        return when {
            luring(hasil) -> keAntre()
            hasil is HasilLaporan.Sukses -> hasil.copy(undoToken = hasil.data.undoToken)
            else -> hasil
        }
    }

    /**
     * Unggah bukti ke entri [taskId] (multipart, target TASK). Luring, entri
     * lokal, atau ada pesan tertunda → berkas ditulis ke folder privat aplikasi
     * dan diantre; berkas lokal dihapus setelah terkirim atau dibuang.
     */
    suspend fun unggahBukti(
        taskIdAwal: String,
        berkas: BerkasBukti,
        projectId: String,
        tanggalKunci: String,
    ): HasilLaporan<Bukti?> {
        // C5-T1: bukti untuk entri lokal yang sudah terkirim → langsung ke id server.
        val taskId = terjemahkanId(taskIdAwal) ?: taskIdAwal
        val kunci = KunciOutbox.laporanHarian(projectId, tanggalKunci)
        val kunciIdem = kunciAksi(null)
        suspend fun keAntre(): HasilLaporan<Bukti?> = try {
            antrean.antreBukti(
                taskId,
                berkas.nama,
                berkas.mime,
                berkas.isi,
                kunci,
                "Unggah bukti ${berkas.nama}",
                kunciIdempotensi = kunciIdem,
            )
            HasilLaporan.Antre(pesan = "Bukti tersimpan di perangkat · menunggu kirim.")
        } catch (e: CancellationException) {
            throw e
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
            HasilLaporan.Gagal(ApiError.Lainnya("Bukti tidak dapat disimpan di perangkat. Periksa ruang penyimpanan."))
        }
        if (IdLokal.adalah(taskId) || adaTertunda(kunci)) return keAntre()
        val teks = "text/plain".toMediaType()
        val hasil = panggil({
            evidenceApi.unggah(
                berkas = MultipartBody.Part.createFormData(
                    "file",
                    berkas.nama,
                    berkas.isi.toRequestBody(berkas.mime.toMediaType()),
                ),
                targetType = "TASK".toRequestBody(teks),
                targetId = taskId.toRequestBody(teks),
                kunciIdempotensi = kunciIdem,
            )
        }) { r ->
            // E2E-R2 N2: jawaban unggah dipakai langsung di Sheet — bukti tetap
            // tampil walau muat ulang sesudahnya gagal.
            Bukti(id = r.evidence.id, nama = r.evidence.fileName, mime = r.evidence.mime, ukuran = r.evidence.size, tautan = null)
        }
        return if (luring(hasil)) keAntre() else hasil
    }

    // ------------------------------------------------------------ tulis yang selalu daring

    /**
     * DELETE /api/daily-input — hapus laporan ringkas (entri tetap). Selalu
     * daring; ditolak bila laporan ini masih punya pesan tertunda (hapus tidak
     * boleh mendahului kirim/draf yang belum sampai).
     */
    suspend fun hapusLaporan(projectId: String, tanggalKunci: String): HasilLaporan<Unit> {
        if (adaTertunda(KunciOutbox.laporanHarian(projectId, tanggalKunci))) {
            return HasilLaporan.Gagal(
                ApiError.Lainnya("Masih ada perubahan laporan ini yang menunggu kirim. Tunggu terkirim atau buang dulu, lalu hapus laporan."),
            )
        }
        return daringSaja(panggil({ dailyInputApi.hapus(projectId, tanggalKunci.ifBlank { null }) }) { }, "Hapus laporan")
    }

    /** DELETE /api/evidence/{id} — selalu daring (bukti antre dibuang lewat AntreanOutbox). */
    suspend fun hapusBukti(id: String): HasilLaporan<Unit> {
        idOutboxBukti(id)?.let {
            antrean.buang(it)
            return HasilLaporan.Sukses(Unit)
        }
        return daringSaja(panggil({ evidenceApi.hapus(id) }) { }, "Hapus bukti")
    }

    /** POST /api/unlock-requests — selalu daring (keputusan server, rantai persetujuan). */
    suspend fun ajukanBukaKunci(reportId: String, alasan: String): HasilLaporan<Unit> = daringSaja(
        panggil({ unlockApi.ajukan(UnlockCreateRequest(targetType = "DAILY_REPORT", targetId = reportId, reason = alasan.trim())) }) { },
        "Ajukan buka kunci",
    )

    /** POST /api/undo — pesan server bila berhasil (tiket 15 menit, tidak diantre). */
    suspend fun urungkan(token: String): HasilLaporan<String> =
        daringSaja(panggil({ undoApi.urungkan(UndoRequest(token)) }) { it.message }, "Urungkan")

    // ------------------------------------------------------------ pembantu

    private suspend fun adaTertunda(kunci: String): Boolean = antrean.aktifKunci(kunci).isNotEmpty()

    /** "lokal:<n>" → id server bila TAMBAH-nya sudah sukses; selain itu apa adanya. */
    private suspend fun terjemahkanId(id: String?): String? =
        if (IdLokal.adalah(id)) antrean.idServer(id!!) ?: id else id

    /** Kunci idempotensi satu aksi: [diberikan] (Sheet entri baru) bila sah, selain itu UUID v4 baru. */
    private fun kunciAksi(diberikan: String?): String = diberikan?.takeIf(Idempotensi::sah) ?: Idempotensi.kunciBaru()

    private fun luring(h: HasilLaporan<*>): Boolean = h is HasilLaporan.Gagal && h.galat is ApiError.Jaringan

    /** Aksi yang tidak diantre: galat jaringan diberi kalimat jelas. */
    private fun <T> daringSaja(h: HasilLaporan<T>, aksi: String): HasilLaporan<T> =
        if (luring(h)) HasilLaporan.Gagal(ApiError.Jaringan("$aksi butuh koneksi internet. Coba lagi saat daring.")) else h

    private suspend fun <D, R> dariPotret(
        gagal: HasilLaporan.Gagal,
        kunci: String,
        serializer: kotlinx.serialization.KSerializer<D>,
        peta: (D) -> R,
    ): HasilLaporan<R> {
        if (gagal.galat !is ApiError.Jaringan) return gagal
        val potret = cache.ambil(kunci, serializer) ?: return gagal
        return runCatching { HasilLaporan.Sukses(peta(potret.nilai), tersimpanPada = potret.disimpanPada) }.getOrElse { gagal }
    }

    private suspend inline fun <T, R> panggil(
        crossinline blok: suspend () -> Response<T>,
        crossinline peta: (T) -> R,
    ): HasilLaporan<R> = try {
        val res = blok()
        val isi = res.body()
        when {
            !res.isSuccessful -> HasilLaporan.Gagal(ApiError.dari(HttpException(res)))
            isi == null -> HasilLaporan.Gagal(ApiError.Lainnya("Jawaban server kosong. Muat ulang lalu coba lagi."))
            else -> HasilLaporan.Sukses(peta(isi))
        }
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        HasilLaporan.Gagal(ApiError.dari(e))
    }
}

/** Badan POST/PUT entri — murni agar bisa diuji. */
internal fun susunPermintaanEntri(
    projectId: String,
    tanggalKunci: String,
    idTersimpan: String?,
    lama: Entri?,
    isian: IsianEntri,
): EntriSimpanRequest {
    fun teks(s: String): String? = s.trim().ifEmpty { null }
    val baru = idTersimpan == null
    return EntriSimpanRequest(
        context = "HARIAN",
        title = isian.judul.trim(),
        description = teks(isian.deskripsi),
        picName = teks(isian.pelaksana),
        status = isian.status,
        progressPct = isian.progres.coerceIn(0, 100),
        // Sama dengan web: isian dikirim apa adanya (kosong → null membersihkan kolom).
        obstacle = teks(isian.kendala),
        decisionNeeded = teks(isian.keputusan),
        achievementToday = teks(isian.hasil),
        followUp = teks(isian.rencana),
        needsEscalation = isian.eskalasi,
        projectId = if (baru) projectId else null,
        id = idTersimpan,
        workDate = if (baru) tanggalKunci.ifBlank { null } else null,
        picUserId = lama?.picUserId,
        tags = lama?.tags.orEmpty(),
        urgency = lama?.urgensi,
        startTime = lama?.jamMulai ?: jamKirim(lama?.mulaiIso),
        endTime = lama?.jamSelesai ?: jamKirim(lama?.selesaiIso),
        subtasks = lama?.subtugas.orEmpty(),
    )
}
