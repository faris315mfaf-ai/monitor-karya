package id.co.monitorkarya.feature.ringkasangrup.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import id.co.monitorkarya.feature.ringkasangrup.data.AksiPengawasApi
import id.co.monitorkarya.feature.ringkasangrup.data.RingkasanGrupApi
import javax.inject.Singleton
import retrofit2.Retrofit

/** API modul dibuat dari Retrofit bersama (AppModule) supaya cookie & baseUrl tunggal. */
@Module
@InstallIn(SingletonComponent::class)
object RingkasanGrupModule {

    @Provides
    @Singleton
    fun ringkasanGrupApi(retrofit: Retrofit): RingkasanGrupApi = retrofit.create(RingkasanGrupApi::class.java)

    @Provides
    @Singleton
    fun aksiPengawasApi(retrofit: Retrofit): AksiPengawasApi = retrofit.create(AksiPengawasApi::class.java)
}
