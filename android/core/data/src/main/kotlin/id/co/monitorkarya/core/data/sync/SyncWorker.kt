// Pekerja sinkronisasi latar (Rancangan §4 + FASE1.md §3 butir 3): satu putaran
// penuh — buang pesan kedaluwarsa, antarkan outbox, tarik proyek + laporan +
// tugas hari ini ke Room. Dijadwalkan SyncScheduler dengan batasan jaringan;
// ulangi (Result.retry + backoff) selama masih ada kegagalan sementara.
//
// Dependensi yang disuntik sengaja hanya yang SUDAH terikat di AppModule F0
// (MkDatabase, Retrofit, MkPrefs): DAO dan API dibangun dari keduanya sehingga
// worker ini tidak menambah kebutuhan @Provides baru di :app. Saat integrasi
// menambah penyedia DAO/API, injeksi bisa dirapikan langsung ke repositori.
package id.co.monitorkarya.core.data.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import id.co.monitorkarya.core.data.db.MkDatabase
import id.co.monitorkarya.core.data.db.OutboxEntity
import id.co.monitorkarya.core.data.outbox.OutboxProsesor
import id.co.monitorkarya.core.data.prefs.MkPrefs
import id.co.monitorkarya.core.data.repo.HasilBaca
import id.co.monitorkarya.core.data.repo.HasilKirim
import id.co.monitorkarya.core.data.repo.LaporanRepo
import id.co.monitorkarya.core.data.repo.ProyekRepo
import id.co.monitorkarya.core.data.repo.TugasRepo
import id.co.monitorkarya.core.domain.time.Wib
import id.co.monitorkarya.core.network.api.DailyInputApi
import id.co.monitorkarya.core.network.api.DailyReportsApi
import id.co.monitorkarya.core.network.api.ProjectsApi
import id.co.monitorkarya.core.network.api.TasksApi
import id.co.monitorkarya.core.network.dto.DailyInputRequest
import id.co.monitorkarya.core.network.dto.TaskSaveRequest
import id.co.monitorkarya.core.network.mkJson
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.Retrofit

/** Jenis pesan outbox Fase 1 (kosa kata kawat UI ↔ worker). */
object JenisOutbox {
    /** PUT /api/daily-input — payload = DailyInputRequest (kirim laporan/draf). */
    const val KIRIM_LAPORAN = "KIRIM_LAPORAN"

    /** POST /api/tasks — payload = TaskSaveRequest (projectId terisi). */
    const val TAMBAH_TUGAS = "TAMBAH_TUGAS"

    /** PUT /api/tasks — payload = TaskSaveRequest (id terisi). */
    const val UBAH_TUGAS = "UBAH_TUGAS"

    /** DELETE /api/tasks?id= — payload = {"id": "..."}. */
    const val HAPUS_TUGAS = "HAPUS_TUGAS"
}

/**
 * Satu putaran sinkronisasi penuh untuk PIC (Fase 1):
 * 1. buang pesan outbox yang lebih tua dari 7 hari (OutboxDao.hapusKedaluwarsa);
 * 2. antarkan antrean tulisan tertunda (OutboxProsesor, FIFO);
 * 3. tarik proyek, laporan 14 hari terakhir, dan tugas hari ini per proyek;
 * 4. catat waktu sinkron di preferensi saat semuanya lancar.
 *
 * [Result.retry] dijadwalkan ulang WorkManager dengan backoff; setelah
 * [MAKS_PERCOBAAN_SINKRON] kali masih gagal sementara, pekerjaan berhenti
 * gagal (pengguna melihat pesan antrean yang masih MENUNGGU/GAGAL).
 */
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    db: MkDatabase,
    retrofit: Retrofit,
    private val prefs: MkPrefs,
) : CoroutineWorker(appContext, params) {

    private val outboxDao = db.outboxDao()
    private val proyekRepo = ProyekRepo(db.projectDao())
    private val laporanRepo = LaporanRepo(db.dailyReportDao())
    private val tugasRepo = TugasRepo(db.taskDao())
    private val projectsApi: ProjectsApi = retrofit.create(ProjectsApi::class.java)
    private val dailyReportsApi: DailyReportsApi = retrofit.create(DailyReportsApi::class.java)
    private val dailyInputApi: DailyInputApi = retrofit.create(DailyInputApi::class.java)
    private val tasksApi: TasksApi = retrofit.create(TasksApi::class.java)

    override suspend fun doWork(): Result {
        var adaGagalSementara = false

        // 1. Batas antre 7 hari (Rancangan §4): pesan lewat masa tidak diantar.
        outboxDao.hapusKedaluwarsa(System.currentTimeMillis() - MASA_ANTRE_MS)

        // 2. Antrean dulu: tulisan tertunda milik pengguna paling penting;
        //    hasil sementara (5xx/429/sesi) meminta putaran diulang WorkManager.
        OutboxProsesor(outboxDao) { pesan ->
            kirimPesan(pesan).also { hasil ->
                if (hasil is HasilKirim.GagalSementara) adaGagalSementara = true
            }
        }.prosesAntrean()

        // 3. Tarik bacaan segar ke Room (sumber tampilan tunggal, Rancangan §4).
        val tarikLancar = tarikSemua()

        return when {
            tarikLancar && !adaGagalSementara -> {
                prefs.setTerakhirSinkron(System.currentTimeMillis())
                Result.success()
            }
            runAttemptCount < MAKS_PERCOBAAN_SINKRON -> Result.retry()
            else -> Result.failure()
        }
    }

    /** Tarik proyek lalu laporan + tugas tiap proyek tersimpan; false bila ada yang gagal. */
    private suspend fun tarikSemua(): Boolean {
        if (proyekRepo.tarikDariJaringan(projectsApi) !is HasilBaca.Sukses) return false
        val hariIni = Wib.hariIni()
        for (proyekId in proyekRepo.idProyekTersimpan()) {
            if (laporanRepo.tarik(dailyReportsApi, proyekId) !is HasilBaca.Sukses) return false
            if (tugasRepo.tarik(tasksApi, proyekId, hariIni) !is HasilBaca.Sukses) return false
        }
        return true
    }

    /**
     * Penerjemah jenis pesan outbox → panggilan API jujur daring (tulisApi di
     * repositori). Jenis yang belum didukung (mis. UNGGAH_BUKTI — berkas tidak
     * muat di payload JSON) gagal permanen dengan pesan jelas supaya tidak
     * dicoba ulang selamanya.
     */
    private suspend fun kirimPesan(pesan: OutboxEntity): HasilKirim = when (pesan.jenis) {
        JenisOutbox.KIRIM_LAPORAN -> {
            val permintaan = dekode<DailyInputRequest>(pesan)
                ?: return HasilKirim.GagalPermanen("Isi pesan antrean laporan rusak dan tidak bisa dikirim.")
            laporanRepo.kirim(dailyInputApi, permintaan)
        }
        JenisOutbox.TAMBAH_TUGAS -> {
            val permintaan = dekode<TaskSaveRequest>(pesan)
                ?: return HasilKirim.GagalPermanen("Isi pesan antrean tugas rusak dan tidak bisa dikirim.")
            tugasRepo.buat(tasksApi, permintaan)
        }
        JenisOutbox.UBAH_TUGAS -> {
            val permintaan = dekode<TaskSaveRequest>(pesan)
                ?: return HasilKirim.GagalPermanen("Isi pesan antrean tugas rusak dan tidak bisa dikirim.")
            tugasRepo.ubah(tasksApi, permintaan)
        }
        JenisOutbox.HAPUS_TUGAS -> {
            val id = hapusTugasId(pesan)
                ?: return HasilKirim.GagalPermanen("Isi pesan antrean hapus tugas rusak dan tidak bisa dikirim.")
            tugasRepo.hapus(tasksApi, id)
        }
        else -> HasilKirim.GagalPermanen(
            "Jenis pesan \"${pesan.jenis}\" belum bisa dikirim dari antrean. Hubungi pengembang.",
        )
    }

    /** Dekode payloadJson menjadi DTO; null bila JSON/DTO tidak sah (final). */
    private inline fun <reified T> dekode(pesan: OutboxEntity): T? =
        runCatching { mkJson.decodeFromString<T>(pesan.payloadJson) }.getOrNull()

    /** Ambil {"id": "..."} payload hapus tugas; null bila bentuknya salah. */
    private fun hapusTugasId(pesan: OutboxEntity): String? = runCatching {
        (mkJson.parseToJsonElement(pesan.payloadJson) as? JsonObject)
            ?.get("id")?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotEmpty() }
    }.getOrNull()

    private companion object {
        /** 7 hari dalam millis — umur maksimum pesan menunggu di antrean. */
        const val MASA_ANTRE_MS = 7L * 24 * 60 * 60 * 1000

        /** Pengaman ulangan WorkManager: 6 backoff eksponensial 30 s → ±16 menit. */
        const val MAKS_PERCOBAAN_SINKRON = 6
    }
}
