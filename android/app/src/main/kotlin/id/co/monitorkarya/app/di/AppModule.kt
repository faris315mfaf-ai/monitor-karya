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

    @Provides
    @Singleton
    fun mkDatabase(@ApplicationContext konteks: Context): MkDatabase = buatDb(konteks)

    @Provides
    @Singleton
    fun mkPrefs(@ApplicationContext konteks: Context): MkPrefs = MkPrefs(konteks)
}
