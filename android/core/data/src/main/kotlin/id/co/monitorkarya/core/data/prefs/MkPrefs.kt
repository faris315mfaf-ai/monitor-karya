package id.co.monitorkarya.core.data.prefs

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.pengaturan: DataStore<Preferences> by preferencesDataStore(name = "mk_pengaturan")

/**
 * Preferensi tampilan dan status sesi: aksen (merah|biru|hijau|ungu|oranye|grafit),
 * tema (light|dark|system), penanda pernah masuk, waktu sinkron terakhir, dan
 * uid pengguna terakhir.
 */
class MkPrefs(private val context: Context) {

    val aksen: Flow<String> = context.pengaturan.data.map { it[AKSEN] ?: "merah" }

    val tema: Flow<String> = context.pengaturan.data.map { it[TEMA] ?: "system" }

    val pernahMasuk: Flow<Boolean> = context.pengaturan.data.map { it[PERNAH_MASUK] ?: false }

    val terakhirSinkron: Flow<Long> = context.pengaturan.data.map { it[TERAKHIR_SINKRON] ?: 0L }

    val uidTerakhir: Flow<String?> = context.pengaturan.data.map { it[UID_TERAKHIR] }

    /**
     * Uid sesi AKTIF (C5-T3): pengguna yang cookie-nya dipakai sekarang dan
     * yang data akun lamanya SUDAH dibersihkan. Diisi tepat sebelum status Siap
     * terbit; dikosongkan saat keluar, sesi berakhir, layar masuk, dan di awal
     * proses masuk (sebelum cookie akun baru tersimpan). Pekerja sinkron hanya
     * mengirim pesan antrean milik uid ini; potret layar (CacheLayar) dikunci
     * per uid ini. Berbeda dari [uidTerakhir] yang sengaja bertahan setelah
     * keluar (praisi layar masuk + deteksi ganti akun).
     */
    val uidSesi: Flow<String?> = context.pengaturan.data.map { it[UID_SESI] }

    suspend fun setAksen(nilai: String) {
        context.pengaturan.edit { it[AKSEN] = nilai }
    }

    suspend fun setTema(nilai: String) {
        context.pengaturan.edit { it[TEMA] = nilai }
    }

    suspend fun setPernahMasuk(nilai: Boolean) {
        context.pengaturan.edit { it[PERNAH_MASUK] = nilai }
    }

    suspend fun setTerakhirSinkron(nilai: Long) {
        context.pengaturan.edit { it[TERAKHIR_SINKRON] = nilai }
    }

    suspend fun setUidTerakhir(nilai: String?) {
        context.pengaturan.edit { prefs ->
            if (nilai == null) prefs.remove(UID_TERAKHIR) else prefs[UID_TERAKHIR] = nilai
        }
    }

    suspend fun setUidSesi(nilai: String?) {
        context.pengaturan.edit { prefs ->
            if (nilai == null) prefs.remove(UID_SESI) else prefs[UID_SESI] = nilai
        }
    }

    private companion object {
        val AKSEN = stringPreferencesKey("aksen")
        val TEMA = stringPreferencesKey("tema")
        val PERNAH_MASUK = booleanPreferencesKey("pernahMasuk")
        val TERAKHIR_SINKRON = longPreferencesKey("terakhirSinkron")
        val UID_TERAKHIR = stringPreferencesKey("uidTerakhir")
        val UID_SESI = stringPreferencesKey("uidSesi")
    }
}
