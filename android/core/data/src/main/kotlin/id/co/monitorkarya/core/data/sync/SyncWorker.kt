// Pekerja sinkronisasi latar (Rancangan §4; A1-LURING.md §2–3): satu putaran
// penuh — antarkan outbox (FIFO per kunci, kedaluwarsa 7 hari → GAGAL), lalu
// tarik proyek + laporan + tugas hari ini ke Room. Dijadwalkan SyncScheduler
// (sekali + berkala) dengan batasan jaringan; Result.retry hanya bila outbox
// masih punya kegagalan sementara — kegagalan tarik cukup ditunggu jadwal
// berkala berikutnya.
//
// Dependensi yang disuntik hanya yang terikat di AppModule (MkDatabase,
// Retrofit, MkPrefs, MkAuthStore); DAO dan API dibangun dari keduanya.
package id.co.monitorkarya.core.data.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import id.co.monitorkarya.core.data.db.MkDatabase
import id.co.monitorkarya.core.data.db.OutboxEntity
import id.co.monitorkarya.core.data.outbox.BerkasAntre
import id.co.monitorkarya.core.data.outbox.OutboxProsesor
import id.co.monitorkarya.core.data.outbox.PengirimLaporanPic
import id.co.monitorkarya.core.data.outbox.headerIdempotensi
import id.co.monitorkarya.core.data.prefs.MkPrefs
import id.co.monitorkarya.core.data.repo.HasilBaca
import id.co.monitorkarya.core.data.repo.HasilKirim
import id.co.monitorkarya.core.data.repo.LaporanRepo
import id.co.monitorkarya.core.data.repo.ProyekRepo
import id.co.monitorkarya.core.data.repo.TugasRepo
import id.co.monitorkarya.core.data.repo.tulisApi
import id.co.monitorkarya.core.domain.time.Wib
import id.co.monitorkarya.core.network.api.DailyInputApi
import id.co.monitorkarya.core.network.api.DailyReportsApi
import id.co.monitorkarya.core.network.api.EntriLaporanApi
import id.co.monitorkarya.core.network.api.EvidenceApi
import id.co.monitorkarya.core.network.api.ProjectsApi
import id.co.monitorkarya.core.network.MkAuthStore
import id.co.monitorkarya.core.network.api.TasksApi
import id.co.monitorkarya.core.network.api.WeeklyInputApi
import id.co.monitorkarya.core.network.dto.DailyInputRequest
import id.co.monitorkarya.core.network.dto.TaskSaveRequest
import id.co.monitorkarya.core.network.dto.WeeklyAksiRequest
import id.co.monitorkarya.core.network.dto.WeeklyItemSaveRequest
import id.co.monitorkarya.core.network.mkJson
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.Retrofit

/**
 * Satu putaran sinkronisasi:
 * 0. tanpa cookie sesi (keluar / 401) atau tanpa uid sesi aktif (sedang
 *    masuk akun lain) → selesai tanpa apa pun;
 * 1. antarkan antrean (OutboxProsesor: FIFO per kunci, backoff, 7 hari →
 *    GAGAL); diulang selama ada pesan baru yang masuk ketika putaran berjalan;
 * 2. tarik proyek, laporan 14 hari terakhir, dan tugas hari ini per proyek;
 * 3. catat waktu sinkron di preferensi bila tarik lancar.
 *
 * [Result.retry] (backoff WorkManager) hanya bila outbox masih punya pesan
 * gagal sementara/ditahan backoff; setelah [MAKS_PERCOBAAN_SINKRON] kali
 * pekerjaan selesai dan jadwal berkala 15 menit mengambil alih.
 *
 * C5-T2: seluruh putaran di bawah KunciSinkron.kerja — pekerja sekali-jalan
 * dan berkala tidak pernah memproses bersamaan; yang kedua MENUNGGU lalu
 * berjalan (pemicunya tidak hilang).
 * C5-T3: setiap pesan hanya dikirim bila pemiliknya = uid sesi aktif, dibaca
 * ulang tepat sebelum kiriman (prefs.uidSesi dikosongkan di awal proses masuk
 * akun lain, sebelum cookie barunya tersimpan).
 */
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val db: MkDatabase,
    retrofit: Retrofit,
    private val prefs: MkPrefs,
    private val authStore: MkAuthStore,
) : CoroutineWorker(appContext, params) {

    private val outboxDao = db.outboxDao()
    private val proyekRepo = ProyekRepo(db.projectDao())
    private val laporanRepo = LaporanRepo(db.dailyReportDao())
    private val tugasRepo = TugasRepo(db.taskDao())
    private val projectsApi: ProjectsApi = retrofit.create(ProjectsApi::class.java)
    private val dailyReportsApi: DailyReportsApi = retrofit.create(DailyReportsApi::class.java)
    private val dailyInputApi: DailyInputApi = retrofit.create(DailyInputApi::class.java)
    private val tasksApi: TasksApi = retrofit.create(TasksApi::class.java)
    private val weeklyInputApi: WeeklyInputApi = retrofit.create(WeeklyInputApi::class.java)

    /** Entri laporan harian PIC + bukti berkas (B2) — payload entri utuh, id lokal diganti. */
    private val pengirimPic = PengirimLaporanPic(
        dao = outboxDao,
        entriApi = retrofit.create(EntriLaporanApi::class.java),
        tasksApi = tasksApi,
        evidenceApi = retrofit.create(EvidenceApi::class.java),
        berkas = BerkasAntre(appContext),
        peta = db.petaIdLokalDao(),
    )

    override suspend fun doWork(): Result = KunciSinkron.kerja.withLock { putaran() }

    private suspend fun uidAktif(): String? = prefs.uidSesi.first()

    private suspend fun putaran(): Result {
        // 0. Tanpa sesi tidak ada yang bisa dikirim/ditarik; antrean tetap
        //    tersimpan sampai pengguna yang sama masuk lagi.
        if (authStore.header() == null) return Result.success()
        val uid = uidAktif() ?: return Result.success()

        // 1. Antrean dulu: tulisan tertunda milik pengguna paling penting.
        val perluUlang = kirimAntrean()
        // Berkas bukti yang pesannya sudah terkirim/dibuang tidak boleh menumpuk.
        runCatching { pengirimPic.sapuBerkas() }
        runCatching { db.petaIdLokalDao().hapusLama(System.currentTimeMillis() - MASA_PETA_MS) }

        // 2. Tarik bacaan segar ke Room (sumber tampilan tunggal, Rancangan §4) —
        //    hanya bila sesi masih milik uid yang sama.
        if (uidAktif() == uid && tarikSemua()) prefs.setTerakhirSinkron(System.currentTimeMillis())

        return when {
            !perluUlang -> Result.success()
            runAttemptCount < MAKS_PERCOBAAN_SINKRON -> Result.retry()
            else -> Result.success() // jadwal berkala melanjutkan
        }
    }

    /**
     * Jalankan putaran outbox; bila selama putaran ada pesan BARU masuk
     * (id > id terbesar potret), jalankan lagi (maks [MAKS_PUTARAN]) supaya
     * tulisan yang diantre saat pekerja ini berjalan tidak menunggu 15 menit
     * (SyncScheduler memakai KEEP). @return masih ada yang perlu diulang.
     */
    private suspend fun kirimAntrean(): Boolean {
        val prosesor = OutboxProsesor(
            dao = outboxDao,
            bolehKirim = { pesan -> pemilikSah(pesan.pemilikUid, uidAktif()) },
        ) { pesan -> kirimPesan(pesan) }
        var ringkasan = prosesor.prosesAntrean()
        var putaran = 1
        while (putaran < MAKS_PUTARAN) {
            val adaBaru = outboxDao.semuaAktif().any {
                it.status == OutboxEntity.STATUS_MENUNGGU && it.id > ringkasan.idTerbesar
            }
            if (!adaBaru) break
            ringkasan = prosesor.prosesAntrean()
            putaran++
        }
        return ringkasan.perluUlang
    }

    /**
     * Tarik proyek lalu laporan + tugas tiap proyek tersimpan; false bila ada
     * sumber yang gagal (bukan sekadar ditolak 403) atau putaran terhenti
     * luring. 403 per proyek (proyek entitas terkait yang bukan milik
     * pengguna) hanya melewati sumber itu — E2E-R2 N1, lihat [tarikPerProyek].
     * (Tarik penuh — menunggu endpoint berubahSejak, Rancangan §9.)
     */
    private suspend fun tarikSemua(): Boolean {
        if (proyekRepo.tarikDariJaringan(projectsApi) !is HasilBaca.Sukses) return false
        val hariIni = Wib.hariIni()
        return tarikPerProyek(
            idProyek = proyekRepo.idProyekTersimpan(),
            tarikLaporan = { laporanRepo.tarik(dailyReportsApi, it) },
            tarikTugas = { tugasRepo.tarik(tasksApi, it, hariIni) },
        ).lancar
    }

    /**
     * Penerjemah jenis pesan outbox → panggilan API jujur daring (tulisApi di
     * repositori). Gelombang E: jenis JenisOutbox.BERIDEMPOTENSI membawa
     * `Idempotency-Key` tersimpan di baris (sama di setiap percobaan); rute
     * mingguan belum mendukungnya sehingga dikirim tanpa header. Jenis yang belum didukung (mis. UNGGAH_BUKTI — berkas tidak
     * muat di payload JSON) gagal permanen dengan pesan jelas supaya tidak
     * dicoba ulang selamanya.
     */
    private suspend fun kirimPesan(pesan: OutboxEntity): HasilKirim = pengirimPic.kirim(pesan) ?: when (pesan.jenis) {
        JenisOutbox.KIRIM_LAPORAN -> {
            val permintaan = dekode<DailyInputRequest>(pesan)
                ?: return HasilKirim.GagalPermanen("Isi pesan antrean laporan rusak dan tidak bisa dikirim.")
            laporanRepo.kirim(dailyInputApi, permintaan, pesan.headerIdempotensi())
        }
        JenisOutbox.TAMBAH_TUGAS -> {
            val permintaan = dekode<TaskSaveRequest>(pesan)
                ?: return HasilKirim.GagalPermanen("Isi pesan antrean tugas rusak dan tidak bisa dikirim.")
            tugasRepo.buat(tasksApi, permintaan, pesan.headerIdempotensi())
        }
        JenisOutbox.UBAH_TUGAS -> {
            val permintaan = dekode<TaskSaveRequest>(pesan)
                ?: return HasilKirim.GagalPermanen("Isi pesan antrean tugas rusak dan tidak bisa dikirim.")
            tugasRepo.ubah(tasksApi, permintaan, pesan.headerIdempotensi())
        }
        JenisOutbox.HAPUS_TUGAS -> {
            val id = teksPayload(pesan, "id")
                ?: return HasilKirim.GagalPermanen("Isi pesan antrean hapus tugas rusak dan tidak bisa dikirim.")
            tugasRepo.hapus(tasksApi, id, pesan.headerIdempotensi(), mungkinSudahTerhapus = pesan.percobaan > 0)
        }
        JenisOutbox.SIMPAN_BUTIR_MINGGUAN -> {
            val permintaan = dekode<WeeklyItemSaveRequest>(pesan)
                ?: return HasilKirim.GagalPermanen("Isi pesan antrean butir mingguan rusak dan tidak bisa dikirim.")
            tulisApi({ weeklyInputApi.simpanButir(permintaan) })
        }
        JenisOutbox.HAPUS_BUTIR_MINGGUAN -> {
            val id = teksPayload(pesan, "itemId")
                ?: return HasilKirim.GagalPermanen("Isi pesan antrean hapus butir rusak dan tidak bisa dikirim.")
            tulisApi({ weeklyInputApi.hapusButir(id) })
        }
        JenisOutbox.AKSI_MINGGUAN -> {
            val permintaan = dekode<WeeklyAksiRequest>(pesan)
                ?: return HasilKirim.GagalPermanen("Isi pesan antrean laporan mingguan rusak dan tidak bisa dikirim.")
            tulisApi({ weeklyInputApi.aksi(permintaan) })
        }
        else -> HasilKirim.GagalPermanen(
            "Jenis pesan \"${pesan.jenis}\" belum bisa dikirim dari antrean. Hubungi pengembang.",
        )
    }

    /** Dekode payloadJson menjadi DTO; null bila JSON/DTO tidak sah (final). */
    private inline fun <reified T> dekode(pesan: OutboxEntity): T? =
        runCatching { mkJson.decodeFromString<T>(pesan.payloadJson) }.getOrNull()

    /** Ambil satu medan teks payload ({"id": "..."}); null bila bentuknya salah. */
    private fun teksPayload(pesan: OutboxEntity, medan: String): String? = runCatching {
        (mkJson.parseToJsonElement(pesan.payloadJson) as? JsonObject)
            ?.get(medan)?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotEmpty() }
    }.getOrNull()

    private companion object {
        /** Pengaman putaran ulang outbox dalam satu kerja. */
        const val MAKS_PUTARAN = 5

        /** Pengaman ulangan WorkManager: 6 backoff eksponensial 30 s → ±16 menit. */
        const val MAKS_PERCOBAAN_SINKRON = 6

        /** Peta id lokal → id server disimpan 14 hari (Sheet lama tidak dibuka selama itu). */
        const val MASA_PETA_MS: Long = 14L * 24 * 60 * 60 * 1000
    }
}
