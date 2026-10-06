# Layar PIC proyek: spesifikasi lawan kode

[← Indeks](README.md) · Spesifikasi: [`05-pic-proyek.md`](../design/peran/05-pic-proyek.md) · Fitur terkait: [`output-review.md`](output-review.md), [`laporan-harian.md`](laporan-harian.md), [`meja-kerja.md`](meja-kerja.md)

Status per 6 Oktober 2026 (fase F2, wilayah `[F2-PIC]`). Setiap butir spesifikasi diberi satu status:

- **ada**: sudah ada sebelum F2 dan sesuai spesifikasi.
- **dibangun**: dibuat atau dilengkapi di F2.
- **beda**: sengaja berbeda dari spesifikasi. Alasannya ditulis di butir itu.
- **tidak mungkin**: belum bisa dikerjakan di wilayah ini. Alasan dan pemiliknya ditulis di butir itu.

Belum ada yang dicoba dengan basis data sungguhan. Yang sudah diperiksa: `tsc`, `eslint`, uji `vitest` untuk rumus di `src/lib/pic-progress.ts` dan untuk route `/api/project-progress` (Prisma tiruan), dan tampilan di `/pratinjau?peran=PIC_PROYEK` dengan data contoh (`src/components/preview/mock-pic.ts`).

## Tata letak

Layar "Hari ini" PIC adalah tab **Ringkasan**: `PicDashboard` di `src/components/views/role-dashboards.tsx`.

- **Desktop (≥ 1024 px):** semua bagian tampil berurutan:
  1. hero dan 4 KPI;
  2. Laporan harian (2/3) dan Tahapan proyek (1/3);
  3. Output saya (2/3) dan Catatan kepala divisi (1/3);
  4. Progres dibanding rencana (2/3) dan Tenggat terdekat (1/3);
  5. Riwayat laporan.
- **Tablet dan ponsel (< 1024 px):** `SegmentedControl` dengan empat tab: **Hari ini · Output · Laporan · Catatan** (`useIsCompact` di `src/components/pic/dashboard-parts.tsx`). Isi tiap tab:
  - **Hari ini:** hero dan formulir laporan.
  - **Output:** 4 KPI dan daftar output.
  - **Laporan:** progres dibanding rencana, tahapan dan riwayat laporan berdampingan (bertumpuk di ponsel), lalu tenggat terdekat.
  - **Catatan:** percakapan dengan kepala divisi.

## Desktop

| # | Butir spesifikasi | Status | Catatan dan berkas |
| --- | --- | --- | --- |
| 1 | Sidebar dengan 6 item: Hari ini · Laporan harian · Output saya · Tahapan proyek · Catatan kepala divisi · Riwayat laporan | **beda** | Daftar tab ditentukan `ROLE_TABS` di `src/lib/rbac.ts`, berkas bersama di luar wilayah F2-PIC: Ringkasan · Meja kerja · Laporan harian · Proyek. Output, tahapan, catatan, dan riwayat tampil sebagai kartu di Ringkasan (desktop) atau sebagai tab dalam layar (tablet/ponsel). |
| 1a | Lencana "Laporan harian 1" (aksen), hilang setelah terkirim | ada | `/api/nav-badges`, `refreshNavBadges()` |
| 1b | Lencana "Catatan kepala divisi 1" (aksen) | **dibangun** | `/api/nav-badges` kini mengembalikan `badges.dashboard`, yaitu jumlah catatan pihak lain yang belum dibaca di proyek aktif PIC. Lencana menempel di tab Ringkasan karena di sanalah kartu catatan berada. Badge dihitung ulang setelah catatan ditandai dibaca. Bila tabel catatan belum ada, angka ini dilewati tanpa menggagalkan lencana lain. |
| 1c | Lencana "Output saya 7" | **beda** | Output tidak punya tab sendiri. Jumlahnya tampil di chip saringan kartu Output saya. |
| 2 | Header: tanggal · proyek, sapaan, lencana "Laporan hari ini · Belum dikirim" → "Terkirim 17.06" | **dibangun** | Jam kirim diambil dari `today.submittedAt` di `/api/project-progress`. Data itu dimuat ulang setiap kali formulir menyimpan, jadi lencana berubah tanpa memuat ulang halaman. Laporan yang sudah diteruskan berlabel "Diteruskan". Sebelum 17.00 lencana Belum dikirim berwarna `risk`, setelah 17.00 `late`; spesifikasi menulis `late` saja. |
| 3 | Hero: StatusBadge, "… 64% selesai.", kalimat kendala, kalimat usulan geser tenggat, "Isi laporan harian", "Lihat tahapan", ProgressRing 176 | **dibangun** | Kalimat usulan tenggat ("Usulan geser tenggat ke … sedang ditinjau Direktur.") dan tautan "Lihat tahapan" kini ada. "Isi laporan harian" menggulir ke formulir di halaman yang sama dan berganti menjadi "Lihat laporan harian" setelah terkirim. |
| 3a | KPI: Output selesai (gradien) · Menunggu review (oleh …) · Perlu revisi (judul) · Menuju rilis | **dibangun** | Label "Output selesai x dari y". Keterangan Menunggu review berbunyi "oleh <peninjau terakhir>". KPI keempat berlabel "Menuju tenggat" (tanggal · usul tanggal), bukan "Menuju rilis", karena tidak semua proyek berakhir dengan tahap rilis. Proyek tanpa output memakai KPI cadangan: Progres proyek · Tepat waktu 7 hari · Menuju tenggat · Bukti hari ini. |
| 4 | Kartu Laporan harian di layar Hari ini, berisi formulir lengkap | **dibangun** | Komponen `DailyReportCard` (ekspor baru di `views/daily-input-view.tsx`) memakai `ReportForm` yang sama dengan tab Laporan harian, jadi aturan kunci, pembekuan, dan buka kunci tetap satu. Laporan tanggal lampau yang sedang dibuka tampil sebagai kotak info dengan tombol ke tab Laporan harian. |
| 4a | Subjudul "Tenggat 17.00 · isi lalu kirim" → "Terkirim ke Admin PT pukul …" | ada / dibangun | Ditambah "Diteruskan ke holding pukul …". |
| 4b | FlowDiagram: Isi laporan → Terkirim ke Admin PT → Diteruskan ke holding → Laporan mingguan | ada | `reportFlow` (F1-A) |
| 4c | Kotak centang "Yang dikerjakan hari ini", n dari m selesai, teks dicoret | ada | `TaskSection` (`role="checkbox"`) |
| 4d | Kendala dan Rencana besok selalu tampil; Kendala wajib bila Terkendala/Menunggu keputusan; Rencana besok wajib bila Terkendala | ada | F1-A |
| 4e | Kirim laporan / Kirim ulang laporan / Simpan draf / Lampirkan foto | ada | F1-A |
| 4f | Dikirim langsung ke Admin PT; kepala divisi hanya melihat | ada | Keputusan produk F1 |
| 4g | Beku setelah diteruskan, Ajukan buka kunci, status buka kunci | ada | F1-A (`LockNotice`, `UnlockRequestSheet`) |
| 5 | Tahapan proyek: "n dari m tahap selesai", FlowDiagram vertikal, tertahan dengan alasan, usul tenggat | ada | `pic/stages.tsx` |
| 6 | Output saya: chip saringan, 7 terdekat, "Unggah bukti" → Menunggu review | ada | `pic/outputs.tsx`. Tombol tambah berbunyi "Tambah output" (kata kerja + objek), bukan "Output baru". |
| 6a | Seret berkas ke baris output | **dibangun** | Baris berstatus Dikerjakan atau Perlu revisi menerima berkas yang diseret. Hasilnya sama dengan "Unggah bukti": berkas diunggah, output dikirim untuk review, dan toast "Urungkan" muncul. |
| 7 | Catatan kepala divisi: gelembung kiri/kanan, waktu, kolom "Balas Andi…", tombol kirim | ada | `pic/notes.tsx` |
| 8 | Progres dibanding rencana: AreaChart aktual vs rencana per minggu (M36–M41); pilih minggu → "M41: 64% dari rencana 75%" | **dibangun** | `ProgressPlanCard` + `/api/project-progress`. Rumus dijelaskan di bawah. |
| 8a | Tenggat terdekat: kotak tanggal, judul, catatan, lencana | **dibangun** | `DeadlinesCard`. Sumbernya tahapan, output, dan tenggat proyek. |

## Sheet output

| Butir | Status | Catatan |
| --- | --- | --- |
| Lencana status, deskripsi, catatan revisi (`waspada-soft`, "— peninjau") | ada | |
| Daftar bukti dengan ikon unduh | ada | |
| Area unggah putus-putus "Seret berkas ke sini atau tekan Unggah bukti" | ada / **dibangun** | Dulu hanya tampil saat output belum punya bukti. Kini seluruh bagian Bukti menerima berkas, dan di bawah daftar bukti ada petunjuk ringkas "Seret berkas ke sini untuk menambah bukti". |
| "Tanya kepala divisi" | **dibangun** | Dulu tombol ini menutup Sheet lalu mengisi kolom balas kartu Catatan. Cara itu gagal bila kartu Catatan tidak sedang tampil, misalnya di tab Output pada tablet atau ponsel. Kini tombol membuka kolom pertanyaan di dalam Sheet dengan teks awal `Tentang output "…": `. "Kirim pertanyaan" menulis ke `/api/project-notes`, lalu kartu Catatan yang sedang tampil memuat ulang (event `mk:pic-notes-changed`). |
| "Unggah bukti & kirim" / "Menunggu review" nonaktif | ada | Kirim wajib minimal 1 bukti, dengan "Urungkan". |

## Tablet dan ponsel

| Butir | Status | Catatan |
| --- | --- | --- |
| Tab Hari ini · Output · Laporan · Catatan | **dibangun** | Dibuat sebagai `SegmentedControl` di dalam layar, karena tab bar mengikuti `ROLE_TABS` (lihat Desktop #1). |
| Tablet Hari ini: hero + formulir lengkap (alur horizontal) | **dibangun** | |
| Tablet Output: 4 KPI + chip + daftar dengan "Unggah" | **dibangun** | KPI di kisi `.mk-pic-kpis`. |
| Tablet Laporan: progres vs rencana, tahapan dan riwayat berdampingan | **dibangun** | |
| Tablet Catatan: percakapan + kolom balas | ada | |
| Ponsel Hari ini: kartu ring 96 | **dibangun** | Ring hero 96 px di ponsel. |
| Ponsel kartu laporan: centang, Kendala, Rencana besok, "Kirim laporan" lebar penuh `lg`, "Lampirkan foto" | ada | |
| Ponsel: alur vertikal baru tampil setelah terkirim | **dibangun** | `ReportForm`: di ponsel `FlowDiagram` disembunyikan sampai laporan terkirim. Desktop dan tablet tetap menampilkannya. |
| Ponsel setelah diteruskan: kotak kunci + "Ajukan buka kunci" | ada | F1-A |
| Ponsel Output: chip digulir, baris (judul, lencana + waktu, chevron) → layar detail | ada | `pic.css` + `Sheet` (layar didorong di ponsel) |
| Ponsel Laporan: riwayat laporan 6 hari (lencana) | **dibangun** | `ReportHistoryCard` memuat 6 hari kerja terakhir, termasuk hari yang tidak dikirim ("Tidak dikirim"). Riwayat lama hanya menampilkan laporan yang ada. |
| Ponsel Catatan: kolom balas menempel di atas tab bar | ada | `pic.css` (`position: sticky`) |
| Ponsel detail output: "‹ Output", tombol menempel "Unggah bukti & kirim" | ada | `Sheet backLabel="Output"` |

## Aturan khusus

| Butir | Status | Catatan |
| --- | --- | --- |
| Tenggat lewat ditulis tanpa menyalahkan: "Tenggat 17.00 · lewat 4 menit" | **dibangun** | `deadlineText` di hero menulis menit atau jam yang sudah lewat. Lebih dari sehari: "Tenggat 17.00 sudah lewat". |
| Placeholder Kendala mengarah ke fakta | ada | |
| Kiriman langsung terlihat di Admin PT (Penerimaan) dan kepala divisi (lihat saja) | ada | F1 |
| 409 "Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya."; tidak bisa dihapus | ada | F1-A |
| Laporan lampau yang dibuka: kotak "Laporan … dibuka sampai …" + "Ubah laporan 5 Okt" | ada / **dibangun** | Tab Laporan harian: ada (F1-A). Kartu di Hari ini menampilkan kotak yang sama dengan tombol ke tab Laporan harian. |

## Rumus progres dibanding rencana

`src/lib/pic-progress.ts` (fungsi murni, diuji di `tests/lib/pic-progress.test.ts`), dipakai `GET /api/project-progress?projectId=`.

- **Rencana** pada suatu saat:
  - Dihitung dari **tahapan bertanggal**. Setiap tahap bernilai sama (1/n proyek). Di dalam satu tahap, rencana naik linear dari tanggal mulai sampai akhir hari tanggal selesai.
  - Tanggal yang kosong diisi dari tetangganya:
    - tanpa tanggal mulai: akhir tahap sebelumnya, atau tanggal mulai proyek;
    - tanpa tanggal selesai: mulai tahap berikutnya, atau tenggat proyek.
  - Tahap yang tetap tanpa rentang diabaikan.
  - Tanpa tahapan yang bisa dipakai, rencana linear dari mulai proyek ke tenggat. Tanpa keduanya, tidak ada rencana: grafik hanya menampilkan aktual.
- **Aktual** per minggu: progres laporan harian **terkirim** terakhir sampai akhir minggu itu. Untuk minggu berjalan, sampai saat ini. Draf tidak dihitung.
- Grafik memuat 6 minggu ISO terakhir (label `M41`). Minggu sebelum proyek mulai tidak ikut.
- Kalimat di bawah grafik hanya membandingkan angka: "M41: 64% dari rencana 75% · kurang 11 poin". Kalimat ini tidak memberi status proyek baru, karena status proyek tetap dihitung di satu tempat (`src/lib/project-status.ts`).

**Tenggat terdekat** (paling banyak 5, yang lewat paling lama di atas):

- Tahap yang belum mulai memakai tanggal mulainya; tahap lain yang belum selesai memakai tanggal selesainya. Tahap tertahan berlencana "n hari · tertahan".
- Target output yang belum diterima.
- Tenggat proyek, dengan catatan "Usul geser ke … · sedang ditinjau" bila ada. Tenggat proyek selalu tampil.

Lencana: lewat = `late` "Lewat n hari"; ≤ 3 hari, hari ini, atau tertahan = `risk`; selebihnya `neutral` "n hari lagi".

**Riwayat laporan**: 6 hari kerja terakhir (Senin–Jumat). Arti tiap keadaan:

- `FORWARDED`: Diteruskan ke holding.
- `SENT`: Terkirim jam … (tepat waktu).
- `LATE`: Terlambat masuk.
- `MISSING`: Tidak dikirim (tenggat lewat).
- `PENDING`: Belum dikirim (hari ini sebelum 17.00).
- `DRAFT`: Draf belum dikirim (hari ini sebelum 17.00).

## API baru dan yang berubah

| Route | Perubahan |
| --- | --- |
| `GET /api/project-progress?projectId=` | **Baru.** Hanya baca. Mengembalikan `{ today, plan: { source, weeks[] }, deadlines[], history[] }`. Akses `guardProjectAccess(READ_RELATIONS)`, sama dengan tahapan dan output (anti-IDOR). `projectId` dipotong 64 karakter. Galat 500 memakai `serverError` (pesan umum). Tabel tahapan, output, dan usulan dibaca terpisah: bila migrasi 0013/0014 belum diterapkan, bagian itu kosong dan sisanya tetap jalan. |
| `GET /api/nav-badges` | Untuk PIC ditambah `badges.dashboard` = catatan belum dibaca. Rumusnya sama dengan `unreadFor` di `/api/project-notes`. |

Tidak ada migrasi baru. Folder `prisma/migrations/0020_pic_more/` tidak dibuat karena semua data sudah ada di tabel F0/F1.

## Berkas

- Baru:
  - `src/lib/pic-progress.ts`
  - `src/app/api/project-progress/route.ts`
  - `src/components/pic/dashboard-parts.tsx`
  - `tests/lib/pic-progress.test.ts`
  - `tests/api/project-progress.test.ts`
- Diubah:
  - `PicDashboard` dan impor di `src/components/views/role-dashboards.tsx`
  - `src/components/views/daily-input-view.tsx`: ekspor `DailyReportCard`, alur di ponsel
  - `src/components/pic/api.ts`, `outputs.tsx`, `notes.tsx`
  - `src/app/api/nav-badges/route.ts`
  - `src/app/css/pic.css`
  - `src/components/preview/mock-pic.ts`: tiruan `/api/daily-input`, bukti laporan harian, `/api/project-progress`, badge catatan

## Belum selesai

- ~~**Bukti laporan yang sedang dibuka.**~~ Selesai di integrasi akhir: `src/lib/evidence-access.ts` memanggil `activeUnlockFor` untuk laporan harian dan task HARIAN, jadi bukti laporan lampau yang dibuka bisa ditambah atau dihapus.
- **Tab navigasi.** Tab sesuai spesifikasi (Output saya, Tahapan, Catatan, Riwayat sebagai item navigasi) perlu mengubah `ROLE_TABS` dan `NavTabId` di `src/lib/rbac.ts` serta kerangka shell. Keduanya berkas bersama.
- **Pengujian.** `/api/project-progress` belum dicoba dengan basis data sungguhan. Yang sudah diuji: rumusnya (`tests/lib/pic-progress.test.ts`) dan route-nya dengan Prisma tiruan (`tests/api/project-progress.test.ts`: anti-IDOR, bentuk jawaban, tabel P2 yang belum ada, pesan 500 umum).
