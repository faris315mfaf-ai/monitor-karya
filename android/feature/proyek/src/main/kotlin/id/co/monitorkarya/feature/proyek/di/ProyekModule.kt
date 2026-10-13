package id.co.monitorkarya.feature.proyek.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import id.co.monitorkarya.feature.proyek.data.ProyekApi
import javax.inject.Singleton
import retrofit2.Retrofit

/** ProyekApi dari Retrofit bersama (AppModule) — cookie jar dan baseUrl tunggal. */
@Module
@InstallIn(SingletonComponent::class)
object ProyekModule {

    @Provides
    @Singleton
    fun proyekApi(retrofit: Retrofit): ProyekApi = retrofit.create(ProyekApi::class.java)
}
