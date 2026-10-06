# Sisa pekerjaan — cabang `desain-baru`

Pertama dipetakan 6 Oktober 2026 dari kode, `docs/design/`, dan status git. Diperbarui 6 Oktober 2026 malam setelah putaran kerja paralel P1–P3, perburuan bug, dan penguatan keamanan. Urutan = urutan pengerjaan yang disarankan.

Setiap butir punya kriteria selesai. Butir dianggap selesai bila kriterianya terpenuhi, bukan saat kodenya ditulis.

Tanda:

| Tanda | Arti |
| --- | --- |
| `[x]` | Selesai |
| `[ ] **Sebagian**` | Dikerjakan tetapi belum memenuhi seluruh kriteria |
| `[ ]` | Belum |

Dokumentasi fitur, alur, dan endpoint ada di [`docs/fitur/`](fitur/README.md).

## Keadaan sekarang

| Pemeriksaan | Hasil |
| --- | --- |
| `npx tsc --noEmit` | 0 galat di seluruh proyek |
| `npx eslint src` | bersih |
| `npx prisma generate` | lolos |
| `npx vitest run` | 8 berkas, 114 tes lolos. Semua memakai mock; tidak ada yang menyentuh Supabase. |
| `next build` | lolos (Next 16.3.4 Turbopack, 49 halaman). Dijalankan dengan `DATABASE_URL` tiruan yang tidak bisa dijangkau. |

Cakupan kode yang sudah ada:

- **Desain baru.** Semua layar memakai desain baru (P1 selesai): Ringkasan semua peran, Meja kerja, Laporan harian, Capaian mingguan, Penerimaan, Proyek, Divisi, Eskalasi, Entitas, Log aktivitas, Sistem, Perusahaan & akun, Pengaturan, login, splash, dan kerangka.
- **Fitur P2** sudah dibangun di kode dan dicoba di `/pratinjau`: output & review, catatan, tahapan, usulan tenggat, kehadiran, beban kerja, permintaan akses, pengingat otomatis, buka kunci, layar Direktur/Manajemen.
- **Migrasi 0013–0017** sudah ditulis tetapi **belum diterapkan**. Tidak ada satu pun fitur P2 yang sudah dicoba dengan basis data sungguhan.

---

## P0 — Wajib sebelum merge ke `main`

### 0. Terapkan migrasi 0013–0017 (oleh manusia)

Prisma Client yang sudah dibuat ulang mengharapkan `User.divisionId` dan `Project.divisionId`. Selama 0015 belum diterapkan, kueri yang memilih semua kolom `User` atau `Project` gagal. Langkah lengkap ada di [`docs/fitur/README.md`](fitur/README.md#migrasi-manual-00130017).

- [ ] Cadangkan basis data, lalu jalankan `npx prisma migrate status`.
- [ ] Terapkan 0013 → 0017 berurutan.
- [ ] Isi `User.divisionId` dan `Project.divisionId` untuk data lama lewat "Atur anggota". Sampai diisi, proyek tanpa divisi mengikuti divisi PIC-nya.

Kriteria selesai: `migrate status` bersih dan semua tab terbuka tanpa 500 untuk tiap peran seed.

### 1. Uji Meja kerja dengan basis data sungguhan

Meja kerja baru diuji di `/pratinjau` dengan data contoh, dan route-nya diuji dengan mock (`tests/api/work-desk.test.ts`).

- [ ] Masuk sebagai Admin PT, PIC proyek, dan Kepala divisi (akun seed), lalu buka tab Meja kerja.
- [ ] `PUT /api/tasks` dari centang agenda: status, subtugas, jam mulai/selesai, dan `picUserId` tidak berubah selain yang dicentang; laporan harian ter-rollup.
  - Bug lama sudah diperbaiki di kode: formulir tugas yang tidak mengirim `picUserId` dulu mengosongkannya. Kini nilai lama dipertahankan.
- [ ] `POST /api/work-desk` `remind-pic` dan `remind-all-pics`: notifikasi muncul di akun PIC, pengingat kedua di hari yang sama ditolak 409, tercatat di log aktivitas (`REMIND_PIC`).
  - Logika ini sudah dites dengan mock. Teks "17.00 WIB WIB" sudah diperbaiki.
- [ ] Serahkan capaian mingguan dengan item tanpa bukti: daftar masalah dari server tampil di kartu daftar periksa.
  - Validasi server sudah dites dengan mock (`tests/api/weekly-input.test.ts`).
- [ ] Setelah 17.00 WIB: tombol ingatkan dan centang terkunci, cincin menulis "Terkunci · lewat n menit".
- [ ] Akun tanpa proyek / tanpa divisi / tanpa PT melihat keadaan kosong yang benar.

Kriteria selesai: semua butir di atas dicoba di server lokal dengan basis data, tanpa galat konsol atau 500.

### 2. Lintasan data antarperan

`docs/design/peran/00-alur-antarperan.md` mewajibkan tindakan satu peran langsung terlihat di peran lain.

- [ ] PIC mengirim laporan → baris di Meja kerja Admin PT berubah ke "Masuk" setelah muat ulang; angka hero, KPI, dan Ringkasan Admin sama.
- [ ] Admin meneruskan di Penerimaan → PIC melihat "Diteruskan ke holding".
- [ ] Kepala divisi menyerahkan → status mingguan di Meja kerja Admin berubah.
- [x] Angka "laporan masuk" di Ringkasan dan Meja kerja Admin dihitung dari sumber yang sama.
  - Sumbernya `countDailyIntake` di `src/lib/daily-intake.ts`: proyek AKTIF dengan laporan hari ini terkirim. Fungsi ini dipakai `/api/my-dashboard` dan `/api/work-desk` (`intake`).
  - Dulu Ringkasan ikut menghitung laporan proyek yang sudah ditutup hari itu.
  - Tes: `tests/lib/daily-intake.test.ts`. Belum dicoba dengan basis data.
- [ ] Kepala divisi menerima output → hero dan cincin Output PIC serta Ringkasan Direktur ikut berubah (fitur P2).
- [ ] Direktur menyetujui usulan tenggat → `Project.targetEndDate` dan blok tenggat PIC berubah (fitur P2).

### 3. Uji build produksi

- [x] `next build` lolos (compile, typecheck, 49 halaman), dengan `DATABASE_URL` tiruan.
- [ ] **Sebagian** — `/pratinjau` mengembalikan 404 di produksi.
  - Sudah di kode (`src/proxy.ts` + cabang `NODE_ENV` di halaman).
  - Belum dicoba dengan `next start`.
- [x] Data contoh `src/components/preview/` tidak ikut termuat di halaman produksi. String khas data contoh hanya ada di source map, tidak di chunk `.js`.
- [ ] Jalankan `next start` dan pastikan konsol bebas "Refused to execute … Content Security Policy" (CSP ditegakkan hanya di produksi). Periksa juga tema dan aksen, karena skrip boot butuh nonce.

### 4. Rapikan git dan buka PR

- [ ] Putuskan nasib perubahan `AGENTS.md` (ditambahkan ulang oleh `next dev`; panduan proyek menyarankan ikut di-commit).
- [ ] Commit bertahap per area:
  - sistem desain & token;
  - kerangka & navigasi;
  - Ringkasan per peran;
  - Perusahaan & akun;
  - Meja kerja;
  - layar P1;
  - fitur P2 + migrasi;
  - tes;
  - keamanan;
  - dokumentasi.
- [ ] Isi deskripsi PR dengan daftar periksa `docs/design/15-checklist-review.md` yang sudah dicentang.
- [ ] Beri tahu pengguna bahwa semua orang perlu masuk ulang sekali setelah rilis. Token lama tidak membawa sidik kata sandi.

---

## P1 — Wajib desain: layar yang masih bergaya lama

Semua layar di tabel di bawah sudah dipindah ke komponen `src/components/mk` dan token (6 Okt 2026).

| Urutan | Berkas | Status |
| --- | --- | --- |
| 1 | `views/daily-input-view.tsx` + `task-section.tsx` + `task-dialog.tsx` + `progress-report-panel.tsx` + `evidence-panel.tsx` | [x] (CSS `app/css/laporan.css`) |
| 2 | `division-weekly-desk.tsx` + `weekly-board.tsx` + `weekly-task-board.tsx` | [x] (CSS `app/css/weekly.css`) |
| 3 | `views/inbox-view.tsx` (Penerimaan) | [x] |
| 4 | `views/projects-view.tsx` | [x] (CSS `app/css/proyek-divisi-eskalasi.css`) |
| 5 | `views/divisions-view.tsx` | [x] |
| 6 | `views/escalations-view.tsx` | [x] |
| 7 | `views/entities-view.tsx` + `views/entity-activity-board.tsx` | [x] (CSS `app/css/admin-sistem.css`) |
| 8 | `views/audit-view.tsx` | [x] |
| 9 | `views/system-view.tsx` | [x] |
| 10 | `settings-dialog.tsx`, `account-dialog.tsx`, `account-manager.tsx` | [x] |
| 11 | `views/management-charts.tsx`, `dashboard/compliance-treemap.tsx` (+ `kpi-trend-chart.tsx`) | [x] Dipindah, tetapi belum dipakai layar mana pun. Lihat butir pembersihan. |

Untuk setiap layar:

- [x] `Card`/`Badge`/`Button`/`Progress` shadcn diganti `Card`, `StatusBadge`, `Button`, `ProgressBar` dari `@/components/mk`; ikon lucide diganti `Icon`. Ikon `lihat`, `sembunyi`, `hapus`, dan `ubah` ditambahkan ke `mk/core.tsx`.
- [x] Warna hanya dari token.
- [x] Satu kalimat jawaban di atas layar.
- [x] Detail dibuka di `Sheet`.
- [x] Penghapusan memakai `useConfirm`. Tindakan yang bisa dibalik memakai toast "Urungkan". Tindakan tanpa endpoint pembatalan sengaja tidak diberi "Urungkan".
- [x] Keadaan memuat memakai `Skeleton`/`DashboardSkeleton`.

Kriteria selesai — [x] perintah berikut hanya menemukan pemakaian yang diizinkan:

```bash
grep -rlE "glass|slate-[0-9]|rose-[0-9]|emerald-[0-9]|amber-[0-9]|from 'lucide-react'" src/components src/app
# → src/components/mk/core.tsx   (nama varian Card 'glass')
#   src/app/globals.css          (alias palet lama, diizinkan AGENTS.md)
#   src/app/mk-modules.css       (var(--glass*))
```

Pembersihan setelah P1:

- [ ] Hapus komponen `src/components/ui/*` yang tidak lagi dipakai.
  - **39 berkas:** accordion, alert, aspect-ratio, avatar, badge, breadcrumb, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input-otp, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, table, tabs, toggle-group, toggle, tooltip.
  - **Juga dihapus:** `src/hooks/use-mobile.ts`, `src/components/index.ts`, `src/components/stat-card.tsx`, `src/components/loading-states.tsx`.
  - Penghapusan oleh agen ditolak sistem izin, jadi perlu dikerjakan manusia. Setelahnya jalankan ulang `tsc` dan build.
  - **Yang masih dipakai dan harus tetap ada:** `alert-dialog` (di `useConfirm`), `input`, `label`, `sonner`, `switch` (di `SwitchRow`), `textarea`, `toast`, `toaster`, dan `src/hooks/use-toast.ts`.
- [ ] Setelah itu, cabut paket Radix dan paket lain yang tidak terpakai dari `package.json` (accordion, menubar, navigation-menu, carousel, input-otp, react-day-picker, …), serta `@mdxeditor/editor` dan `react-syntax-highlighter` bila memang tidak dipakai.
- [ ] Ganti `alert-dialog`, `input`, `textarea`, dan `switch` yang tersisa dengan versi `mk`, lalu hapus alias palet Tailwind lama di `globals.css`.
- [ ] Putuskan `views/management-charts.tsx` (`/api/management-charts`), `dashboard/compliance-treemap.tsx` (`/api/compliance-map`), dan `dashboard/kpi-trend-chart.tsx` (`/api/kpi-trends`): pasang di layar, atau hapus beserta API-nya.

---

## P2 — Fitur dari spesifikasi peran

Semua butir di bawah sudah ada di kode dan dicoba di `/pratinjau` dengan data contoh. **Belum ada yang dicoba dengan basis data**, dan semuanya bergantung pada migrasi 0013–0017 (P0 butir 0). Dokumentasi: [`docs/fitur/output-review.md`](fitur/output-review.md), [`permintaan-akses.md`](fitur/permintaan-akses.md), [`pengingat.md`](fitur/pengingat.md), [`ringkasan.md`](fitur/ringkasan.md).

### PIC proyek (`05-pic-proyek.md`)

- [x] **Output saya**: model `Output` (0013), `/api/outputs`, `src/components/pic/outputs.tsx`. Kirim untuk review wajib minimal 1 bukti, dengan "Urungkan".
- [x] **Catatan kepala divisi**: `ProjectNote` (0014), `/api/project-notes`, `pic/notes.tsx`.
- [x] **Tahapan proyek** bertanggal: `ProjectStage` (0014), `/api/project-stages`, `pic/stages.tsx`.
- [x] **Usulan geser tenggat**: `DeadlineProposal` (0014), `/api/deadline-proposals`. Pemutusnya di layar Direktur/Manajemen.
- [x] Badge nav "Laporan harian 1": `/api/nav-badges`. Badge hilang seketika setelah laporan terkirim (`refreshNavBadges()` di `daily-input-view.tsx`).

### Kepala divisi (`03-kepala-divisi.md`)

- [x] **Review output** (Terima / Minta revisi, Terima semua): `/api/outputs/review`, `src/components/kadiv/review-card.tsx`. Terima bisa diurungkan 15 menit.
- [x] **Laporan harian tim** per anggota dan **Beban kerja tim** (% per orang).
  - Data: `User.divisionId` + `Project.divisionId` (migrasi `0015_kadiv_features`).
  - API: `/api/kadiv/team`; atur anggota di `/api/kadiv/members`.
  - Rumus beban: `src/lib/kadiv.ts` → `workloadPct`.
- [x] **Kehadiran / cuti** (cincin "Fajar cuti"): model `Attendance`, `/api/attendance`. Orang cuti tidak dihitung di penyebut laporan harian.
- [x] **Aktivitas tim**: dari `AuditLog` (daftar aksi yang aman di `src/lib/kadiv.ts`).
- [ ] Uji dengan basis data sungguhan setelah migrasi 0015 dijalankan; isi `User.divisionId` / `Project.divisionId` untuk data lama (sementara proyek tanpa divisi mengikuti divisi PIC-nya).
- [ ] Laporan mingguan M41 untuk Direktur (§8: draf otomatis, alur, "Kirim ke Direktur", peringatan bila review masih tertunda) belum dikerjakan.
- [ ] KPI "Tepat waktu 30 hari" dari spesifikasi diganti "Sisa waktu serah", karena belum ada data tepat waktu harian per divisi.

### Admin PT (`04-admin-pt.md`)

- [x] **Permintaan akses** (akun baru, akses sementara, pindah peran) dengan `ApprovalItem`: `AccessRequest` (0016), `/api/access-requests`, `src/components/admin/access-requests-card.tsx`.
- [ ] **Sebagian — Pengingat otomatis.** 4 sakelar per PT (`ReminderRule`, 0016), `/api/admin/reminder-rules`, cron `/api/cron/reminder-rules`. Yang belum:
  - Cron baru belum dijadwalkan di `vercel.json`. Usul `*/30 0-11 * * 1-5` UTC; butuh paket Vercel dengan cron lebih dari sekali sehari.
  - Sampai dijadwalkan, hanya sakelar mingguan yang berefek.
- [ ] **Sebagian — Buka kunci.** `/api/unlock-requests` kini punya POST/PATCH (ajukan, setujui, jalankan, kunci kembali), dan kartu UI sudah ada. Yang belum: route tulis (`/api/daily-input`, `/api/weekly-input`, `/api/tasks`) belum memanggil `activeUnlockFor`, sehingga laporan yang dibuka tetap ditolak.
- [x] **Data induk** (ubin hitungan) dan **Pengguna per peran** (donat): `/api/admin/overview`, `admin/master-data.tsx`.
- [x] Kepatuhan per divisi menurut **orang** ("46 dari 50 orang"). Aturan hitung perlu dikonfirmasi produk (lihat Keputusan produk).

### Direktur & Manajemen (`01-manajemen.md`, `02-direktur.md`)

- [x] `oversight-dashboard.tsx` kini memilih `DirectorDashboard` atau `ManagementDashboard` (`src/components/oversight/`).
  - Saringan divisi Direktur.
  - Laporan mingguan divisi dengan lencana per kadiv dan "Tandai sudah dibaca" (`WeeklyReportRead`, 0017).
  - Output yang sedang dikerjakan (donat per divisi).
  - Tren output 8 minggu.
  - Tepat waktu per divisi.
  - Keputusan usulan tenggat.
  - Periode Minggu/Bulan/Kuartal untuk Manajemen.
- [x] Peran `DIREKTUR_SDM_GA`, `TI`, dan `AUDITOR` ada di `/pratinjau`, dengan spesifikasi `docs/design/peran/06-direktur-sdm-ga.md`, `07-ti.md`, `08-auditor.md`.
- [ ] "Beri tanggapan" pada laporan mingguan belum punya API, jadi diganti "Buka laporan lengkap". "Hubungi <kadiv>" belum ada, karena data kontak belum ada.
- [ ] Aksi `ProjectSheet` di `dash-common.tsx` belum dibangun: "Kirim catatan ke PIC", "Tandai sudah ditinjau", tahapan bertanggal dari `ProjectStage`.
- [ ] Persetujuan materi, anggaran, dan cuti belum punya model data. Kehadiran juga belum punya kategori "Terlambat".
- [ ] Pencarian header (⌘K), badge nav "Laporan mingguan n" / "Eskalasi n", dan set tab tablet sesuai spesifikasi (Ringkasan · Proyek · Eskalasi · Divisi, diatur di `ROLE_TABS`).

---

## P3 — Mutu & daftar periksa desain

Jalankan `docs/design/15-checklist-review.md` untuk setiap layar yang sudah pindah:

- [ ] **Sebagian** — ukuran 1440, 834, 390 px.
  - Meja kerja dan Perusahaan & akun sudah diaudit otomatis di 1440, 834, 600, 390, 320, dan 720 (1440 pada zoom 200%), tanpa luapan.
  - Layar P1 hanya dicek sebagian, di 1280/1440 dan 375/390.
- [ ] **Sebagian** — tema terang dan malam.
  - Audit kontras WCAG lolos untuk Meja kerja dan Perusahaan & akun di terang/gelap × merah/biru/grafit.
  - Layar P1/P2 lain belum diperiksa di tema terang.
- [ ] **Sebagian** — aksen merah, biru, grafit. Cakupannya sama dengan butir di atas.
- [ ] **Sebagian** — keyboard penuh.
  - `Sheet` kini memindahkan fokus ke judul, menutup dengan Esc, dan mengembalikan fokus ke pembuka. Ada juga tautan "Lewati ke isi", label landmark, dan Dock dengan roving tabindex.
  - Diuji pada Sheet "Lainnya" dan Dock. Belum diuji di semua layar.
- [ ] **Sebagian** — `prefers-reduced-motion`. Transisi navigasi, Dock, dan CSS baru (`app/css/*.css`) menghormatinya. Belum diperiksa layar per layar.
- [ ] **Sebagian** — zoom 200% tanpa terpotong. Meja kerja dan Perusahaan & akun sudah; layar lain belum.
- [x] Teks berbahasa Indonesia, sentence case, tanpa tanda seru. Sudah dijalankan untuk semua layar (P3-4). Pengecualian yang disengaja ada di Temuan baru.
- [ ] Belum diuji: pembaca layar sungguhan (VoiceOver/TalkBack), simulasi buta warna, Heatmap dan AreaChart di layar.

Tes otomatis minimal:

- [x] Tes unit untuk `src/lib/lock.ts` (tenggat 17.00, kunci Jumat, hari kerja, tanggal mustahil) dan `src/lib/project-status.ts`. Juga `daily-intake` dan `security`.
- [x] Tes API untuk `/api/work-desk` (cakupan per peran, pengingat ganda ditolak) dan `/api/weekly-input` (validasi penyerahan). Juga `/api/auth/login` dan proxy.
- [ ] Tes untuk route P2 (`outputs`, `outputs/review`, `access-requests`, `unlock-requests`, `deadline-proposals`, `attendance`) belum ada.
- [ ] `vitest.config.ts` memicu peringatan "ESM syntax in a CommonJS package". Ganti nama ke `vitest.config.mts` atau set `"type": "module"`.

---

## Catatan kecil yang ditemukan saat pemetaan

- [x] `src/components/mk/core.tsx:68` memuat hex (`#FFFFFF`) untuk nada `putih`. Sudah dipindah ke `var(--putih)`.
- [x] Tombol avatar ponsel di tab bar bawah menimpa label tab pertama ("Ringkasan").
  - Ternyata yang menimpa adalah tombol "N" dev tools Next.js (`nextjs-portal`), yang hanya muncul di mode dev.
  - Tombol avatar sendiri sekarang 44×44.
  - Untuk menyembunyikan tombol dev: `devIndicators: false` di `next.config.ts` (lihat Temuan baru).
- [x] `DashHeader` tidak lagi berkedip dari "Halo, nama" ke "Selamat pagi". Jam memakai `useSyncExternalStore` per menit.
- [x] Notifikasi pengingat PIC (`tab: 'work-desk'`) memindahkan tab dengan benar, menutup popover lebih dulu, lalu menggulir ke atas. Semua lonceng diperbarui serentak lewat event `mk:notifikasi-berubah`.

---

## Temuan baru (6 Okt 2026)

Dikumpulkan dari laporan semua agen. Dikelompokkan menurut siapa yang harus bergerak.

### Keputusan produk

- [ ] **Tujuan laporan harian.** Spesifikasi PIC meminta "Kirim ke kepala divisi". API mengirim ke Admin PT, yang meneruskan ke holding. Tombol kini "Kirim laporan". Ubah desain atau ubah alur.
- [ ] **Kolom Kendala & Rencana tindak lanjut** hanya tampil untuk status Terkendala/Menunggu keputusan. Desain menampilkannya selalu (termasuk "Rencana besok").
- [ ] **Laporan yang sudah diteruskan ke holding** masih bisa diubah atau dikirim ulang PIC (`PUT /api/daily-input`). `forwardedAt` tetap terisi, sehingga isi berubah diam-diam. Pilih: bekukan, atau kembalikan ke antrean Admin PT.
- [ ] **Kepala divisi bisa menyetujui laporan mingguan berstatus DRAFT.** `action=approve` di `/api/weekly-input` tidak mensyaratkan `MENUNGGU_PERSETUJUAN`.
- [ ] **Tenggat mingguan.** Spesifikasi menulis "Jumat 15.00"; kode memakai serah Kamis 17.00 dan kunci Jumat 17.00; data pratinjau memakai Jumat 15.00. Satukan.
- [ ] **Aturan kepatuhan per orang** (Admin PT):
  - Yang wajib lapor hanya anggota divisi aktif yang menjadi PIC proyek aktif.
  - Seseorang dihitung sudah lapor bila semua proyeknya terkirim.
  - CUTI/SAKIT/IZIN keluar dari penyebut.
  - Ubin "Template" menghitung jenis divisi, karena belum ada model template.
- [x] **Kata sandi lemah.** Selesai (F1-C): minimal 8 karakter di semua jalur (`src/lib/password-policy.ts`), akun buatan/setelan ulang admin `mustChangePassword = true` → layar `/login/ganti-sandi`, API lain 403 "Ganti kata sandi dulu". Seed tanpa "1234" (SEED_PASSWORD ≥ 8 atau acak dicetak). Migrasi `0018_auth_password` belum diterapkan.
- [x] **`GET /api/notifications` tanpa `inbox=1`** kini hanya milik akun sendiri untuk semua peran (F1-C). `recipient` notifikasi seragam = email.
- [ ] **Kartu review output kepala divisi** memuat sampai 5 tombol primer "Terima" (satu per `ApprovalItem`). Apakah aturan satu tombol primer per kartu berlaku untuk pola antrean keputusan?
- [ ] **Warna `data-1..6`** masih dibagikan menurut urutan untuk hal yang bukan divisi: donat pengguna per peran, avatar permintaan akses, avatar di Perusahaan, nada proyek di review-card, titik PT di Proyek. Warnanya bisa tertukar dengan warna divisi.
- [ ] **Kata domain yang dipertahankan:** "progress" di tugas harian, dan status harian "Berjalan"/"Terkendala" yang dipetakan ke StatusBadge on/risk. Tombol baris yang hanya "Hapus"/"Kelola" juga dipertahankan karena ruang sempit.
- [ ] **Dua lonceng di desktop** saat mode Dock: lonceng header dashboard dan ikon notifikasi Dock.
- [ ] **Cincin fokus bawaan peramban** pada judul Sheet setelah fokus dipindah skrip. Dibiarkan karena panduan melarang `outline: none` tanpa pengganti.
- [x] **Tombol dev Next.js** dimatikan: `devIndicators: false` di `next.config.ts` (F1-C).

### Rilis & infrastruktur

- [ ] Jadwalkan `/api/cron/reminder-rules` di `vercel.json`.
- [x] `next` dan `eslint-config-next` dinaikkan ke 16.3.8 (F1-C); `npm audit fix` tanpa `--force` dijalankan. Sisa: `deepmerge-ts` via `prisma` (perbaikannya menurunkan CLI ke 6.12 yang tidak cocok dengan `@prisma/client` 6.19.3, jadi dibiarkan), `sharp`, `js-yaml`, `prismjs`, `braces` — semuanya butuh naik mayor.
- [x] Blok `@transform_port_query` (open proxy/SSRF) dihapus dari `Caddyfile` (F1-C).
- [ ] Pembatas laju global: kini di memori per instans. Butuh Upstash/Vercel KV.
- [ ] Pencabutan token saat keluar butuh tabel sesi.
- [ ] Isi `APP_ORIGINS` bila aplikasi berada di balik proxy yang mengubah Host.
- [ ] `AUTH_SECRET` ≥ 32 karakter acak dan `CRON_SECRET` ≥ 16 karakter di Vercel. `NEXT_PUBLIC_SUPABASE_URL` diisi saat build, supaya CSP mengizinkan gambar bukti.
- [ ] Unggah bukti butuh `SUPABASE_SERVICE_ROLE_KEY`. Tanpa itu jawabannya 503, dan hanya tautan bukti yang berfungsi.

### Bug & utang teknis yang belum diperbaiki

- [ ] Buka kunci tidak berefek pada penulisan: panggil `activeUnlockFor(type, id)` di `/api/daily-input`, `/api/weekly-input`, `/api/tasks`. `/api/daily-input` juga hanya menulis laporan hari ini.
- [x] Akses sementara yang berakhir (`revertExpiredAccess`) kini juga mengembalikan `Division.headUserId` yang diubah `applyRoleChange` (`appliedData.heads`), bila divisi itu belum diubah orang lain (F1-C).
- [x] Mengurungkan permintaan revisi (`/api/outputs/review` undo) mengosongkan `revisionNote`, sehingga catatan putaran sebelumnya hilang. [F1-D]
- [ ] Notifikasi keputusan buka kunci dan permintaan akses menyimpan id akun di `recipient`; notifikasi lain menyimpan email.
- [x] `pic-access.ts` → `relationTo` menganggap setiap kepala divisi di PT terkait dengan semua proyek PT itu, untuk catatan, baca, dan hitungan belum dibaca. Baru keputusan output yang dipersempit. [F1-D]
- [x] `ProjectNote.readAt` hanya satu kolom. Dalam percakapan tiga pihak, catatan dianggap dibaca begitu satu pihak lain membukanya. [F1-D]
- [ ] "Ingatkan" di layar Direktur (`/api/notifications/remind`, `lib/reminders.ts`) mengingatkan semua divisi PT yang belum menyerahkan minggu **berjalan**, bukan satu divisi untuk minggu laporan yang tampil.
- [x] `runDueRules` hanya menjalankan aturan untuk entitas bertipe `PT`, tidak `UNIT`/`SUB_HOLDING`. Eskalasi otomatis melewati PIC tanpa `divisionId`. [F1-D]
- [x] `timelineFrame` di `dash-common.tsx` menghitung "hari ini" dari zona waktu peramban, bukan WIB. [F1-D]
- [x] `adminDesk` (`/api/work-desk`) membaca pengingat hari ini dari semua PT. Hanya efisiensi; tidak ada yang bocor. [F1-D]
- [x] `remindOne` (pengingat manual) masih di `work-desk/route.ts` dan disalin di `lib/reminder-rules.ts`. Pindahkan ke satu berkas di `src/lib`. [F1-D]
- [x] Route `unlock-requests`, `access-requests`, `admin/reminder-rules`, `companies`, `evidence`, `notifications` tidak lagi mengembalikan `err.message` mentah (`src/lib/api-error.ts`, F1-C).
- [x] `AUDIT_ACTION_LABELS` (`views/audit-view.tsx`) belum punya label untuk `REQUEST_ACCESS`, `APPROVE_ACCESS_REQUEST`, `REJECT_ACCESS_REQUEST`, `GRANT_TEMP_ACCESS`, `TEMP_ACCESS_EXPIRED`, `UPDATE_REMINDER_RULE`, `AUTO_REMINDER`, `REQUEST_UNLOCK`, `APPROVE_UNLOCK`, `REJECT_UNLOCK`, `RELOCK_REPORT`. [F1-D]
- [x] `/api/roles` masih memakai label Title Case ("Kepala Divisi", "PIC Proyek"). [F1-D]
- [x] `useMedia` di `shell.tsx` masih `(max-width: 599px)` / `(min-width: 1024px)`. Pada lebar pecahan, pilihan tata letak JS bisa berbeda tipis dengan CSS (range syntax). [F1-D]
- [x] `.text-ink-3` diganti `ink-2` lewat override CSS di `mk-modules.css`. Perbaiki di sumbernya: `work-desk/parts.tsx`, `views/companies-view.tsx`. [F1-D]
- [x] `Chip` dari komponen desain tingginya 36 px, di bawah target sentuh 44 px. [F1-D]
- [x] `DivisionBar` membatasi batang di 100%. Orang dengan beban 112% tampil penuh, dan angka sebenarnya hanya di teks. [F1-D]
- [x] Toast sonner (`top-center`) sempat tampil tanpa latar dan di belakang tab bar mengambang. Periksa gaya dan posisi `Toaster` di `layout.tsx`. [F1-D]
- [ ] Baris dukungan hero Proyek dan Divisi hanya menghitung halaman yang dimuat, karena API berhalaman.
- [ ] Grafik: tiap batang/titik satu tab stop, tanpa navigasi panah di dalam grafik.
- [ ] Sheet akun di `AccountManager` dipasang/dilepas tanpa animasi keluar.
- [ ] `npm install` melaporkan skrip instal yang tidak tercakup `allowScripts` (prisma, esbuild, sharp). Periksa hasil `prisma generate` di mesin baru.

### Fitur yang belum dibangun

- [ ] Data contoh `/pratinjau` untuk `/api/daily-input`, `/api/progress-reports`, `/api/inbox`, `/api/projects`, `/api/escalations`, `/api/weekly-reports`, `/api/entities`, `/api/entities/[id]`, `/api/audit-logs`, `/api/system`, `/api/profile`. Tanpa itu tab-tab tersebut menampilkan keadaan galat di pratinjau.
- [ ] Mengatur `Project.divisionId` dari formulir proyek, dan `User.divisionId` dari layar akun. Kini hanya lewat "Atur anggota".
- [ ] Formulir "Ajukan permintaan" akses untuk kepala divisi dan PIC. API sudah menerima; daftar akunnya kini dari `/api/companies`, yang hanya terbuka untuk pemegang meja akun.
- [ ] "Ingatkan" per orang di Sheet kepatuhan divisi (Admin PT), "Unduh log", dan heatmap 10 hari per divisi.
- [ ] Tombol "Lampirkan foto" terpisah di laporan harian. Kini foto lewat `EvidencePanel`.
- [x] Endpoint pembatalan untuk setujui/tolak proyek, tinjau/putuskan/tutup eskalasi, ajukan ulang, arsip, dan penerusan: `POST /api/undo` + `UndoToken` (migrasi 0025, belum diterapkan). Lihat docs/fitur/urungkan.md. [F2-URUNGKAN]
- [x] `KpiSnapshot` belum diperbarui oleh pekerjaan terjadwal. [F1-D]
