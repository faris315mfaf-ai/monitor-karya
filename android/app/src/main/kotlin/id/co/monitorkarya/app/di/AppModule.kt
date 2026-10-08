// Penyedia dependensi tunggal aplikasi (Rancangan §6: DI dipusatkan di :app).
// Semua objek Singleton: sesi terenkripsi, OkHttpClient, Retrofit bersama,
// dua API, basis data Room, dan preferensi DataStore.
package id.co.monitorkarya.app.di

import android.content.Context
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import id.co.monitorkarya.app.BuildConfig
import id.co.monitorkarya.core.data.db.MkDatabase
import id.co.monitorkarya.core.data.db.buatDb
import id.co.monitorkarya.core.data.prefs.MkPrefs
import id.co.monitorkarya.core.network.EncryptedAuthStore
import id.co.monitorkarya.core.network.MkAuthStore
import id.co.monitorkarya.core.network.MkClient
import id.co.monitorkarya.core.network.api.AuthApi
import id.co.monitorkarya.core.network.api.AdminComplianceApi
import id.co.monitorkarya.core.network.api.AkunApi
import id.co.monitorkarya.core.network.api.DailyInputApi
import id.co.monitorkarya.core.network.api.DailyReportsApi
import id.co.monitorkarya.core.network.api.EvidenceApi
import id.co.monitorkarya.core.network.api.InboxApi
import id.co.monitorkarya.core.network.api.KadivApi
import id.co.monitorkarya.core.network.api.LaporanDibacaApi
import id.co.monitorkarya.core.network.api.NotificationsApi
import id.co.monitorkarya.core.network.api.ProjectsApi
import id.co.monitorkarya.core.network.api.TasksApi
import id.co.monitorkarya.core.network.api.UndoApi
import id.co.monitorkarya.core.network.api.UnlockApi
import id.co.monitorkarya.core.network.api.WeeklyInputApi
import id.co.monitorkarya.core.network.api.WeeklyReportsApi
import id.co.monitorkarya.core.network.api.WorkDeskApi
import id.co.monitorkarya.core.network.api.RingkasanApi
import id.co.monitorkarya.core.network.mkJson
import javax.inject.Singleton
import kotlinx.serialization.ExperimentalSerializationApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    /** Cookie sesi hanya boleh tersimpan terenkripsi (Rancangan §8). */
    @Provides
    @Singleton
    fun authStore(@ApplicationContext konteks: Context): MkAuthStore = EncryptedAuthStore(konteks)

    @Provides
    @Singleton
    fun okHttpClient(authStore: MkAuthStore): OkHttpClient =
        MkClient.okHttp(authStore, BuildConfig.DEBUG)

    @Provides
    @Singleton
    fun retrofit(ok: OkHttpClient): Retrofit = retrofit(baseUrl = BuildConfig.BASE_URL, ok = ok)

    /** Satu Retrofit dibagikan semua API supaya cookie jar dan baseUrl tunggal. */
    @OptIn(ExperimentalSerializationApi::class)
    fun retrofit(baseUrl: String, ok: OkHttpClient): Retrofit =
        Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(ok)
            .addConverterFactory(mkJson.asConverterFactory("application/json".toMediaType()))
            .build()

    @Provides
    @Singleton
    fun authApi(retrofit: Retrofit): AuthApi = retrofit.create(AuthApi::class.java)

    @Provides
    @Singleton
    fun ringkasanApi(retrofit: Retrofit): RingkasanApi = retrofit.create(RingkasanApi::class.java)


    // API Fase 1 + Fase 2 — dipusatkan di sini (integrasi Zcode).
    @Provides
    @Singleton
    fun dailyInputApi(retrofit: Retrofit): DailyInputApi = retrofit.create(DailyInputApi::class.java)
    @Provides
    @Singleton
    fun tasksApi(retrofit: Retrofit): TasksApi = retrofit.create(TasksApi::class.java)
    @Provides
    @Singleton
    fun evidenceApi(retrofit: Retrofit): EvidenceApi = retrofit.create(EvidenceApi::class.java)
    @Provides
    @Singleton
    fun workDeskApi(retrofit: Retrofit): WorkDeskApi = retrofit.create(WorkDeskApi::class.java)
    @Provides
    @Singleton
    fun projectsApi(retrofit: Retrofit): ProjectsApi = retrofit.create(ProjectsApi::class.java)
    @Provides
    @Singleton
    fun dailyReportsApi(retrofit: Retrofit): DailyReportsApi = retrofit.create(DailyReportsApi::class.java)
    @Provides
    @Singleton
    fun unlockApi(retrofit: Retrofit): UnlockApi = retrofit.create(UnlockApi::class.java)
    @Provides
    @Singleton
    fun undoApi(retrofit: Retrofit): UndoApi = retrofit.create(UndoApi::class.java)
    @Provides
    @Singleton
    fun notificationsApi(retrofit: Retrofit): NotificationsApi = retrofit.create(NotificationsApi::class.java)
    @Provides
    @Singleton
    fun weeklyInputApi(retrofit: Retrofit): WeeklyInputApi = retrofit.create(WeeklyInputApi::class.java)
    @Provides
    @Singleton
    fun weeklyReportsApi(retrofit: Retrofit): WeeklyReportsApi = retrofit.create(WeeklyReportsApi::class.java)
    @Provides
    @Singleton
    fun kadivApi(retrofit: Retrofit): KadivApi = retrofit.create(KadivApi::class.java)
    @Provides
    @Singleton
    fun laporanDibacaApi(retrofit: Retrofit): LaporanDibacaApi = retrofit.create(LaporanDibacaApi::class.java)
    @Provides
    @Singleton
    fun inboxApi(retrofit: Retrofit): InboxApi = retrofit.create(InboxApi::class.java)
    @Provides
    @Singleton
    fun adminComplianceApi(retrofit: Retrofit): AdminComplianceApi = retrofit.create(AdminComplianceApi::class.java)
    @Provides
    @Singleton
    fun akunApi(retrofit: Retrofit): AkunApi = retrofit.create(AkunApi::class.java)
    /** Port meja-laporan JsonObject layar Laporan (T5-B5). */
    @Provides
    @Singleton
    fun laporanDeskApi(retrofit: Retrofit): id.co.monitorkarya.app.ui.laporan.LaporanDeskApi =
        retrofit.create(id.co.monitorkarya.app.ui.laporan.LaporanDeskApi::class.java)
    @Provides
    @Singleton
    fun mkDatabase(@ApplicationContext konteks: Context): MkDatabase = buatDb(konteks)

    @Provides
    @Singleton
    fun mkPrefs(@ApplicationContext konteks: Context): MkPrefs = MkPrefs(konteks)
}
