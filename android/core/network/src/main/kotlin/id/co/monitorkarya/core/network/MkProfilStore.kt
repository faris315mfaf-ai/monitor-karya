// Profil pengguna terakhir untuk mulai dingin luring (A1-LURING.md §1).
// Disimpan TERENKRIPSI (nama/email = data pribadi) di berkas terpisah dari
// cookie sesi — MkAuthStore.header() merangkai SEMUA entri berkasnya menjadi
// header Cookie, jadi profil tidak boleh menumpang di sana.
package id.co.monitorkarya.core.network

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.model.PeranPengguna
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** Penyimpanan profil pengguna terakhir yang terverifikasi server. */
interface MkProfilStore {
    fun simpan(pengguna: PeranPengguna)

    /** Profil tersimpan; null bila tidak ada atau rusak. */
    fun baca(): PeranPengguna?

    fun hapus()
}

/** PeranPengguna → JSON ringkas (versi 1). */
fun profilKeJson(p: PeranPengguna): String = buildJsonObject {
    put("v", 1)
    put("id", p.id)
    put("nama", p.nama)
    put("email", p.email)
    put("peran", p.peran.name)
    p.scopeEntitasId?.let { put("scope", it) }
}.toString()

/** JSON → PeranPengguna; null bila rusak/peran tak dikenal (lebih aman masuk ulang). */
fun profilDariJson(json: String?): PeranPengguna? = runCatching {
    val o = mkJson.parseToJsonElement(json ?: return null) as JsonObject
    fun teks(k: String) = (o[k] as? JsonPrimitive)?.contentOrNull
    val peran = Peran.entries.firstOrNull { it.name == teks("peran") } ?: return null
    PeranPengguna(
        id = teks("id")?.takeIf { it.isNotEmpty() } ?: return null,
        nama = teks("nama").orEmpty(),
        email = teks("email").orEmpty(),
        peran = peran,
        scopeEntitasId = o["scope"]?.jsonPrimitive?.contentOrNull,
    )
}.getOrNull()

/** Implementasi EncryptedSharedPreferences; gagal buka → nonaktif (tanpa profil, aman). */
class EncryptedProfilStore(context: Context) : MkProfilStore {

    private val appContext = context.applicationContext

    private val prefs: SharedPreferences? by lazy { buka() }

    private fun bangun(): SharedPreferences {
        val kunci = MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            appContext,
            NAMA_BERKAS,
            kunci,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    /**
     * Berkas rusak → hapus berkas profil saja lalu coba sekali lagi. Kunci induk
     * Keystore TIDAK dihapus di sini (dipakai bersama EncryptedAuthStore);
     * bila tetap gagal, profil dinonaktifkan — mulai dingin luring jatuh ke
     * layar masuk, perilaku lama yang aman.
     */
    @Suppress("TooGenericExceptionCaught", "SwallowedException")
    private fun buka(): SharedPreferences? =
        try {
            bangun()
        } catch (e: Exception) {
            appContext.deleteSharedPreferences(NAMA_BERKAS)
            try {
                bangun()
            } catch (e2: Exception) {
                null
            }
        }

    override fun simpan(pengguna: PeranPengguna) {
        prefs?.edit()?.putString(KUNCI, profilKeJson(pengguna))?.apply()
    }

    @Suppress("TooGenericExceptionCaught", "SwallowedException")
    override fun baca(): PeranPengguna? =
        try {
            profilDariJson(prefs?.getString(KUNCI, null))
        } catch (e: Exception) {
            null
        }

    override fun hapus() {
        prefs?.edit()?.clear()?.apply()
    }

    private companion object {
        const val NAMA_BERKAS = "mk_profil"
        const val KUNCI = "profil"
    }
}
