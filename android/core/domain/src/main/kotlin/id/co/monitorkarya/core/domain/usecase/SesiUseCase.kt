// Port alur sesi web (rute /api/login, /api/auth/me, /api/profile/password;
// kebijakan sandi dari src/lib/password-policy.ts) sebagai use case domain.
package id.co.monitorkarya.core.domain.usecase

import id.co.monitorkarya.core.domain.model.PeranPengguna
import kotlin.coroutines.cancellation.CancellationException

/** Hasil upaya masuk; wajibGantiSandi = mustChangePassword (password-policy.ts). */
sealed class HasilLogin {
    data class Sukses(val pengguna: PeranPengguna, val wajibGantiSandi: Boolean) : HasilLogin()
    data class Gagal(val pesan: String, val wajibGantiSandi: Boolean = false) : HasilLogin()
}

/** Hasil ubah kata sandi. */
sealed class HasilUbahSandi {
    object Sukses : HasilUbahSandi()
    data class Gagal(val pesan: String) : HasilUbahSandi()
}

/**
 * Membungkus panggilan sesi dari lapisan data: validasi masukan, pesan galat
 * bahasa Indonesia, dan penanganan gangguan jaringan. Empat fungsi disuntikkan
 * lewat konstruktor supaya lapisan domain tidak bergantung implementasi HTTP.
 */
class SesiUseCase(
    private val login: suspend (String, String) -> HasilLogin,
    private val saya: suspend () -> PeranPengguna?,
    private val gantiSandi: suspend (String, String) -> Boolean,
    private val keluarSesi: suspend () -> Unit,
) {

    /** Masuk dengan nama pengguna + kata sandi; kredensial salah -> PESAN_KREDENSIAL. */
    suspend fun masuk(namaPengguna: String, kataSandi: String): HasilLogin {
        val u = namaPengguna.trim()
        if (u.isEmpty() || kataSandi.isEmpty()) {
            return HasilLogin.Gagal("Nama pengguna dan kata sandi wajib diisi.")
        }
        return try {
            when (val hasil = login(u, kataSandi)) {
                is HasilLogin.Gagal ->
                    if (hasil.pesan.isBlank()) HasilLogin.Gagal(PESAN_KREDENSIAL, hasil.wajibGantiSandi)
                    else hasil
                else -> hasil
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            HasilLogin.Gagal(PESAN_SERVER)
        }
    }

    /** Muat sesi berjalan; null berarti belum masuk. */
    suspend fun muatSaya(): PeranPengguna? = try {
        saya()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }

    /** Ganti kata sandi sendiri; kebijakan panjang dari password-policy.ts. */
    suspend fun ubahSandi(sandiLama: String, sandiBaru: String): HasilUbahSandi {
        if (sandiLama.isEmpty()) return HasilUbahSandi.Gagal("Kata sandi lama wajib diisi.")
        masalahSandiBaru(sandiBaru)?.let { return HasilUbahSandi.Gagal(it) }
        if (sandiBaru == sandiLama) return HasilUbahSandi.Gagal("Kata sandi masih sama dengan yang lama.")
        return try {
            if (gantiSandi(sandiLama, sandiBaru)) HasilUbahSandi.Sukses
            else HasilUbahSandi.Gagal("Kata sandi lama tidak cocok.")
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            HasilUbahSandi.Gagal(PESAN_SERVER)
        }
    }

    /** Keluar sesi; kegagalan jaringan diabaikan karena sesi lokal tetap ditutup. */
    suspend fun keluar() {
        try {
            keluarSesi()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // sengaja ditelan
        }
    }

    companion object {
        /** MIN_PASSWORD_LENGTH / MAX_PASSWORD_LENGTH (src/lib/password-policy.ts). */
        const val MIN_SANDI: Int = 8
        const val MAKS_SANDI: Int = 256

        const val PESAN_KREDENSIAL: String = "Nama pengguna atau kata sandi tidak cocok."
        const val PESAN_SERVER: String = "Tidak dapat menghubungi server. Silakan coba lagi."

        /** passwordProblem(password) di password-policy.ts, label "Kata sandi baru". */
        private fun masalahSandiBaru(s: String): String? = when {
            s.length < MIN_SANDI -> "Kata sandi baru minimal $MIN_SANDI karakter."
            s.length > MAKS_SANDI -> "Kata sandi baru maksimal $MAKS_SANDI karakter."
            s.isBlank() -> "Kata sandi baru tidak boleh hanya spasi."
            else -> null
        }
    }
}
