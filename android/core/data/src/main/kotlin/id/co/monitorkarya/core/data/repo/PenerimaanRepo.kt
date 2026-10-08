// Repositori Fase 2 — meja penerimaan Admin PT: dua arus (laporan harian PIC
// dan bundel mingguan divisi) beserta keadaan penerusannya ke holding.
// Sumber: src/app/api/inbox/route.ts (GET antrean, POST teruskan). Baca dari
// Room; teruskan jujur daring lewat [tulisApi] — 409 "sudah diteruskan"
// maupun 422 PIC/kadiv belum menyerahkan menjadi GagalPermanen dengan pesan
// server apa adanya, tidak pernah ditimpa lokal (Rancangan §4).
package id.co.monitorkarya.core.data.repo

import id.co.monitorkarya.core.data.db.PenerimaanDao
import id.co.monitorkarya.core.data.db.PenerimaanEntity
import id.co.monitorkarya.core.network.api.InboxApi
import id.co.monitorkarya.core.network.dto.InboxHarianDto
import id.co.monitorkarya.core.network.dto.InboxMingguanDto
import id.co.monitorkarya.core.network.dto.TeruskanRequest
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow

/** Antrean penerimaan Admin PT: tarik, simpan luring, teruskan ke holding. */
@Singleton
class PenerimaanRepo @Inject constructor(private val dao: PenerimaanDao) {

    /** Seluruh antrean (harian lalu mingguan) dari cache Room. */
    fun antrean(): Flow<List<PenerimaanEntity>> = dao.pilihSemua()

    /** Antrean satu jenis (PenerimaanEntity.JENIS_HARIAN / JENIS_MINGGUAN). */
    fun antrean(jenis: String): Flow<List<PenerimaanEntity>> = dao.pilihPerJenis(jenis)

    /** Satu baris antrean berdasarkan id sintetis ("H:…" / "M:…"). */
    fun baris(id: String): Flow<PenerimaanEntity?> = dao.pilih(id)

    /**
     * Tarik meja penerimaan hari/pekan berjalan (GET /api/inbox) lalu simpan
     * ke Room. Respons tidak memuat nama entitas per baris (Admin PT terpaku
     * pada satu PT), jadi [entitasNama] diberikan pemanggil bila diketahui —
     * TI yang melihat semua PT dapat mengosongkannya.
     *
     * undoToken tersimpan dari tindakan teruskan sebelumnya dipertahankan
     * supaya "Urungkan" tetap hidup lintas penyegaran (tiket 15 menit).
     */
    suspend fun tarik(api: InboxApi, entitasNama: String = ""): HasilBaca<Unit> {
        val tersinkronPada = System.currentTimeMillis()
        return when (val hasil = bacaApi { api.inbox() }) {
            is HasilBaca.Gagal -> hasil
            is HasilBaca.Sukses -> {
                val segar = hasil.data.daily.map { it.keEntity(entitasNama, tersinkronPada) } +
                    hasil.data.weekly.map { it.keEntity(entitasNama, tersinkronPada) }
                dao.simpan(segar)
                // Antrean adalah potret hari berjalan: baris yang tidak
                // disegarkan sepekan dianggap basi.
                dao.hapusTersinkronLama(tersinkronPada - MASA_SIMPAN_MS)
                HasilBaca.Sukses(Unit)
            }
        }
    }

    /**
     * Teruskan satu laporan ke holding (POST /api/inbox {kind, id}; id = id
     * laporan yang tersimpan di kolom laporanId, bukan id proyek/divisi).
     * Sukses menandai baris DITERUSKAN dan menyimpan undoToken di Room untuk
     * "Urungkan" (UndoApi). Galat server diteruskan apa adanya ke pemanggil:
     * 409 sudah diteruskan (klik ganda aman), 422 belum diserahkan/disetujui.
     */
    suspend fun teruskan(api: InboxApi, barisId: String): HasilKirim {
        val baris = dao.ambil(barisId)
            ?: return HasilKirim.GagalPermanen("Baris antrean tidak ditemukan.")
        val laporanId = baris.laporanId
            ?: return HasilKirim.GagalPermanen("Belum ada laporan yang bisa diteruskan.")
        val permintaan =
            if (baris.jenis == PenerimaanEntity.JENIS_MINGGUAN) {
                TeruskanRequest.mingguan(laporanId)
            } else {
                TeruskanRequest.harian(laporanId)
            }
        return tulisApi({ api.teruskan(permintaan) }) { jawaban ->
            jawaban?.let {
                dao.simpan(
                    baris.copy(
                        status = PenerimaanEntity.STATUS_DITERUSKAN,
                        diteruskanPada = System.currentTimeMillis(),
                        undoToken = it.undoToken,
                    )
                )
            }
        }
    }

    private suspend fun InboxHarianDto.keEntity(entitasNama: String, tersinkronPada: Long): PenerimaanEntity {
        val id = PenerimaanEntity.idHarian(projectId)
        return PenerimaanEntity(
            id = id,
            jenis = PenerimaanEntity.JENIS_HARIAN,
            laporanId = reportId,
            judul = name,
            entitasNama = entitasNama,
            status = statusAntrean(diteruskan = forwardedAt != null, siap = readyToForward),
            diteruskanPada = isoKeEpochMillis(forwardedAt),
            // Pengingat penerusan hanya lahir dari tindakan teruskan, bukan
            // dari GET; token lama dipertahankan.
            undoToken = dao.ambil(id)?.takeIf { it.status == PenerimaanEntity.STATUS_DITERUSKAN }?.undoToken,
            tersinkronPada = tersinkronPada,
        )
    }

    private suspend fun InboxMingguanDto.keEntity(entitasNama: String, tersinkronPada: Long): PenerimaanEntity {
        val id = PenerimaanEntity.idMingguan(divisionId)
        return PenerimaanEntity(
            id = id,
            jenis = PenerimaanEntity.JENIS_MINGGUAN,
            laporanId = reportId,
            judul = name,
            entitasNama = entitasNama,
            status = statusAntrean(diteruskan = forwardedAt != null, siap = readyToForward),
            diteruskanPada = isoKeEpochMillis(forwardedAt),
            undoToken = dao.ambil(id)?.takeIf { it.status == PenerimaanEntity.STATUS_DITERUSKAN }?.undoToken,
            tersinkronPada = tersinkronPada,
        )
    }

    private fun statusAntrean(diteruskan: Boolean, siap: Boolean): String = when {
        diteruskan -> PenerimaanEntity.STATUS_DITERUSKAN
        siap -> PenerimaanEntity.STATUS_SIAP
        else -> PenerimaanEntity.STATUS_BARU
    }

    private companion object {
        const val MASA_SIMPAN_MS = 7L * 24 * 60 * 60 * 1000
    }
}
