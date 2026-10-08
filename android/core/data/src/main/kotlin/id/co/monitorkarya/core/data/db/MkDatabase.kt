package id.co.monitorkarya.core.data.db

import androidx.room.Database
import androidx.room.RoomDatabase

// Semua kolom primitif (String/Long/Int/Boolean) sehingga @TypeConverters
// tidak diperlukan.
@Database(
    entities = [
        ProjectEntity::class,
        DailyReportEntity::class,
        TaskEntity::class,
        EscalationEntity::class,
        OutboxEntity::class
    ],
    version = 1,
    exportSchema = true
)
abstract class MkDatabase : RoomDatabase() {
    abstract fun projectDao(): ProjectDao
    abstract fun dailyReportDao(): DailyReportDao
    abstract fun taskDao(): TaskDao
    abstract fun escalationDao(): EscalationDao
    abstract fun outboxDao(): OutboxDao
}
