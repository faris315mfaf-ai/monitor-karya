package id.co.monitorkarya.core.network

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Penyimpanan sesi klien native: tidak ada browser, jadi cookie sesi
 * (mk_session / __Host-mk_session) dikelola sendiri.
 */
interface MkAuthStore {
    /** Simpan pasangan cookie dari semua header Set-Cookie sebuah respons. */
    fun simpan(setCookieHeaders: List<String>)

    /** Nilai header Cookie permintaan ("n=v; n2=v2"), atau null bila kosong. */
    fun header(): String?

    /** Hapus seluruh sesi tersimpan. */
    fun hapus()
}

/** Implementasi terenkripsi berbasis EncryptedSharedPreferences. */
class EncryptedAuthStore(context: Context) : MkAuthStore {

    private val appContext: Context = context.applicationContext

    private val prefs: SharedPreferences by lazy { bukaAtauPulihkan() }

    private fun bangun(): SharedPreferences {
        val masterKey = MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            appContext,
            NAMA_BERKAS,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    /**
     * Berkas sesi atau kunci Keystore bisa rusak/tak terbaca (mis. AEADBadTagException
     * setelah pemulihan perangkat atau kunci Keystore dibatalkan). Tanpa pemulihan
     * setiap permintaan jaringan gagal selamanya; dengan pemulihan pengguna cukup
     * masuk ulang. Sesi yang tak terbaca memang tak berguna.
     */
    @Suppress("TooGenericExceptionCaught")
    private fun bukaAtauPulihkan(): SharedPreferences =
        try {
            bangun()
        } catch (e: Exception) {
            appContext.deleteSharedPreferences(NAMA_BERKAS)
            runCatching {
                java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
                    .deleteEntry(MasterKey.DEFAULT_MASTER_KEY_ALIAS)
            }
            bangun()
        }

    override fun simpan(setCookieHeaders: List<String>) {
        val editor = prefs.edit()
        for (baris in setCookieHeaders) {
            // Ambil pasangan nama=nilai sebelum atribut cookie (Path, Secure, ...).
            val pasangan = baris.substringBefore(';').trim()
            if (pasangan.isEmpty()) continue
            val nama = pasangan.substringBefore('=').trim()
            val nilai = pasangan.substringAfter('=', "").trim()
            if (nama.isEmpty()) continue
            if (nilai.isEmpty()) {
                // Nilai kosong dari server = penanda penghapusan (logout).
                editor.remove(nama)
            } else {
                editor.putString(nama, nilai)
            }
        }
        editor.apply()
    }

    override fun header(): String? =
        prefs.all.entries
            .mapNotNull { (nama, nilai) ->
                if (nilai is String && nilai.isNotEmpty()) "$nama=$nilai" else null
            }
            .takeIf { it.isNotEmpty() }
            ?.joinToString("; ")

    override fun hapus() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val NAMA_BERKAS = "mk_sesi"
    }
}
