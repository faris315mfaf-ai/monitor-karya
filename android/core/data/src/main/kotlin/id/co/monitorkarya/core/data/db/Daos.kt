package id.co.monitorkarya.core.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface ProjectDao {

    @Upsert
    suspend fun simpan(semua: List<ProjectEntity>)

    @Upsert
    suspend fun simpan(satu: ProjectEntity)

    @Query("SELECT * FROM proyek ORDER BY name COLLATE NOCASE ASC")
    fun pilihSemua(): Flow<List<ProjectEntity>>

    @Query("SELECT * FROM proyek WHERE id = :id")
    fun pilih(id: String): Flow<ProjectEntity?>

    @Query("DELETE FROM proyek WHERE tersinkronPada < :sebelum")
    suspend fun hapusTersinkronLama(sebelum: Long)
}

@Dao
interface DailyReportDao {

    @Upsert
    suspend fun simpan(semua: List<DailyReportEntity>)

    @Upsert
    suspend fun simpan(satu: DailyReportEntity)

    @Query("SELECT * FROM daily_report WHERE proyek_id = :proyekId ORDER BY tanggal DESC")
    fun pilihPerProyek(proyekId: String): Flow<List<DailyReportEntity>>

    @Query("DELETE FROM daily_report WHERE tersinkronPada < :sebelum")
    suspend fun hapusTersinkronLama(sebelum: Long)
}

@Dao
interface TaskDao {

    @Upsert
    suspend fun simpan(semua: List<TaskEntity>)

    @Upsert
    suspend fun simpan(satu: TaskEntity)

    @Query("SELECT * FROM tugas WHERE proyekId = :proyekId ORDER BY tanggalKerja DESC, urutan ASC")
    fun pilihPerProyek(proyekId: String): Flow<List<TaskEntity>>

    @Query("DELETE FROM tugas WHERE tersinkronPada < :sebelum")
    suspend fun hapusTersinkronLama(sebelum: Long)

    /**
     * Cermin setia SATU lajur: tugas HARIAN satu proyek pada satu hari kerja yang
     * tidak ikut tersegar. Wajib dibatasi proyek+hari — penyegaran proyek B tidak
     * boleh menghapus tugas proyek A atau hari lain yang disimpan lebih awal.
     */
    @Query(
        "DELETE FROM tugas WHERE proyekId = :proyekId AND tanggalKerja = :tanggalKerja " +
            "AND cakupan = 'HARIAN' AND tersinkronPada < :sebelum"
    )
    suspend fun hapusTersinkronLamaHari(proyekId: String, tanggalKerja: Long, sebelum: Long)

    @Query("DELETE FROM tugas WHERE id = :id")
    suspend fun hapusSatu(id: String)
}

@Dao
interface EscalationDao {

    @Upsert
    suspend fun simpan(semua: List<EscalationEntity>)

    @Upsert
    suspend fun simpan(satu: EscalationEntity)

    @Query("SELECT * FROM eskalasi WHERE proyekId = :proyekId ORDER BY diajukanPada DESC")
    fun pilihPerProyek(proyekId: String): Flow<List<EscalationEntity>>

    @Query("SELECT * FROM eskalasi ORDER BY diajukanPada DESC")
    fun pilihSemua(): Flow<List<EscalationEntity>>

    // Eskalasi tidak punya kolom tersinkronPada: penyegaran penuh lewat simpan.
}

/**
 * Antrean tulisan tertunda. Status: MENUNGGU → (BERHASIL, dihapus) | GAGAL
 * (final, menunggu tindakan pengguna: ulangi atau buang). Kontrak pemroses di
 * OutboxProsesor; penulis lewat AntreanOutbox.
 */
@Dao
interface OutboxDao {

    /** Simpan/ganti satu baris (dipakai tes dan perbaikan manual). */
    @Upsert
    suspend fun simpan(satu: OutboxEntity): Long

    /** Tambah pesan baru; id autoincrement = urutan FIFO. */
    @Insert
    suspend fun tambah(baru: OutboxEntity): Long

    /** Pesan MENUNGGU urut id (FIFO). */
    @Query("SELECT * FROM outbox WHERE status = 'MENUNGGU' ORDER BY id ASC")
    fun antrian(): Flow<List<OutboxEntity>>

    /**
     * Potret MENUNGGU + MENGIRIM + GAGAL urut id — GAGAL ikut supaya menahan
     * kunci yang sama; MENGIRIM (klaim pemroses, C5-T2) tetap "aktif".
     */
    @Query("SELECT * FROM outbox WHERE status IN ('MENUNGGU', 'MENGIRIM', 'GAGAL') ORDER BY id ASC")
    suspend fun semuaAktif(): List<OutboxEntity>

    /** Pengamatan aktif untuk penanda UI "Menunggu kirim"/"Gagal kirim" (MENGIRIM = menunggu). */
    @Query("SELECT * FROM outbox WHERE status IN ('MENUNGGU', 'MENGIRIM', 'GAGAL') ORDER BY id ASC")
    fun amatiAktif(): Flow<List<OutboxEntity>>

    /**
     * Klaim satu baris sebelum dikirim (C5-T2, kunci baris): MENUNGGU →
     * MENGIRIM secara atomik. 0 = baris sudah diklaim/dibuang/berubah —
     * pemroses TIDAK mengirimnya.
     */
    @Query("UPDATE outbox SET status = 'MENGIRIM' WHERE id = :id AND status = 'MENUNGGU'")
    suspend fun klaim(id: Long): Int

    /**
     * Klaim yatim (proses mati/pekerja dihentikan di tengah kiriman) kembali
     * MENUNGGU dengan percobaan +1 — kiriman itu AMBIGU (server mungkin sudah
     * commit), jadi ulangan memakai kunci idempotensi yang sama. Hanya dipanggil
     * pemroses di bawah kunci proses (tidak ada klaim lain yang hidup).
     */
    @Query("UPDATE outbox SET status = 'MENUNGGU', percobaan = percobaan + 1 WHERE status = 'MENGIRIM'")
    suspend fun pulihkanKlaim()

    /**
     * Buang pesan yang PASTI belum pernah dicoba (C5-T1/S1): MENUNGGU dan
     * percobaan 0 — bukan sedang dikirim (MENGIRIM) dan tidak ambigu.
     * @return 1 bila terbuang.
     */
    @Query("DELETE FROM outbox WHERE id = :id AND status = 'MENUNGGU' AND percobaan = 0")
    suspend fun hapusBilaBelumDicoba(id: Long): Int

    /** Baris tanpa pemilik (pra-v6) diadopsi [uid] — hanya saat sesi uid yang sama siap. */
    @Query("UPDATE outbox SET pemilikUid = :uid WHERE pemilikUid IS NULL")
    suspend fun adopsiTanpaPemilik(uid: String)

    @Query("UPDATE outbox SET status = :status, pesanGalat = :pesan, percobaan = :percobaan WHERE id = :id")
    suspend fun tandai(id: Long, status: String, pesan: String?, percobaan: Int)

    /** Hasil satu percobaan kirim, termasuk jadwal backoff berikutnya. */
    @Query(
        "UPDATE outbox SET status = :status, pesanGalat = :pesan, percobaan = :percobaan, " +
            "berikutnyaPada = :berikutnyaPada WHERE id = :id"
    )
    suspend fun perbarui(id: Long, status: String, pesan: String?, percobaan: Int, berikutnyaPada: Long)

    @Query("DELETE FROM outbox WHERE status = 'BERHASIL'")
    suspend fun hapusBerhasil()

    /**
     * Batas antre 7 hari (RANCANGAN-ANDROID-NATIVE.md §4): pesan MENUNGGU yang
     * dibuat sebelum [sebelum] menjadi GAGAL (tidak dihapus diam-diam —
     * pengguna harus tahu tulisannya tidak terkirim).
     */
    @Query(
        "UPDATE outbox SET status = 'GAGAL', " +
            "pesanGalat = CASE WHEN percobaan > 0 THEN :pesanAmbigu ELSE :pesan END " +
            "WHERE status = 'MENUNGGU' AND dibuatPada < :sebelum"
    )
    suspend fun tandaiKedaluwarsa(sebelum: Long, pesan: String, pesanAmbigu: String)

    /** Bersih-bersih GAGAL yang sangat lama (tak pernah ditindak pengguna). */
    @Query("DELETE FROM outbox WHERE status = 'GAGAL' AND dibuatPada < :sebelum")
    suspend fun hapusGagalLama(sebelum: Long)

    /** Pengguna membuang satu pesan (biasanya yang GAGAL). */
    @Query("DELETE FROM outbox WHERE id = :id")
    suspend fun hapus(id: Long)

    /**
     * Pengguna meminta kirim ulang pesan GAGAL. Umur antre dihitung ulang dari
     * [sekarang] supaya pesan tidak langsung kedaluwarsa lagi.
     */
    @Query(
        "UPDATE outbox SET status = 'MENUNGGU', percobaan = 0, berikutnyaPada = 0, " +
            "pesanGalat = NULL, dibuatPada = :sekarang WHERE id = :id AND status = 'GAGAL'"
    )
    suspend fun ulangi(id: Long, sekarang: Long)

    /** Satu baris terkini (pemroses membaca ulang sebelum mengirim — payload bisa diganti id lokal). */
    @Query("SELECT * FROM outbox WHERE id = :id")
    suspend fun ambil(id: Long): OutboxEntity?

    /**
     * Ganti teks [lama] → [baru] di payload pesan aktif berkunci [kunci] (B2):
     * dipakai setelah entri yang ditambahkan luring mendapat id server, untuk
     * mengganti "\"lokal:<n>\"" pada ubah/hapus/unggah bukti penerusnya.
     */
    @Query(
        "UPDATE outbox SET payloadJson = REPLACE(payloadJson, :lama, :baru) " +
            "WHERE kunci = :kunci AND status IN ('MENUNGGU', 'MENGIRIM', 'GAGAL')"
    )
    suspend fun gantiTeksPayload(kunci: String, lama: String, baru: String)

    /** Pesan aktif berkunci [kunci] yang payload-nya memuat [teks] (pengikut id lokal). */
    @Query(
        "SELECT * FROM outbox WHERE kunci = :kunci AND status IN ('MENUNGGU', 'MENGIRIM', 'GAGAL') " +
            "AND instr(payloadJson, :teks) > 0 ORDER BY id ASC"
    )
    suspend fun aktifMemuat(kunci: String, teks: String): List<OutboxEntity>

    /**
     * Isi kunci idempotensi pesan yang belum punya (baris lama/jalur lain) —
     * HANYA bila masih null, jadi kunci yang sudah pernah terkirim tidak
     * pernah diganti (gelombang E).
     */
    @Query("UPDATE outbox SET kunciIdempotensi = :kunciIdempotensi WHERE id = :id AND kunciIdempotensi IS NULL")
    suspend fun isiKunciIdempotensi(id: Long, kunciIdempotensi: String)

    /** Payload semua pesan aktif berjenis [jenis] (penyapu berkas bukti yatim). */
    @Query("SELECT payloadJson FROM outbox WHERE jenis = :jenis AND status IN ('MENUNGGU', 'MENGIRIM', 'GAGAL')")
    suspend fun payloadAktif(jenis: String): List<String>

    @Query("SELECT COUNT(*) FROM outbox WHERE status IN ('MENUNGGU', 'MENGIRIM')")
    fun jumlahMenunggu(): Flow<Int>

    @Query("SELECT COUNT(*) FROM outbox WHERE status = 'GAGAL'")
    fun jumlahGagal(): Flow<Int>
}

/**
 * Potret bacaan layar terakhir (B2, Room v4): JSON respons server per layar
 * ("laporan:meja:<tgl>", "laporan:entri:<proyek>:<tgl>", "meja-kerja:pic", ...)
 * supaya layar PIC tetap terbaca saat luring dengan penanda "data tersimpan".
 */
@Dao
interface CacheLayarDao {

    @Upsert
    suspend fun simpan(satu: CacheLayarEntity)

    @Query("SELECT * FROM cache_layar WHERE kunci = :kunci")
    suspend fun ambil(kunci: String): CacheLayarEntity?

    @Query("DELETE FROM cache_layar WHERE disimpanPada < :sebelum")
    suspend fun hapusLama(sebelum: Long)
}

/** Peta id lokal entri luring → id server (C5-T1, Room v6). */
@Dao
interface PetaIdLokalDao {

    @Upsert
    suspend fun simpan(satu: PetaIdLokalEntity)

    /** id server untuk [idLokal] ("lokal:<n>"); null bila TAMBAH-nya belum/tidak pernah sukses. */
    @Query("SELECT idServer FROM peta_id_lokal WHERE idLokal = :idLokal")
    suspend fun idServer(idLokal: String): String?

    @Query("SELECT * FROM peta_id_lokal")
    fun amati(): Flow<List<PetaIdLokalEntity>>

    @Query("DELETE FROM peta_id_lokal WHERE dibuatPada < :sebelum")
    suspend fun hapusLama(sebelum: Long)
}

@Dao
interface DrafSuntingDao {

    @Upsert
    suspend fun simpan(satu: DrafSuntingEntity)

    @Query("SELECT * FROM draf_sunting WHERE kunci = :kunci")
    suspend fun ambil(kunci: String): DrafSuntingEntity?

    @Query("DELETE FROM draf_sunting WHERE kunci = :kunci")
    suspend fun hapus(kunci: String)

    /** Draf milik akun selain [uid] (sisa akun lama bila pembersihan gagal). */
    @Query("DELETE FROM draf_sunting WHERE uid != :uid")
    suspend fun hapusSelainUid(uid: String)

    @Query("DELETE FROM draf_sunting WHERE uid = :uid")
    suspend fun hapusPerUid(uid: String)

    @Query("DELETE FROM draf_sunting WHERE disimpanPada < :sebelum")
    suspend fun hapusLama(sebelum: Long)
}
