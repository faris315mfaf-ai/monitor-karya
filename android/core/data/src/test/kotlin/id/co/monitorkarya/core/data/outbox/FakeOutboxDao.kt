package id.co.monitorkarya.core.data.outbox

import id.co.monitorkarya.core.data.db.OutboxDao
import id.co.monitorkarya.core.data.db.OutboxEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

/** OutboxDao berbasis daftar di memori — meniru semantik SQL OutboxDao. */
class FakeOutboxDao : OutboxDao {
    private val isi = MutableStateFlow<List<OutboxEntity>>(emptyList())

    val baris: List<OutboxEntity> get() = isi.value.sortedBy { it.id }

    /** Tiap perubahan atomik (meniru satu pernyataan SQL). */
    @Synchronized
    private fun ubah(blok: (MutableList<OutboxEntity>) -> Unit) {
        isi.value = isi.value.toMutableList().also(blok)
    }

    private val statusAktif = setOf(OutboxEntity.STATUS_MENUNGGU, OutboxEntity.STATUS_MENGIRIM, OutboxEntity.STATUS_GAGAL)

    private fun aktif(l: List<OutboxEntity>) = l.filter { it.status in statusAktif }.sortedBy { it.id }

    override suspend fun simpan(satu: OutboxEntity): Long {
        val id = if (satu.id == 0L) (isi.value.maxOfOrNull { it.id } ?: 0L) + 1 else satu.id
        ubah { l -> l.removeAll { it.id == id }; l.add(satu.copy(id = id)) }
        return id
    }

    override suspend fun tambah(baru: OutboxEntity): Long = simpan(baru.copy(id = 0))

    override fun antrian(): Flow<List<OutboxEntity>> =
        isi.map { l -> l.filter { it.status == OutboxEntity.STATUS_MENUNGGU }.sortedBy { it.id } }

    override suspend fun semuaAktif(): List<OutboxEntity> = aktif(isi.value)

    override fun amatiAktif(): Flow<List<OutboxEntity>> = isi.map { aktif(it) }

    override suspend fun tandai(id: Long, status: String, pesan: String?, percobaan: Int) {
        ubah { l -> l.replaceAll { if (it.id == id) it.copy(status = status, pesanGalat = pesan, percobaan = percobaan) else it } }
    }

    override suspend fun perbarui(id: Long, status: String, pesan: String?, percobaan: Int, berikutnyaPada: Long) {
        ubah { l ->
            l.replaceAll {
                if (it.id == id) {
                    it.copy(status = status, pesanGalat = pesan, percobaan = percobaan, berikutnyaPada = berikutnyaPada)
                } else {
                    it
                }
            }
        }
    }

    override suspend fun hapusBerhasil() {
        ubah { l -> l.removeAll { it.status == OutboxEntity.STATUS_BERHASIL } }
    }

    override suspend fun tandaiKedaluwarsa(sebelum: Long, pesan: String, pesanAmbigu: String) {
        ubah { l ->
            l.replaceAll {
                if (it.status == OutboxEntity.STATUS_MENUNGGU && it.dibuatPada < sebelum) {
                    it.copy(status = OutboxEntity.STATUS_GAGAL, pesanGalat = if (it.percobaan > 0) pesanAmbigu else pesan)
                } else {
                    it
                }
            }
        }
    }

    override suspend fun hapusGagalLama(sebelum: Long) {
        ubah { l -> l.removeAll { it.status == OutboxEntity.STATUS_GAGAL && it.dibuatPada < sebelum } }
    }

    override suspend fun hapus(id: Long) {
        ubah { l -> l.removeAll { it.id == id } }
    }

    override suspend fun ulangi(id: Long, sekarang: Long) {
        ubah { l ->
            l.replaceAll {
                if (it.id == id && it.status == OutboxEntity.STATUS_GAGAL) {
                    it.copy(
                        status = OutboxEntity.STATUS_MENUNGGU,
                        percobaan = 0,
                        berikutnyaPada = 0,
                        pesanGalat = null,
                        dibuatPada = sekarang,
                    )
                } else {
                    it
                }
            }
        }
    }

    override suspend fun ambil(id: Long): OutboxEntity? = isi.value.firstOrNull { it.id == id }

    override suspend fun gantiTeksPayload(kunci: String, lama: String, baru: String) {
        ubah { l ->
            l.replaceAll {
                if (it.kunci == kunci && it.status != OutboxEntity.STATUS_BERHASIL) {
                    it.copy(payloadJson = it.payloadJson.replace(lama, baru))
                } else {
                    it
                }
            }
        }
    }

    override suspend fun aktifMemuat(kunci: String, teks: String): List<OutboxEntity> =
        aktif(isi.value).filter { it.kunci == kunci && teks in it.payloadJson }

    override suspend fun isiKunciIdempotensi(id: Long, kunciIdempotensi: String) {
        ubah { l -> l.replaceAll { if (it.id == id && it.kunciIdempotensi == null) it.copy(kunciIdempotensi = kunciIdempotensi) else it } }
    }

    override suspend fun payloadAktif(jenis: String): List<String> =
        aktif(isi.value).filter { it.jenis == jenis }.map { it.payloadJson }

    override fun jumlahMenunggu(): Flow<Int> =
        isi.map { l -> l.count { it.status == OutboxEntity.STATUS_MENUNGGU || it.status == OutboxEntity.STATUS_MENGIRIM } }

    override suspend fun klaim(id: Long): Int {
        var n = 0
        ubah { l ->
            l.replaceAll {
                if (it.id == id && it.status == OutboxEntity.STATUS_MENUNGGU) {
                    n = 1
                    it.copy(status = OutboxEntity.STATUS_MENGIRIM)
                } else {
                    it
                }
            }
        }
        return n
    }

    override suspend fun pulihkanKlaim() {
        ubah { l ->
            l.replaceAll {
                if (it.status == OutboxEntity.STATUS_MENGIRIM) {
                    it.copy(status = OutboxEntity.STATUS_MENUNGGU, percobaan = it.percobaan + 1)
                } else {
                    it
                }
            }
        }
    }

    override suspend fun hapusBilaBelumDicoba(id: Long): Int {
        var n = 0
        ubah { l ->
            if (l.removeAll { it.id == id && it.status == OutboxEntity.STATUS_MENUNGGU && it.percobaan == 0 }) n = 1
        }
        return n
    }

    override suspend fun adopsiTanpaPemilik(uid: String) {
        ubah { l -> l.replaceAll { if (it.pemilikUid == null) it.copy(pemilikUid = uid) else it } }
    }

    override fun jumlahGagal(): Flow<Int> =
        isi.map { l -> l.count { it.status == OutboxEntity.STATUS_GAGAL } }
}

/** PetaIdLokalDao di memori. */
class FakePetaIdDao : id.co.monitorkarya.core.data.db.PetaIdLokalDao {
    private val isi = MutableStateFlow<Map<String, id.co.monitorkarya.core.data.db.PetaIdLokalEntity>>(emptyMap())

    val peta: Map<String, String> get() = isi.value.mapValues { it.value.idServer }

    override suspend fun simpan(satu: id.co.monitorkarya.core.data.db.PetaIdLokalEntity) {
        isi.value = isi.value + (satu.idLokal to satu)
    }

    override suspend fun idServer(idLokal: String): String? = isi.value[idLokal]?.idServer

    override fun amati(): Flow<List<id.co.monitorkarya.core.data.db.PetaIdLokalEntity>> = isi.map { it.values.toList() }

    override suspend fun hapusLama(sebelum: Long) {
        isi.value = isi.value.filterValues { it.dibuatPada >= sebelum }
    }
}
