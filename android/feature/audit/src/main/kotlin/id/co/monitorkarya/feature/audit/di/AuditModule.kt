package id.co.monitorkarya.feature.audit.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import id.co.monitorkarya.feature.audit.data.AuditLogApi
import id.co.monitorkarya.feature.audit.data.SistemApi
import javax.inject.Singleton
import retrofit2.Retrofit

/** API modul audit dari Retrofit tunggal yang disediakan AppModule (cookie jar + baseUrl bersama). */
@Module
@InstallIn(SingletonComponent::class)
object AuditModule {

    @Provides
    @Singleton
    fun auditLogApi(retrofit: Retrofit): AuditLogApi = retrofit.create(AuditLogApi::class.java)

    @Provides
    @Singleton
    fun sistemApi(retrofit: Retrofit): SistemApi = retrofit.create(SistemApi::class.java)
}
