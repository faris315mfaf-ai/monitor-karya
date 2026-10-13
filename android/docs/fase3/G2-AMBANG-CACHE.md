# G2 — Ambang skor kepatuhan tunggal dan potret luring layar pemantau

Agen G2, gelombang akhir, 13 Oktober 2026 (15.40–16.10 WIB).
Masukan:
- [KEPUTUSAN-AMBANG-KEPATUHAN.md](KEPUTUSAN-AMBANG-KEPATUHAN.md) (B15)
- [E2E-R2-3-PEMANTAU-TI.md](E2E-R2-3-PEMANTAU-TI.md): B6 sebagian, N1, N3
- [E2E-R2-PERBAIKAN.md](E2E-R2-PERBAIKAN.md)
- [A1-LURING.md](A1-LURING.md) (CacheLayar)

## Ringkasan

| Butir | Hasil | Bukti |
|---|---|---|
| B15: ambang warna skor kepatuhan | **BERES** (JVM + emulator) | `PitaKepatuhanTest` (7 tes), `PemetaanTest.ambang_skor_tunggal`, `LogikaTest.ambangKepatuhan`. Peta, sub-holding, 10 PT terendah, pohon Entitas, dan legenda memakai satu ambang |
| B6: mulai dingin luring tanpa data | **BERES** (emulator) | Ringkasan grup, Ringkasan Direktur, Entitas, Eskalasi, dan Proyek menampilkan potret Room dengan penanda "Luring · data tersimpan HH.MM" |
| R2-3 N1: muat ulang saat daring kembali | **TERBUKTI** (emulator) dan **diperluas** | Tab yang tampil memakai mekanisme MKShell. Tab tersembunyi yang berisi potret atau galat kini memuat ulang sendiri |
| R2-3 N3: warna donat | **TERBUKTI** (emulator) | "Selesai" biru, "Sesuai jadwal" hijau (`08-donat-proyek.png`) |

## 1. Ambang skor kepatuhan (B15)

### Sumber tunggal
Berkas baru `core/domain/.../status/PitaKepatuhan.kt` adalah port dari `src/lib/compliance-band.ts`. Isinya:
- `KEPATUHAN_BAIK_MIN = 90` dan `KEPATUHAN_PERHATIAN_MIN = 75`.
- `enum PitaKepatuhan(status: MkStatusDomain, label, rentang)` dengan tiga nilai:
  - `BAIK` (on, "Baik", "≥ 90")
  - `PERHATIAN` (risk, "Perlu perhatian", "75–89")
  - `KRITIS` (late, "Kritis", "< 75")
- `LEGENDA`, `pitaKepatuhan(skor)`, dan `pitaKepatuhanAtauNull(skor?)`.

Pembanding memakai skor mentah, tanpa pembulatan.

### Pemakai

| Berkas | Perubahan |
|---|---|
| `feature/ringkasangrup/.../logika/Pemetaan.kt` | `statusSkorPeta`, `statusSkorTarget`, `labelSkorTarget`, dan `TARGET_KEPATUHAN` dihapus. Penggantinya `pitaKepatuhan(skor?) → Lencana` (`null` → netral "Belum ada skor"), `PitaKepatuhan.statusRingkas()`, dan `kalimatKritis(n, m)` |
| `.../grafik/Grafik.kt` | Warna sel `PetaPanas` dan contentDescription memakai kata pita. `LegendaPetaPanas` menampilkan "Baik ≥ 90 · Perlu perhatian 75–89 · Kritis < 75" |
| `.../RingkasanGrupTab.kt` | `BatangSkor` (sub-holding dan 10 PT terendah) diwarnai pita dengan garis target 90. Meta sub-holding "n PT · <pita>". Meta PT "<pita> · wilayah". Kalimat ringkasan: "{n} dari {m} entitas berstatus kritis (skor di bawah 75)." |
| `feature/entitas/.../ui/Format.kt` | `statusKepatuhan` dan `kataKepatuhan` mendelegasikan ke pita: Baik on, Perlu perhatian risk, Kritis late. "Patuh" dan "Terlambat" dihapus. Ubin rata-rata, lencana pohon, sheet, dan hero "n dari m PT perlu perhatian" (risk/late, sama dengan web) ikut berubah |
| `app/ui/kepatuhan`, `app/ui/admin` | **Tidak diubah.** Tidak ada skor kepatuhan 0–100 di sana: Kepatuhan memakai status lapor per divisi, dan PetaPanasKartu admin memakai persen lapor harian. Ringkasan Direktur juga tidak menampilkan skor kepatuhan |

### Verifikasi emulator
Super Admin, data DB uji:
- **Peta** (`05-peta-legenda.png`):
  - 91,9 / 94,1 / 96,1 / 95,3 → hijau "Baik"
  - 75,5 / 88,7 / 80 / 89,4 → oranye "Perlu perhatian"
  - 73 / 70,5 → merah "Kritis"
- **10 PT terendah** (`02`, `03`):
  - Energi Migas 71 dan Petro 73 → merah "Kritis"
  - Turbin 80 dan Baterai 89 → oranye
  - Karet 92 dan seterusnya → hijau "Baik"
  - Kalimat: "2 dari 10 entitas berstatus kritis (skor di bawah 75)."
- **Sub-holding** (`06`): 87 dan 85 → oranye "Perlu perhatian", garis target 90.
- **Entitas** (`11-entitas-pohon.png`): lencana "Baik 93,0%" dan "Perlu perhatian 75,5%". Hero menulis "6 dari 11 PT perlu perhatian kepatuhan" (4 perhatian + 2 kritis).

Catatan kecil: batang 10 PT terendah menulis angka bulat. Skor 89,4 tampil "89%" oranye, sesuai aturan skor mentah. Skor 89,6 akan tampil "90%" tetapi tetap oranye. Ini akibat keputusan, bukan bug.

## 2. Potret luring layar pemantau (B6)

### Pola
Polanya sama dengan meja PIC (`MejaKerjaViewModel.baca`) dan memakai API `CacheLayar` yang sudah ada. Skema Room tidak diubah, dan `core/data` tidak disentuh.

1. **Daring dulu.** Setiap 2xx berbadan disimpan apa adanya lewat `cache.simpan(kunci, serializer, data)`. CacheLayar sendiri yang menambahkan awalan uid sesi.
2. **Hanya untuk server tak terjangkau.** Bila panggilan gagal dengan `IOException` / `ApiError.Jaringan`, layar membaca `cache.ambil(kunci)` dan menyimpan `disimpanPada`.
3. **Jawaban server tetap final.** 4xx/5xx tidak memakai potret. 403 tetap Ditolak.
4. **Kunci per hari.** Kunci memuat tanggal WIB, jadi mulai luring esok hari tidak menampilkan potret kemarin sebagai hari ini. Daftar kunci:
   - `pemantau:ringkasan:<tgl>` (dipakai bersama Grup dan Direktur)
   - `pemantau:grafik:<tgl>`
   - `pemantau:peta:<tgl>`
   - `pemantau:insiden:<tgl>`
   - `pemantau:entitas-pohon:<tgl>`
   - `pemantau:eskalasi:<tgl>:<status>:<kebutuhan>:<lewatSla>`
   - `pemantau:proyek:<tgl>:<siklus>:<fase>:<cari>` (halaman 1 saja)
5. **Penanda.** Isi dari potret selalu ditandai komponen baru `designsystem/components/MkPenandaTersimpan`, yang menulis "Luring · data tersimpan HH.MM" (hari lain: "12 Okt 14.05", WIB).
6. **Tanpa Room di tes JVM.** Parameter `cache: CacheLayar? = null` dan `konektivitas: ConnectivityObserver? = null` berada di akhir konstruktor VM, sehingga tes JVM lama (`VM(api)`) tetap jalan tanpa Room. Hilt menyuntikkan keduanya di aplikasi.

### Berkas
- **ringkasangrup**
  - `data/PotretPemantau.kt`: `KunciPotret` dan `ambilDaringDulu` (murni, diuji `PotretPemantauTest`, 6 tes).
  - `RingkasanGrupViewModel`: empat sumber, `tersimpan: Map` → `tersimpanPada` = potret tertua.
  - `RingkasanDirekturViewModel`: `tersimpanPada`.
  - Kedua Tab menampilkan penanda.
- **entitas**: `EntitasViewModel` (`PohonUi.Siap.tersimpanPada`) dan `EntitasLayar`.
- **eskalasi**: `EskalasiViewModel` (`EskalasiUiState.Siap.tersimpanPada`) dan `EskalasiTab`.
- **proyek**: `ProyekViewModel` (`DaftarUi.tersimpanPada`, `kunciPotretDaftar`), `ProyekUiState`, dan `ProyekLayar`.
- **designsystem**: `MkPenandaTersimpan` dan `teksDataTersimpan`, diuji `PenandaTersimpanTest`.

### N1 untuk tab tersembunyi
`MKShell.IsiTab` hanya menyusun ulang tab yang **sedang tampil**. Saat diuji, tab Entitas yang dibuka setelah daring kembali masih menampilkan "data tersimpan 15.59".

Perbaikannya ada di tiap VM fitur (`amatiDaring()`):
- VM mengamati `ConnectivityObserver.daring` dengan `distinctUntilChanged().drop(1).filter { it }`.
- Saat transisi luring → daring, VM memuat ulang sendiri bila isinya berasal dari potret atau galat.
- Tidak ada perulangan bila jaringan ada tetapi server mati, karena muat ulang hanya dipicu oleh transisi.

### Verifikasi emulator
Luring sungguhan memakai airplane mode ditambah `adb reverse --remove tcp:3100`.

| Langkah | Hasil |
|---|---|
| Super Admin, mulai dingin luring | Ringkasan tampil lengkap dengan KPI, kartu PT, dan grafik (tanpa "belum termuat"), ditandai "data tersimpan 15.57" (`o01`, `o02`). Proyek 16.00 (`o03`), Entitas 15.59 (`o04`), Eskalasi 16.00 (`o05`) |
| Daring kembali di tab Eskalasi | Eskalasi dimuat ulang dan penanda hilang. Setelah perbaikan tab tersembunyi, Ringkasan, Proyek, dan Entitas juga segar tanpa penanda (`n1b-*`) |
| Direktur (direktur.sh-energi), mulai dingin luring | Ringkasan Direktur tampil dengan "data tersimpan 16.06" (`o06`). Setelah daring, data dimuat ulang dan penanda hilang |
| Logcat | 0 `FATAL EXCEPTION` |

Bukti tersimpan di `/private/tmp/claude-501/g2-ambang/`.

## Tes dan build
Build lewat `gradle-kunci.sh testDebugUnitTest :app:assembleDebug --continue`. Hijau di modul G2:

| Modul | Tes lulus |
|---|---|
| core/domain | 27 |
| designsystem | 13 |
| ringkasangrup | 55 |
| entitas | 42 |
| eskalasi | 24 |
| proyek | 56 |
| app | 162 |

APK dirakit dan dipasang di emulator-5558.

Di luar kepemilikan G2:
- **`core:data` MigrasiMkTest** gagal (2 tes, migrasi 6→7). Ini milik G1, **butuh parent**.
- **`ProyekViewModelTest.detailMengambilEskalasiTerkait…`** gagal sekali, lalu lulus dua kali saat diulang. Penyebabnya race yang sudah ada sebelumnya: predikat `tunggu` (baris 297) tidak menunggu `laporan`, padahal baris 302 meng-cast `laporan` ke `Siap`. Perbaikan: tambahkan `it.laporan is Bagian.Siap` ke predikat.
- **ktlint** tidak termasuk gerbang dan sudah menghasilkan ribuan temuan di berkas lama. Berkas baru G2 mengikuti gaya berkas sekitarnya.

## Butuh parent (app/navigation, di luar kepemilikan)
- Di layar pemantau ber-potret, banner shell ("Luring · data di layar ini dari pemuatan terakhir…") tampil di atas penanda "Luring · data tersimpan HH.MM", jadi ada dua baris luring. Pilihan:
  - shell menyembunyikan banner untuk layar yang sudah punya penanda; atau
  - teks shell dipendekkan menjadi "Luring".
- Divisi dan Persetujuan (app/ui, feature/persetujuan) belum memakai potret. Polanya sama: `ambilDaringDulu` + `MkPenandaTersimpan`.

## Lingkungan dikembalikan
- `emulator-5558`: airplane `0`, `adb reverse tcp:3100` terpasang, ukuran 1080x2400, density 420, mode gelap `no`.
- Sesi akhir: Direktur entitas (sebelumnya Super Admin). Untuk itu satu kali masuk dengan sandi dari `.env.e2e.lokal`.
- Tidak ada perubahan data di DB uji, karena hanya GET.
