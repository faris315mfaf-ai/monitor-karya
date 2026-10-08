package id.co.monitorkarya.core.data.db

import android.content.Context
import androidx.room.Room

fun buatDb(context: Context): MkDatabase =
    Room.databaseBuilder(
        context.applicationContext,
        MkDatabase::class.java,
        "monitorkarya.db"
    )
        // Hanya fase 0: biarkan data luring terhapus saat skema berubah tanpa
        // migrasi. Sebelum rilis ganti dengan migrasi bernomor sungguhan.
        .fallbackToDestructiveMigration(dropAllTables = true)
        .build()
