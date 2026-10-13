// Tumpang antrean (agen B2, 13 Okt 2026): perubahan laporan harian PIC yang
// masih di outbox ditampilkan di atas data server/potret Room, lengkap dengan
// status "Menunggu kirim"/"Gagal kirim" per entri dan per bukti. Murni — diuji
// di app/src/test (TumpangAntreanTest).
//
// Prinsip: server tetap otoritas. Tumpangan hanya tampilan; begitu pesan
// terkirim, pesan hilang dari antrean dan layar memuat ulang data server.
package id.co.monitorkarya.app.ui.laporan

import id.co.monitorkarya.core.data.outbox.IdLokal
import id.co.monitorkarya.core.data.outbox.PesanOutbox
import id.co.monitorkarya.core.data.outbox.StatusKirim
import id.co.monitorkarya.core.data.sync.JenisOutbox
import id.co.monitorkarya.core.network.dto.EntriSimpanRequest
import id.co.monitorkarya.core.network.dto.PayloadHapusEntri
import id.co.monitorkarya.core.network.dto.PayloadUnggahBukti
import id.co.monitorkarya.core.network.dto.SubtaskInputDto
import id.co.monitorkarya.core.network.dto.TaskSaveRequest
import id.co.monitorkarya.core.network.mkJson
import kotlinx.serialization.KSerializer

/** Awalan id bukti yang masih di antrean: "antre:<idOutbox>". */
internal const val AWALAN_BUKTI_ANTRE = "antre:"

/** id outbox bukti antre; null bila bukti server. */
internal fun idOutboxBukti(id: String): Long? =
    if (id.startsWith(AWALAN_BUKTI_ANTRE)) id.removePrefix(AWALAN_BUKTI_ANTRE).toLongOrNull() else null

/** GAGAL mengalahkan MENUNGGU. */
private fun gabung(a: StatusKirim?, b: StatusKirim): StatusKirim =
    if (a == StatusKirim.GAGAL || b == StatusKirim.GAGAL) StatusKirim.GAGAL else StatusKirim.MENUNGGU

private fun <T> dekode(p: PesanOutbox, s: KSerializer<T>): T? =
    runCatching { mkJson.decodeFromString(s, p.payloadJson) }.getOrNull()

/** Entri baru dari payload TAMBAH_ENTRI (id lokal). */
internal fun EntriSimpanRequest.keEntriLokal(id: String, p: PesanOutbox): Entri =
    keEntriDariBadan(id).copy(statusKirim = p.status, galatKirim = p.pesanGalat, idOutbox = p.id)

/**
 * C5-R3: jawaban ulangan idempotensi yang diringkas server (tanpa `task`) —
 * entri tampil dibangun dari badan yang dikirim + id server ([id] = resourceId
 * atau id yang diubah); null bila id tidak diketahui.
 */
internal fun EntriSimpanRequest.keEntriRingkas(id: String?): Entri? = id?.takeIf { it.isNotBlank() }?.let { keEntriDariBadan(it) }

private fun EntriSimpanRequest.keEntriDariBadan(id: String): Entri = Entri(
    id = id,
    judul = title,
    deskripsi = description,
    pelaksana = picName,
    picUserId = picUserId,
    status = status,
    progres = progressPct,
    hasil = achievementToday,
    kendala = obstacle,
    keputusan = decisionNeeded,
    rencana = followUp,
    eskalasi = needsEscalation,
    escalationId = null,
    tags = tags,
    urgensi = urgency ?: "SEDANG",
    mulaiIso = null,
    selesaiIso = null,
    subtugas = subtasks,
    bukti = emptyList(),
    jamMulai = startTime,
    jamSelesai = endTime,
)

/** Terapkan isi UBAH_ENTRI ke entri tampil (PUT = ganti utuh, seperti server). */
private fun Entri.denganUbah(r: EntriSimpanRequest, p: PesanOutbox): Entri = copy(
    judul = r.title,
    deskripsi = r.description,
    pelaksana = r.picName,
    picUserId = r.picUserId ?: picUserId,
    status = r.status,
    progres = r.progressPct,
    hasil = r.achievementToday,
    kendala = r.obstacle,
    keputusan = r.decisionNeeded,
    rencana = r.followUp,
    eskalasi = r.needsEscalation,
    tags = r.tags,
    urgensi = r.urgency ?: urgensi,
    subtugas = r.subtasks,
    jamMulai = r.startTime ?: jamMulai,
    jamSelesai = r.endTime ?: jamSelesai,
    statusKirim = gabung(statusKirim, p.status),
    galatKirim = p.pesanGalat ?: galatKirim,
)

/** Terapkan centang meja kerja (UBAH_TUGAS; narasi entri tidak dikirim → tetap). */
private fun Entri.denganTugas(r: TaskSaveRequest, p: PesanOutbox): Entri = copy(
    judul = r.title,
    deskripsi = r.description,
    status = r.status,
    progres = r.progressPct,
    kendala = r.obstacle,
    keputusan = r.decisionNeeded,
    subtugas = r.subtasks.map { SubtaskInputDto(it.title, it.isDone) },
    statusKirim = gabung(statusKirim, p.status),
    galatKirim = p.pesanGalat ?: galatKirim,
)

/**
 * Tumpangkan [pesan] (berkunci laporan proyek+tanggal yang sama, urut FIFO)
 * ke [hari]. Pesan KIRIM_LAPORAN tidak mengubah entri (tampil di daftar antrean).
 */
internal fun tumpangkanAntrean(hari: EntriHari, pesan: List<PesanOutbox>): EntriHari {
    if (pesan.isEmpty()) return hari
    val daftar = hari.entri.toMutableList()
    fun ubahSatu(id: String, f: (Entri) -> Entri?) {
        val i = daftar.indexOfFirst { it.id == id }
        if (i < 0) return
        val baru = f(daftar[i])
        if (baru == null) daftar.removeAt(i) else daftar[i] = baru
    }
    for (p in pesan) {
        when (p.jenis) {
            JenisOutbox.TAMBAH_ENTRI -> dekode(p, EntriSimpanRequest.serializer())?.let { r ->
                daftar += r.keEntriLokal(IdLokal.dari(p.id), p)
            }
            JenisOutbox.UBAH_ENTRI -> dekode(p, EntriSimpanRequest.serializer())?.let { r ->
                r.id?.let { id -> ubahSatu(id) { it.denganUbah(r, p) } }
            }
            JenisOutbox.UBAH_TUGAS -> dekode(p, TaskSaveRequest.serializer())?.let { r ->
                r.id?.let { id -> ubahSatu(id) { it.denganTugas(r, p) } }
            }
            JenisOutbox.HAPUS_ENTRI -> dekode(p, PayloadHapusEntri.serializer())?.let { r ->
                ubahSatu(r.id) { e ->
                    // Menunggu: entri disembunyikan; gagal: tetap tampil dengan alasan server.
                    if (p.status == StatusKirim.GAGAL) e.copy(statusKirim = StatusKirim.GAGAL, galatKirim = p.pesanGalat) else null
                }
            }
            JenisOutbox.UNGGAH_BUKTI -> dekode(p, PayloadUnggahBukti.serializer())?.let { r ->
                ubahSatu(r.taskId) { e ->
                    e.copy(
                        bukti = e.bukti + Bukti(
                            id = AWALAN_BUKTI_ANTRE + p.id,
                            nama = r.nama,
                            mime = r.mime,
                            ukuran = r.ukuran.coerceAtMost(Int.MAX_VALUE.toLong()).toInt(),
                            tautan = null,
                            statusKirim = p.status,
                            galatKirim = p.pesanGalat,
                        ),
                    )
                }
            }
        }
    }
    return hari.copy(entri = daftar)
}

/** Kalimat label pesan antrean entri (tampil di DaftarAntrean). */
internal fun labelAntreEntri(baru: Boolean, judul: String): String =
    (if (baru) "Tambah entri " else "Ubah entri ") + "“${judul.trim().take(60)}”"
