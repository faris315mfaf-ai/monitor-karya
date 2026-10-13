// Penyedia Hilt modul :feature:entitas. API dibangun dari Retrofit tunggal
// AppModule (satu baseUrl, satu cookie jar sesi). Tidak menyediakan ulang
// AkunApi core:network supaya tidak bertabrakan dengan binding AppModule.
package id.co.monitorkarya.feature.entitas.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import id.co.monitorkarya.feature.entitas.data.EntitasApi
import id.co.monitorkarya.feature.entitas.data.PerusahaanApi
import javax.inject.Singleton
import retrofit2.Retrofit

/**
 * Asal (origin) server, mis. "https://monitorkarya.tech", untuk menyusun URL
 * penuh tautan aktivasi dari path yang dikirim server.
 */
data class AsalServer(val url: String)

@Module
@InstallIn(SingletonComponent::class)
object EntitasModule {

    @Provides
    @Singleton
    fun entitasApi(retrofit: Retrofit): EntitasApi = retrofit.create(EntitasApi::class.java)

    @Provides
    @Singleton
    fun perusahaanApi(retrofit: Retrofit): PerusahaanApi = retrofit.create(PerusahaanApi::class.java)

    @Provides
    @Singleton
    fun asalServer(retrofit: Retrofit): AsalServer = AsalServer(retrofit.baseUrl().toString().trimEnd('/'))
}
