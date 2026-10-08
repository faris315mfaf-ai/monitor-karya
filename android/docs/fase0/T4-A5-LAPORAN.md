# T4-A5 — Lapisan jaringan Android (Fase 0)

Modul: `android/core/network/src/main/kotlin/id/co/monitorkarya/core/network/`

## Berkas

| Berkas | Isi |
| --- | --- |
| `MkAuthStore.kt` | Interface penyimpanan sesi + `EncryptedAuthStore` (EncryptedSharedPreferences `mk_sesi`, MasterKey AES256_GCM). Simpan semua pasangan cookie dari header `Set-Cookie`; nilai kosong (penanda hapus saat logout) justru dihapus dari simpanan. `header()` menggabung `n=v; n2=v2`. |
| `MkClient.kt` | `MkClient.okHttp(authStore, debug)`: CookieJar menulis respons ke store, header `Cookie` permintaan dipasang interceptor dari `authStore.header()`; header `X-MK-Client: android/0.1.0`, `User-Agent: MonitorKarya-Android/0.1.0`; `HttpLoggingInterceptor(BASIC)` bila debug; timeout 10s/30s/60s (connect/read/write); `followRedirects(true)`. |
| `JsonConfig.kt` | `mkJson` — `ignoreUnknownKeys`, `coerceInputValues`, `isLenient`. |
| `ApiError.kt` | Sealed class + `ApiError.dari(t, offlineDeteksi)` + `pesanTampil()`. |
| `dto/Dtos.kt` | DTO `@Serializable` persis dari route. |
| `api/AuthApi.kt` | Retrofit interface: login/saya/keluar/gantiSandi. |
| `api/RingkasanApi.kt` | `ringkasan(): Response<JsonObject>`; parsing detail menunggu Fase 1. |
| `Factory.kt` | `buatApi(ok, baseUrl, kelas)` — Retrofit + `mkJson.asConverterFactory("application/json")`; baseUrl wajib akhir `/` (divalidasi `require`). |

## Aturan penting (dari src/proxy.ts)

- **Jangan pernah menyetel header `Origin`** (juga `Sec-Fetch-Site`). Klien native memang tanpa kedua header itu, sehingga `isCrossSite()` mengembalikan false dan permintaan lolos cek CSRF proxy ke pemeriksaan sesi. Ini sudah dijamin `MkClient` (tidak ada kode yang menyeting Origin) dan ditegaskan komentar.
- Proxy juga membatasi ukuran badan API (1 MB; unggah 21 MB di `/api/evidence/upload`) — tidak relevan untuk DTO kecil ini.
- Cookie sesi: `mk_session` (dev) / `__Host-mk_session` (prod), HttpOnly, SameSite=Lax, Secure+Path=/ di produksi. Klien menyimpan dan mengirim ulang nilainya lewat header `Cookie` (HttpOnly hanya berlaku di browser).

## Bentuk respons yang dibakukan (sumber kode 8 Okt 2026)

Semua galat bertungku `{ "error": string }` (aman untuk klien, tanpa detail internal).

### POST /api/auth/login — `LoginRequest { identifier, password }`

Sukses 200 (lengkap dengan `Set-Cookie` sesi):

```json
{
  "user": { "id": "…", "name": "…", "email": "…", "username": "…" , "role": "MANAJEMEN" },
  "mustChangePassword": false
}
```

- `username` bisa `null` (akun lama berbasis email).
- Galat: 400 `{error}` badan tidak valid; 401 `{error:"Username atau kata sandi salah"}`; 403 `{error:"Akun ini dinonaktifkan"}`; 429 `{error, retryAfter}` + header `Retry-After`; 503 `{error:"Database tidak terjangkau dari server ini."}`.

### GET /api/auth/me

Sukses 200:

```json
{
  "user": {
    "id": "…", "name": "…", "email": "…", "role": "PIC_PROYEK",
    "scopeEntityId": null, "avatarColor": null, "mustChangePassword": false
  }
}
```

- Tanpa sesi sah: 401 `{ "user": null }` → dipetakan `ApiError.TidakTerautentikasi`.

### POST /api/auth/logout

- 200 `{ "ok": true }` + `Set-Cookie` kosong (hapus sesi) + `Cache-Control: no-store`.
- 503 `{error:"Cookie telah dihapus, tetapi sesi server belum berhasil dicabut. Hubungi admin untuk menyetel ulang kata sandi."}` — sisi klien tetap panggil `authStore.hapus()`.

### POST /api/profile/password — `GantiSandiRequest { currentPassword, newPassword }`

- 200 `{ "ok": true }` + `Set-Cookie` baru (sesi diganti saat sandi berganti) → CookieJar otomatis menyimpannya.
- 422 `{error}` kebijakan sandi / sandi lama salah; 429 `{error, retryAfter}`; 401 `{error:"Tidak terautentikasi"}`; 403 `{error:"Ganti kata sandi dulu", code:"MUST_CHANGE_PASSWORD"}`; 503 `{error:"Kata sandi belum berhasil diubah. Coba lagi."}`.

### GET /api/ringkasan

`JsonObject` mentah; bentuk detail didokumentasikan ulang saat Fase 1.

## Pemetaan kode HTTP → ApiError

| Kode | ApiError | Catatan |
| --- | --- | --- |
| 401 | `TidakTerautentikasi` | arahkan ke layar masuk |
| 403 + `code:"MUST_CHANGE_PASSWORD"` | `WajibGantiSandi` | arahkan ke layar ganti sandi |
| 403 lainnya | `Konflik` | |
| 400, 422 | `Validasi(pesan, errors)` | `errors` opsional dari badan |
| 429 | `TerlaluBanyakPesan(retryDetik)` | `retryAfter` badan, cadangan header `Retry-After` |
| 500–599 | `Server` | |
| lainnya | `Lainnya` | |
| `IOException` | `Jaringan` | pesan mengikuti `offlineDeteksi` |

## Keputusan implementasi

- `CookieJar.loadForRequest` mengembalikan kosong; header `Cookie` dipasang interceptor dari `authStore.header()` supaya prefiks `__Host-` (produksi) tidak perlu diurai ulang menjadi objek `okhttp3.Cookie` (parsing ulang tanpa atribut Secure/Path berisiko ditolak).
- `Set-Cookie` dengan nilai kosong diperlakukan sebagai penghapusan cookie (perilaku `clearSessionCookie` saat logout), bukan disimpan sebagai nilai kosong.
- Log level BASIC dipilih agar nilai cookie tidak pernah tercetak.
- Dependensi yang dibutuhkan modul (untuk gradle Fase berikutnya): `okhttp`, `okhttp-logging-interceptor`, `retrofit`, `com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter`, `kotlinx-serialization-json`, `androidx.security:security-crypto` (1.1.0-alpha06+ untuk `MasterKey`).
