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
 * Hasil pemeriksaan sesi tersimpan (GET /api/auth/me) — tri-state supaya
 * "server tak terjangkau" tidak disamakan dengan "belum masuk" (T12: mulai
 * dingin luring dulu dilempar ke layar masuk walau cookie masih sah).
 */
sealed interface HasilSaya {
    /** Server mengenali sesi. */
    data class Sah(val pengguna: PeranPengguna) : HasilSaya

    /** Server menjawab 401 — sesi tidak ada/dicabut; harus masuk lagi. */
    data object TidakSah : HasilSaya

    /** Jaringan/server tidak terjangkau (luring, timeout, 5xx) — status sesi tidak diketahui. */
    data class TakTerjangkau(val pesan: String) : HasilSaya
}

/** Keputusan gerbang saat mulai dingin. */
sealed interface KeputusanMulai {
    /** Masuk ke shell; [luring] = memakai profil tersimpan tanpa konfirmasi server. */
    data class Masuk(val pengguna: PeranPengguna, val luring: Boolean) : KeputusanMulai

    /** Ke layar masuk; [pesan] opsional untuk formulir. */
    data class KeLogin(val pesan: String?) : KeputusanMulai
}

/**
 * Galat yang pesannya sudah siap tampil (bahasa Indonesia) dari lapisan data,
 * mis. 429 "Coba lagi dalam 15 menit" atau 422 "Kata sandi saat ini salah.".
 * Tanpa ini semua galat non-jaringan jatuh ke [SesiUseCase.PESAN_SERVER]
 * ("Tidak dapat menghubungi server") padahal server menjawab.
 */
class GalatSesi(pesan: String) : Exception(pesan)

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

    /**
     * Periksa sesi berjalan. Lambda [saya] mengembalikan pengguna (sah), null
     * (401 — tidak sah), atau melempar (jaringan/5xx — tak terjangkau).
     */
    suspend fun muatSaya(): HasilSaya = try {
        saya()?.let { HasilSaya.Sah(it) } ?: HasilSaya.TidakSah
    } catch (e: CancellationException) {
        throw e
    } catch (e: GalatSesi) {
        HasilSaya.TakTerjangkau(e.message?.takeIf { it.isNotBlank() } ?: PESAN_SERVER)
    } catch (e: Exception) {
        HasilSaya.TakTerjangkau(PESAN_SERVER)
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
        } catch (e: GalatSesi) {
            HasilUbahSandi.Gagal(e.message?.takeIf { it.isNotBlank() } ?: PESAN_SERVER)
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

        const val PESAN_LURING_TANPA_PROFIL: String =
            "Tidak dapat menghubungi server. Periksa koneksi internet lalu masuk kembali."

        /**
         * Gerbang mulai dingin (offline-first, Rancangan §4):
         * - Sah → masuk daring;
         * - TidakSah (401 nyata) → layar masuk, apa pun yang tersimpan;
         * - TakTerjangkau + cookie masih ada + profil terakhir tersimpan →
         *   masuk ke shell dengan data Room dan penanda luring; sesi divalidasi
         *   ulang begitu jaringan kembali (401 saat itu → layar masuk);
         * - TakTerjangkau tanpa cookie/profil → layar masuk dengan pesan koneksi.
         */
        fun putuskanMulai(
            hasil: HasilSaya,
            adaCookie: Boolean,
            profilTersimpan: PeranPengguna?,
        ): KeputusanMulai = when (hasil) {
            is HasilSaya.Sah -> KeputusanMulai.Masuk(hasil.pengguna, luring = false)
            HasilSaya.TidakSah -> KeputusanMulai.KeLogin(null)
            is HasilSaya.TakTerjangkau ->
                if (adaCookie && profilTersimpan != null) {
                    KeputusanMulai.Masuk(profilTersimpan, luring = true)
                } else {
                    KeputusanMulai.KeLogin(if (adaCookie) PESAN_LURING_TANPA_PROFIL else null)
                }
        }

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
