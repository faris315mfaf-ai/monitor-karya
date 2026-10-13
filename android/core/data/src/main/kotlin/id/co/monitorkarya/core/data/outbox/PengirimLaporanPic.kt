// Penerjemah pesan outbox laporan harian PIC → API (B2). Dipisah dari
// SyncWorker supaya bisa diuji JVM dengan API palsu.
//
// Aturan:
// - Payload entri didekode sebagai EntriSimpanRequest UTUH (bukan
//   TaskSaveRequest) sehingga achievementToday/followUp/needsEscalation/
//   decisionNeeded/picUserId/subtasks tidak hilang (temuan A1).
// - TAMBAH_ENTRI sukses → id lokal "lokal:<idOutbox>" di payload penerus
//   berkunci sama diganti id server SEBELUM pesan ditandai berhasil.
// - C5-T1: TAMBAH sukses juga menulis peta "lokal:<n>" → id server
//   (PetaIdLokalDao) SEBELUM baris ditandai berhasil. Pesan yang dibuat
//   SESUDAH entri terkirim (bukti/ubahan dari Sheet yang masih terbuka) masih
//   membawa id lokal → diterjemahkan lewat peta saat dikirim (payload baris
//   ikut ditulis ulang), bukan gagal permanen.
// - Id lokal tanpa peta: TAMBAH-nya masih antre → tunggu (sementara); TAMBAH
//   sudah tidak ada (dibuang) → GAGAL final dengan pesan jelas. Tidak pernah
//   dikirim dengan id palsu.
// - Hasil server lewat tulisApi → HasilKirim.dari: 409 beku/terkunci & 422 =
//   GagalPermanen (tampil "Gagal kirim"), 409 locked:false/5xx/429 = sementara.
// - Gelombang E: setiap panggilan membawa `Idempotency-Key` = kunci tersimpan
//   di baris (headerIdempotensi) — sama pada setiap percobaan. Jawaban ulangan
//   (200 + Idempotency-Replayed) = sukses biasa; badannya = badan pertama
//   sehingga penggantian id lokal tetap memakai id server yang benar.
//   HAPUS_ENTRI: 404 setelah percobaan sebelumnya yang ambigu = selesai.
package id.co.monitorkarya.core.data.outbox

import id.co.monitorkarya.core.data.db.OutboxDao
import id.co.monitorkarya.core.data.db.OutboxEntity
import id.co.monitorkarya.core.data.db.PetaIdLokalDao
import id.co.monitorkarya.core.data.db.PetaIdLokalEntity
import id.co.monitorkarya.core.data.repo.HasilKirim
import id.co.monitorkarya.core.data.repo.hapusApi
import id.co.monitorkarya.core.data.repo.tulisApi
import id.co.monitorkarya.core.data.sync.JenisOutbox
import id.co.monitorkarya.core.network.api.EntriLaporanApi
import id.co.monitorkarya.core.network.api.EvidenceApi
import id.co.monitorkarya.core.network.api.TasksApi
import id.co.monitorkarya.core.network.dto.EntriSimpanRequest
import id.co.monitorkarya.core.network.dto.PayloadHapusEntri
import id.co.monitorkarya.core.network.dto.PayloadUnggahBukti
import id.co.monitorkarya.core.network.mkJson
import kotlinx.serialization.KSerializer
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody

class PengirimLaporanPic(
    private val dao: OutboxDao,
    private val entriApi: EntriLaporanApi,
    private val tasksApi: TasksApi,
    private val evidenceApi: EvidenceApi,
    private val berkas: BerkasAntre,
    private val peta: PetaIdLokalDao,
    private val jam: () -> Long = System::currentTimeMillis,
) {

    /** Kirim satu pesan; null bila jenisnya bukan milik laporan harian PIC. */
    suspend fun kirim(pesan: OutboxEntity): HasilKirim? = when (pesan.jenis) {
        JenisOutbox.TAMBAH_ENTRI -> tambah(pesan)
        JenisOutbox.UBAH_ENTRI -> {
            val req = dekode(pesan, EntriSimpanRequest.serializer())
            when {
                req == null -> HasilKirim.GagalPermanen(PESAN_RUSAK)
                req.id.isNullOrBlank() -> HasilKirim.GagalPermanen(PESAN_RUSAK)
                else -> when (val id = terjemahkan(pesan, req.id.orEmpty())) {
                    is IdTujuan.Tahan -> id.hasil
                    is IdTujuan.Server -> {
                        val badan = req.copy(id = id.id)
                        tulisApi({ entriApi.ubahEntri(badan, pesan.headerIdempotensi()) })
                    }
                }
            }
        }
        JenisOutbox.HAPUS_ENTRI -> {
            val req = dekode(pesan, PayloadHapusEntri.serializer())
            when {
                req == null || req.id.isBlank() -> HasilKirim.GagalPermanen(PESAN_RUSAK)
                else -> when (val id = terjemahkan(pesan, req.id)) {
                    is IdTujuan.Tahan -> id.hasil
                    // percobaan > 0 = kiriman sebelumnya berakhir luring/5xx (bisa saja sudah
                    // menghapus di server) → 404 berarti tujuan tercapai, bukan GAGAL palsu.
                    is IdTujuan.Server -> hapusApi(mungkinSudahTerhapus = pesan.percobaan > 0, {
                        tasksApi.hapus(id = id.id, konteks = req.context, kunciIdempotensi = pesan.headerIdempotensi())
                    })
                }
            }
        }
        JenisOutbox.UNGGAH_BUKTI -> unggah(pesan)
        else -> null
    }

    private suspend fun tambah(pesan: OutboxEntity): HasilKirim {
        val req = dekode(pesan, EntriSimpanRequest.serializer())
            ?: return HasilKirim.GagalPermanen(PESAN_RUSAK)
        if (req.projectId.isNullOrBlank()) return HasilKirim.GagalPermanen(PESAN_RUSAK)
        return tulisApi({ entriApi.tambahEntri(req, pesan.headerIdempotensi()) }) { jawaban ->
            // R3: ulangan berbadan besar diringkas server → id di resourceId.
            val idServer = jawaban?.task?.id ?: jawaban?.resourceId
            if (idServer != null) {
                val idLokal = IdLokal.dari(pesan.id)
                // Peta dulu (C5-T1): pesan yang dibuat sesudah ini tetap bisa diterjemahkan.
                peta.simpan(PetaIdLokalEntity(idLokal = idLokal, idServer = idServer, dibuatPada = jam()))
                pesan.kunci?.let { dao.gantiTeksPayload(it, IdLokal.kutip(idLokal), IdLokal.kutip(idServer)) }
            }
        }
    }

    /** Hasil penerjemahan id tujuan pesan penerus. */
    private sealed interface IdTujuan {
        data class Server(val id: String) : IdTujuan
        data class Tahan(val hasil: HasilKirim) : IdTujuan
    }

    /**
     * Id server untuk [id]: apa adanya bila bukan id lokal; lewat peta bila
     * TAMBAH-nya sudah sukses (payload baris ditulis ulang supaya tampilan &
     * percobaan berikutnya memakai id server). Tanpa peta: TAMBAH masih di
     * antrean → tunggu; tidak ada → GAGAL final.
     */
    private suspend fun terjemahkan(pesan: OutboxEntity, id: String): IdTujuan {
        if (!IdLokal.adalah(id)) return IdTujuan.Server(id)
        val idServer = peta.idServer(id)
        if (idServer != null) {
            pesan.kunci?.let { dao.gantiTeksPayload(it, IdLokal.kutip(id), IdLokal.kutip(idServer)) }
            return IdTujuan.Server(idServer)
        }
        val asal = IdLokal.idOutbox(id)?.let { dao.ambil(it) }
        val asalMasihAntre = asal != null && asal.jenis == JenisOutbox.TAMBAH_ENTRI &&
            asal.status != OutboxEntity.STATUS_BERHASIL
        return IdTujuan.Tahan(
            if (asalMasihAntre) HasilKirim.GagalSementara(PESAN_MENUNGGU_ASAL) else HasilKirim.GagalPermanen(PESAN_ASAL_BELUM),
        )
    }

    private suspend fun unggah(pesan: OutboxEntity): HasilKirim {
        val req = dekode(pesan, PayloadUnggahBukti.serializer())
            ?: return HasilKirim.GagalPermanen(PESAN_RUSAK)
        val taskId = when (val id = terjemahkan(pesan, req.taskId)) {
            is IdTujuan.Tahan -> return id.hasil
            is IdTujuan.Server -> id.id
        }
        val f = berkas.berkas(req.berkasLokal)
            ?: return HasilKirim.GagalPermanen("Berkas bukti \"${req.nama}\" tidak lagi ada di perangkat. Buang pesan ini lalu lampirkan ulang.")
        val teks = "text/plain".toMediaType()
        return tulisApi({
            evidenceApi.unggah(
                berkas = MultipartBody.Part.createFormData("file", req.nama, f.asRequestBody(req.mime.toMediaType())),
                targetType = req.targetType.toRequestBody(teks),
                targetId = taskId.toRequestBody(teks),
                kunciIdempotensi = pesan.headerIdempotensi(),
            )
        })
    }

    /** Hapus berkas bukti yang pesannya sudah terkirim/dibuang/kedaluwarsa. */
    suspend fun sapuBerkas(): Int {
        val dipakai = dao.payloadAktif(JenisOutbox.UNGGAH_BUKTI)
            .mapNotNull { p -> runCatching { mkJson.decodeFromString(PayloadUnggahBukti.serializer(), p).berkasLokal }.getOrNull() }
            .toSet()
        return berkas.sapuYatim(dipakai)
    }

    private fun <T> dekode(pesan: OutboxEntity, serializer: KSerializer<T>): T? =
        runCatching { mkJson.decodeFromString(serializer, pesan.payloadJson) }.getOrNull()

    companion object {
        const val PESAN_RUSAK = "Isi pesan antrean entri rusak dan tidak bisa dikirim."
        const val PESAN_ASAL_BELUM =
            "Entri asal belum tersimpan di server (pesan tambahnya gagal atau dibuang). Buang pesan ini."
        const val PESAN_MENUNGGU_ASAL = "Menunggu entri asalnya terkirim lebih dulu."
    }
}
