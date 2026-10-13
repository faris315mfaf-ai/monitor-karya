package id.co.monitorkarya.core.data.db

import android.content.Context
import androidx.room.Room

/**
 * Basis data luring tunggal. TIDAK lagi memakai fallbackToDestructiveMigration
 * umum: tabel outbox memuat tulisan pengguna yang belum terkirim, jadi setiap
 * kenaikan versi wajib lewat Migration nyata (MigrasiMk). Hanya versi
 * pra-rilis 1 (outbox belum punya penulis) yang boleh dibangun ulang. Turun
 * versi (pasang APK lebih lama) sengaja tidak ditangani — tidak mungkin lewat
 * Play (versionCode) dan lebih baik gagal keras daripada diam-diam menghapus
 * antrean.
 */
fun buatDb(context: Context): MkDatabase =
    Room.databaseBuilder(
        context.applicationContext,
        MkDatabase::class.java,
        "monitorkarya.db"
    )
        .addMigrations(*MigrasiMk.SEMUA)
        .fallbackToDestructiveMigrationFrom(true, *MigrasiMk.VERSI_PRA_RILIS)
        .build()
