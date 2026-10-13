// Kosa kata kawat outbox: jenis pesan (diterjemahkan SyncWorker → API) dan
// pembentuk kunci dependensi FIFO. Paket tetap core.data.sync supaya FQN
// JenisOutbox lama (Fase 1) tidak berubah.
package id.co.monitorkarya.core.data.sync

/** Jenis pesan outbox (kosa kata kawat UI ↔ SyncWorker). */
object JenisOutbox {
    /** PUT /api/daily-input — payload = DailyInputRequest (kirim laporan/draf). */
    const val KIRIM_LAPORAN = "KIRIM_LAPORAN"

    /** POST /api/tasks — payload = TaskSaveRequest (projectId terisi). */
    const val TAMBAH_TUGAS = "TAMBAH_TUGAS"

    /** PUT /api/tasks — payload = TaskSaveRequest (id terisi). */
    const val UBAH_TUGAS = "UBAH_TUGAS"

    /** DELETE /api/tasks?id= — payload = {"id": "..."}. */
    const val HAPUS_TUGAS = "HAPUS_TUGAS"

    /** PUT /api/weekly-input — payload = WeeklyItemSaveRequest (week WAJIB terisi). */
    const val SIMPAN_BUTIR_MINGGUAN = "SIMPAN_BUTIR_MINGGUAN"

    /** DELETE /api/weekly-input?itemId= — payload = {"itemId": "..."}. */
    const val HAPUS_BUTIR_MINGGUAN = "HAPUS_BUTIR_MINGGUAN"

    /** POST /api/weekly-input — payload = WeeklyAksiRequest (submit/approve, week WAJIB). */
    const val AKSI_MINGGUAN = "AKSI_MINGGUAN"

    // ---- Laporan harian PIC multi-entri (B2). Payload = badan entri UTUH
    // (EntriSimpanRequest) — tidak lewat TaskSaveRequest yang membuang
    // achievementToday/followUp/needsEscalation. Kunci: KunciOutbox.laporanHarian.

    /** POST /api/tasks — payload = EntriSimpanRequest (projectId + workDate terisi). */
    const val TAMBAH_ENTRI = "TAMBAH_ENTRI"

    /** PUT /api/tasks — payload = EntriSimpanRequest (id terisi; boleh id lokal). */
    const val UBAH_ENTRI = "UBAH_ENTRI"

    /** DELETE /api/tasks?id=&context=HARIAN — payload = PayloadHapusEntri. */
    const val HAPUS_ENTRI = "HAPUS_ENTRI"

    /** POST /api/evidence/upload (multipart) — payload = PayloadUnggahBukti, berkas di folder privat. */
    const val UNGGAH_BUKTI = "UNGGAH_BUKTI"

    /**
     * Jenis yang rutenya menerima header `Idempotency-Key` (gelombang E,
     * E-IDEMPOTENSI.md §2: POST/PUT/DELETE /api/tasks, PUT /api/daily-input,
     * POST /api/evidence/upload). Rute mingguan belum mendukung → tanpa header.
     */
    val BERIDEMPOTENSI: Set<String> = setOf(
        KIRIM_LAPORAN,
        TAMBAH_TUGAS,
        UBAH_TUGAS,
        HAPUS_TUGAS,
        TAMBAH_ENTRI,
        UBAH_ENTRI,
        HAPUS_ENTRI,
        UNGGAH_BUKTI,
    )
}

/**
 * Pembentuk kunci dependensi. Pesan berkunci sama dikirim berurutan dan saling
 * menahan; pilih kunci = "objek server yang sama" (satu laporan, satu minggu
 * divisi). Kunci berbeda tidak saling menunggu.
 */
object KunciOutbox {
    /** Laporan harian + entri/tugasnya untuk satu proyek pada satu hari (YYYY-MM-DD WIB). */
    fun laporanHarian(proyekId: String, tanggalIso: String): String = "laporan:$proyekId:$tanggalIso"

    /** Papan capaian mingguan satu divisi pada satu minggu ("2026-W41"). */
    fun mingguan(divisiId: String, kunciMinggu: String): String = "mingguan:$divisiId:$kunciMinggu"

    const val AWALAN_LAPORAN = "laporan:"
    const val AWALAN_MINGGUAN = "mingguan:"
}
