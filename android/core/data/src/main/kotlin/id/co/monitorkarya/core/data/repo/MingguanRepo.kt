// Repositori Fase 2 — capaian mingguan divisi (kepala divisi + Admin PT).
// Sumber: src/app/api/weekly-input/route.ts (papan divisi, serah/setujui)
// dan src/app/api/weekly-reports/route.ts (arsip berhalaman). Baca selalu dari
// Room (offline-first Rancangan §4); serah/setujui jujur daring lewat
// [tulisApi] — hasil server final, luring tidak pernah dianggap terkirim.
//
// WeeklyReportsApi/WeeklyInputApi belum ada di :core-network saat tugas ini
// ditulis (tugas jaringan berjalan paralel); MingguanRepo memakai bentuk
// Response<JsonObject> + parse defensif (pola RingkasanViewModel F0) supaya
// tidak tergantung bentuk DTO final. Tanda tangan yang diharapkan ada di
// android/docs/fase2/T6-C3-LAPORAN.md.
package id.co.monitorkarya.core.data.repo

import id.co.monitorkarya.core.data.db.MingguanButirDao
import id.co.monitorkarya.core.data.db.MingguanButirEntity
import id.co.monitorkarya.core.data.db.MingguanLaporanDao
import id.co.monitorkarya.core.data.db.MingguanLaporanEntity
import id.co.monitorkarya.core.network.api.WeeklyInputApi
import id.co.monitorkarya.core.network.api.WeeklyReportsApi
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.serializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put

/** Laporan mingguan divisi: baca dari Room, tarik dari server, serah/setujui. */
@Singleton
class MingguanRepo @Inject constructor(
    private val laporanDao: MingguanLaporanDao,
    private val butirDao: MingguanButirDao,
) {

    /** Semua laporan di cache, pekan terbaru dulu (sumber tampilan layar). */
    fun laporan(): Flow<List<MingguanLaporanEntity>> = laporanDao.pilihSemua()

    /** Satu laporan berdasarkan id. */
    fun laporan(id: String): Flow<MingguanLaporanEntity?> = laporanDao.pilih(id)

    /** Riwayat laporan satu divisi, pekan terbaru dulu. */
    fun laporanPerDivisi(divisiId: String): Flow<List<MingguanLaporanEntity>> =
        laporanDao.pilihPerDivisi(divisiId)

    /** Butir satu laporan dalam urutan papan divisi. */
    fun butir(laporanId: String): Flow<List<MingguanButirEntity>> = butirDao.pilihPerLaporan(laporanId)

    /**
     * Tarik arsip /api/weekly-reports halaman per halaman lalu simpan ke Room.
     * [maksHalaman] membatasi kuota (bawaan 5 × 50 baris); saringan opsional
     * sama dengan web (entityId, statusHeader, isoYear, isoWeek). Karena tarik
     * boleh tersaring, pembersihan memakai ambang tujuh hari (bukan
     * "semua yang tidak ikut tersegar") supaya baris di luar saringan selamat.
     */
    suspend fun tarikArsip(
        api: WeeklyReportsApi,
        entityId: String? = null,
        statusHeader: String? = null,
        isoTahun: Int? = null,
        isoMinggu: Int? = null,
        maksHalaman: Int = MAKS_HALAMAN,
    ): HasilBaca<Unit> {
        val tersinkronPada = System.currentTimeMillis()
        var halaman = 1
        while (halaman <= maksHalaman) {
            when (
                val hasil = bacaApi {
                    api.daftar(page = halaman, pageSize = UKURAN_HALAMAN, entityId = entityId, statusHeader = statusHeader, isoYear = isoTahun, isoWeek = isoMinggu).konversiObjek()
                }
            ) {
                is HasilBaca.Gagal -> return hasil
                is HasilBaca.Sukses -> {
                    val baris = hasil.data["items"].sebagaiArray().orEmpty()
                        .mapNotNull { it.sebagaiObjek() }
                    for (obj in baris) simpanLaporan(obj, tersinkronPada)
                    val total = hasil.data.angka("total") ?: 0
                    if (baris.isEmpty() || halaman * UKURAN_HALAMAN >= total) break
                    halaman++
                }
            }
        }
        laporanDao.hapusTersinkronLama(tersinkronPada - MASA_SIMPAN_MS)
        return HasilBaca.Sukses(Unit)
    }

    /**
     * Tarik papan pekan divisi (GET /api/weekly-input) — minggu berjalan atau
     * [minggu] berbentuk "YYYY-Www" — lalu simpan laporan beserta butirnya.
     * Hanya divisi yang sudah punya baris laporan yang tersimpan (server tidak
     * pernah membuatkan baris untuk pekan lampau).
     */
    suspend fun tarikPapan(
        api: WeeklyInputApi,
        entityId: String? = null,
        minggu: String? = null,
    ): HasilBaca<Unit> {
        val tersinkronPada = System.currentTimeMillis()
        // Respons papan kini terketik (C1); parser manual tetap memakai JsonObject —
        // konversi sekali lewat mkJson (aman; ignoreUnknownKeys).
        return when (val hasil = bacaApi { api.papan(entityId, minggu).konversiObjek() }) {
            is HasilBaca.Gagal -> hasil
            is HasilBaca.Sukses -> {
                val isi = hasil.data
                // Bentuk papan tidak mengulang divisiId/isoYear/isoWeek di
                // dalam objek report; keduanya diambil dari sampul respons.
                val entitasTerpilih = isi.teks("entityId") ?: entityId
                val entitasNama = isi["entities"].sebagaiArray().orEmpty()
                    .mapNotNull { it.sebagaiObjek() }
                    .firstOrNull { it.teks("id") == entitasTerpilih }
                    ?.teks("name")
                for (elemen in isi["divisions"].sebagaiArray().orEmpty()) {
                    val divisi = elemen.sebagaiObjek() ?: continue
                    val divisiId = divisi.teks("id") ?: continue
                    val laporan = divisi["report"].sebagaiObjek() ?: continue
                    simpanLaporan(
                        obj = laporan,
                        tersinkronPada = tersinkronPada,
                        divisiId = divisiId,
                        entitasNama = entitasNama,
                        isoTahun = isi.angka("isoYear"),
                        isoMinggu = isi.angka("isoWeek"),
                    )
                }
                HasilBaca.Sukses(Unit)
            }
        }
    }

    /**
     * Serahkan laporan draf minggu [minggu] (bawaan: minggu berjalan) ke Admin
     * PT — POST /api/weekly-input action=submit. Jujur daring: saat luring
     * balik [HasilKirim.Luring] tanpa menyentuh cache; 409 (sudah
     * diserahkan/dikunci/beku) dan 422 (validasi item) jadi
     * [HasilKirim.GagalPermanen] dengan pesan server apa adanya.
     */
    suspend fun serah(api: WeeklyInputApi, divisiId: String, minggu: String? = null): HasilKirim =
        kirimTindakan(api, AKSI_SERAH, divisiId, minggu)

    /**
     * Setujui laporan yang menunggu persetujuan — action=approve (kepala
     * divisi; Admin PT merangkum bundel, bukan menyetujui).
     */
    suspend fun setujui(api: WeeklyInputApi, divisiId: String, minggu: String? = null): HasilKirim =
        kirimTindakan(api, AKSI_SETUJUI, divisiId, minggu)

    private suspend fun kirimTindakan(
        api: WeeklyInputApi,
        aksi: String,
        divisiId: String,
        minggu: String?,
    ): HasilKirim {
        // Aksi serah/setujui memakai WeeklyAksiRequest terketik (C1); konstruksi
        // helper-nya menerima (divisionId, week, action).
        val aksiSerah = if (aksi.equals("submit", ignoreCase = true)) "submit" else "approve"
        return tulisApi({ api.aksi(id.co.monitorkarya.core.network.dto.WeeklyAksiRequest(divisiId, minggu, aksiSerah)) }) {
            tarikPapan(api, minggu = minggu)
        }
    }

    /**
     * Satu objek laporan (arsip maupun papan) menjadi baris header + butir di
     * Room. Parameter sampul mengisi kolom yang tidak diulang di dalam objek
     * report bentuk papan (divisiId, nama entitas, isoYear, isoWeek).
     */
    private suspend fun simpanLaporan(
        obj: JsonObject,
        tersinkronPada: Long,
        divisiId: String? = null,
        entitasNama: String? = null,
        isoTahun: Int? = null,
        isoMinggu: Int? = null,
    ) {
        val id = obj.teks("id") ?: return
        val butir = (obj["items"].sebagaiArray() ?: emptyList())
            .mapNotNull { keButir(id, it.sebagaiObjek() ?: return@mapNotNull null) }
        laporanDao.simpan(
            MingguanLaporanEntity(
                id = id,
                divisiId = divisiId ?: obj.teks("divisionId").orEmpty(),
                entitasNama = entitasNama ?: obj["entity"].sebagaiObjek()?.teks("name").orEmpty(),
                isoTahun = isoTahun ?: obj.angka("isoYear") ?: 0,
                isoMinggu = isoMinggu ?: obj.angka("isoWeek") ?: 0,
                statusHeader = obj.teks("statusHeader") ?: MingguanLaporanEntity.DRAFT,
                diserahkanPada = isoKeEpochMillis(obj.teks("submittedAt")),
                disetujuiPada = isoKeEpochMillis(obj.teks("approvedAt")),
                diteruskanPada = isoKeEpochMillis(obj.teks("forwardedAt")),
                butirJumlah = butir.size,
                butirSelesai = butir.count { it.status == MingguanButirEntity.SELESAI },
                tersinkronPada = tersinkronPada,
            )
        )
        butirDao.simpan(butir)
        // Butir tanpa kolom tersinkronPada: yang hilang dari respons terbaru
        // dibuang per laporan (cermin setia per laporan). Daftar kosong tidak
        // boleh masuk "NOT IN (:pertahankan)" — SQL SQLite menolak "IN ()".
        if (butir.isNotEmpty()) {
            butirDao.hapusYangLama(id, butir.map { it.id })
        } else {
            butirDao.hapusPerLaporan(id)
        }
    }

    private fun keButir(laporanId: String, obj: JsonObject): MingguanButirEntity? {
        val id = obj.teks("id") ?: return null
        return MingguanButirEntity(
            id = id,
            laporanMingguanId = laporanId,
            aspek = obj["aspectCategory"].sebagaiObjek()?.teks("name").orEmpty(),
            pekerjaan = obj.teks("workItem").orEmpty(),
            target = obj.teks("targetOutput").orEmpty(),
            status = obj.teks("status") ?: MingguanButirEntity.BELUM_MULAI,
            progres = (obj.angka("progressPct") ?: 0).coerceIn(0, 100),
            tanggalKerja = isoKeEpochMillis(obj.teks("workDate")),
            urutan = obj.angka("position") ?: 0,
        )
    }

    private companion object {
        const val AKSI_SERAH = "submit"
        const val AKSI_SETUJUI = "approve"
        const val UKURAN_HALAMAN = 50
        const val MAKS_HALAMAN = 5
        const val MASA_SIMPAN_MS = 7L * 24 * 60 * 60 * 1000
    }
}

// ---- Helper parse JsonObject (pola parseRingkasan F0; privat berkas) ----
// Respons mingguan masih dibaca sebagai JsonObject (lihat catatan kelas):
// field hilang atau salah tipe menjadi null/kosong, bukan melempar.

private fun JsonElement?.sebagaiObjek(): JsonObject? = this as? JsonObject

private fun JsonElement?.sebagaiArray(): JsonArray? = this as? JsonArray

private fun JsonObject.teks(kunci: String): String? =
    (this[kunci] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotEmpty() }

private fun JsonObject.angka(kunci: String): Int? =
    (this[kunci] as? JsonPrimitive)?.intOrNull


/** Re-encode badan Response terketik menjadi JsonObject bagi parser manual repo. */
private suspend fun <T : Any> retrofit2.Response<T>.konversiObjek(): retrofit2.Response<kotlinx.serialization.json.JsonObject> {
    val asli = body() ?: return retrofit2.Response.error(500, okhttp3.ResponseBody.create(null, ""))
    val teks = id.co.monitorkarya.core.network.mkJson.encodeToString(
        kotlinx.serialization.serializer(asli::class.java), asli)
    val json = id.co.monitorkarya.core.network.mkJson.parseToJsonElement(teks) as? kotlinx.serialization.json.JsonObject
        ?: kotlinx.serialization.json.JsonObject(emptyMap())
    return retrofit2.Response.success(json)
}
