package id.co.monitorkarya.core.data.db

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * DAO Fase 2 — pola sama dengan Daos.kt F0: upsert daftar/satu, baca Flow,
 * dan pembersihan baris basi. Accessor di MkDatabase ditambahkan parent saat
 * integrasi (naikkan versi basis data ke 2).
 */

@Dao
interface MingguanLaporanDao {

    @Upsert
    suspend fun simpan(semua: List<MingguanLaporanEntity>)

    @Upsert
    suspend fun simpan(satu: MingguanLaporanEntity)

    @Query("SELECT * FROM mingguan_laporan ORDER BY isoTahun DESC, isoMinggu DESC, tersinkronPada DESC")
    fun pilihSemua(): Flow<List<MingguanLaporanEntity>>

    @Query("SELECT * FROM mingguan_laporan WHERE id = :id")
    fun pilih(id: String): Flow<MingguanLaporanEntity?>

    @Query("SELECT * FROM mingguan_laporan WHERE divisiId = :divisiId ORDER BY isoTahun DESC, isoMinggu DESC")
    fun pilihPerDivisi(divisiId: String): Flow<List<MingguanLaporanEntity>>

    @Query("DELETE FROM mingguan_laporan WHERE tersinkronPada < :sebelum")
    suspend fun hapusTersinkronLama(sebelum: Long)
}

@Dao
interface MingguanButirDao {

    @Upsert
    suspend fun simpan(semua: List<MingguanButirEntity>)

    @Upsert
    suspend fun simpan(satu: MingguanButirEntity)

    @Query("SELECT * FROM mingguan_butir WHERE laporanMingguanId = :laporanId ORDER BY urutan ASC")
    fun pilihPerLaporan(laporanId: String): Flow<List<MingguanButirEntity>>

    // Butir sengaja tanpa tersinkronPada (mengikuti spesifikasi tugas): baris
    // yang hilang dari respons terbaru dibuang per laporan lewat hapusYangLama.
    @Query("DELETE FROM mingguan_butir WHERE laporanMingguanId = :laporanId AND id NOT IN (:pertahankan)")
    suspend fun hapusYangLama(laporanId: String, pertahankan: List<String>)

    @Query("DELETE FROM mingguan_butir WHERE laporanMingguanId = :laporanId")
    suspend fun hapusPerLaporan(laporanId: String)
}

@Dao
interface PenerimaanDao {

    @Upsert
    suspend fun simpan(semua: List<PenerimaanEntity>)

    @Upsert
    suspend fun simpan(satu: PenerimaanEntity)

    @Query("SELECT * FROM penerimaan ORDER BY jenis ASC, judul COLLATE NOCASE ASC")
    fun pilihSemua(): Flow<List<PenerimaanEntity>>

    @Query("SELECT * FROM penerimaan WHERE jenis = :jenis ORDER BY judul COLLATE NOCASE ASC")
    fun pilihPerJenis(jenis: String): Flow<List<PenerimaanEntity>>

    @Query("SELECT * FROM penerimaan WHERE id = :id")
    fun pilih(id: String): Flow<PenerimaanEntity?>

    // Baca sekali (bukan Flow) untuk pertahankan undoToken saat penyegaran.
    @Query("SELECT * FROM penerimaan WHERE id = :id")
    suspend fun ambil(id: String): PenerimaanEntity?

    // Antrean adalah potret hari berjalan: baris yang tidak disegarkan sepekan
    // dianggap basi (batas antre 7 hari, RANCANGAN-ANDROID-NATIVE.md §4).
    @Query("DELETE FROM penerimaan WHERE tersinkronPada < :sebelum")
    suspend fun hapusTersinkronLama(sebelum: Long)
}
