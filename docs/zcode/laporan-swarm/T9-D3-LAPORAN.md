# T9-D3 — Inbox terpadu (Kotak masuk) untuk semua peran

Tanggal: 10 Oktober 2026, 19.15 WIB · Agen: T9-D3 (Zcode) · Zona: `src/lib/constants.ts` (NAV_TABS), `src/lib/rbac.ts` (ROLE_TABS), `src/components/shell.tsx` (ikon + badge), `src/components/app-shell.tsx` (wire), `src/components/views/pesan-view.tsx` (baru), preview mock. Tanpa git/DB.

Keputusan pemilik 10 Okt 2026: kotak inbox/pesan di sidebar dan dock untuk SEMUA peran — satu tempat melihat seluruh pesan (komentar, pemberitahuan, dll). Tab `pesan` ("Kotak masuk", singkat "Pesan") kini tampak untuk 9 peran, tepat setelah Ringkasan.

## 1. Berkas yang diubah

| Berkas | Perubahan |
|---|---|
| `src/lib/constants.ts` | `NAV_TABS` + entri `{ id: 'pesan', label: 'Kotak masuk', short: 'Pesan' }` (lihat catatan posisi di §3.1) |
| `src/lib/rbac.ts` | `ROLE_TABS`: `'pesan'` ditambahkan ke 9 peran (PIC_PROYEK, KEPALA_DIVISI, ADMIN_PT, DIREKTUR_ENTITAS, DIREKTUR_SDM_GA, TI, SUPERADMIN, MANAJEMEN, AUDITOR), selalu tepat setelah `'dashboard'` |
| `src/components/shell.tsx` | `TAB_ICONS` + `pesan: 'kirim'`; ekspor `refreshNotes()` (kirim event `mk:notifikasi-berubah`); `AppFrame` menggabungkan lencana `pesan` = jumlah belum dibaca (dari `useNotifications` yang sudah dimuat) ke sidebar, tab bar tablet & ponsel, dan Dock |
| `src/components/app-shell.tsx` | Impor + `{activeTab === 'pesan' && <PesanView />}` |
| `src/components/views/pesan-view.tsx` | Baru — lihat §2 |
| `src/components/preview/mock-data.ts` | `notifications` diperluas jadi 7 pesan beragam (3 belum dibaca): pengingat mingguan divisi, pengingat harian PIC, usulan proyek menunggu persetujuan, komentar review output, keputusan buka kunci disetujui, ringkasan mingguan dibaca, akses sementara ditolak. Template mengikuti penulis notifikasi sungguhan (`reminders*.ts`, `reminder-rules.ts`, API keputusan akses/buka kunci) |
| `src/components/preview/mock-api.ts` | PATCH `/api/notifications` kini benar-benar menandai dibaca di data contoh (readAt diisi, `unread` dihitung ulang) sehingga daftar, lencana nav, dan lonceng pratinjau berubah seketika; sebelumnya PATCH hanya membalas `{ ok: true }` |
| `tests/cx/t8-statistik.test.ts` | Aserasi urutan tab ADMIN_PT diperbarui menyertakan `'pesan'` (wajib, lihat §3.3) |

`src/app/api/inbox/route.ts` TIDAK disentuh (tetap milik Admin PT). `src/app/api/notifications/route.ts` juga tidak diubah — PesanView memakai bentuk respons yang sudah ada.

## 2. PesanView (`src/components/views/pesan-view.tsx`)

- Data dari `GET /api/notifications?inbox=1` via `useResource` — bentuk `{ unread, items: [{ id, template, title, body, tab, createdAt, readAt }] }` (payload sudah diurai route menjadi title/body/tab).
- Baris pesan kustom (pola `mk-userrow`, sama dengan baris log aktivitas): kotak ikon lembut per jenis + judul (tebal bila belum dibaca) + isi (maks 2 baris) + `jenis · waktu relatif` (`formatRelative`) + titik aksen `bg-accent-fill` untuk belum dibaca + chevron.
- Jenis pesan ditebak dari template (`REVIEW_OUTPUT`/KOMENTAR → komentar; `KEPUTUSAN_*` → persetujuan; `PENGINGAT_*`/`ESKALASI_KADIV_HARIAN` → pengingat; lainnya → pemberitahuan), lalu dari teks judul/isi bila template tak dikenal. Selalu ikon + kata (07 · Ikon).
- Klik pesan → `PATCH /api/notifications` `{ ids: [id] }` + detail di Sheet (judul, jenis/label template, waktu lengkap WIB + relatif, isi, status baca). Status baca di Sheet ikut diperbarui setelah muat ulang.
- Sheet memasang satu tombol primer "Buka <modul>" bila `payload.tab` terisi dan tab itu terlihat peran pengguna (`canSeeTab`); menutup sheet lalu berpindah tab.
- Header: tombol "Tandai semua dibaca" (sekunder, hanya saat ada yang belum dibaca, ada keadaan sibuk "Menandai…").
- SegmentedControl "Semua" / "Belum dibaca" — saringan sisi klien di dalam `mk-toolbar`.
- Satu kalimat jawaban di atas daftar ("3 pesan belum dibaca." / "Semua pesan sudah dibaca."), EmptyNote "Belum ada pesan" + varian "Semua pesan sudah dibaca" untuk saringan kosong, ErrorNote dengan "Coba lagi", dan Skeleton memuat.
- Setelah PATCH sukses: `refreshNotes()` (event `mk:notifikasi-berubah`) menyinkronkan lonceng & lencana nav di shell, lalu `reload()`.

## 3. Keputusan & penyimpangan yang perlu diketahui parent

### 3.1 Posisi di NAV_TABS: setelah `dashboard`, bukan setelah `system`

Brief meminta menambah `pesan` ke NAV_TABS "setelah 'system'". Namun `AppFrame` (shell.tsx) merender tab dalam urutan `NAV_TABS` yang difilter keanggotaan `ROLE_TABS` — urutan `ROLE_TABS` hanya menentukan tab pendaratan. Menambah setelah 'system' membuat Kotak masuk tampil TERAKHIR di sidebar/dock semua peran, bertentangan dengan rasional brief ("kotak masuk adalah hal kedua yang dilihat", keputusan pemilik). Karena itu `pesan` disisipkan tepat setelah `dashboard` di NAV_TABS dengan komentar yang menjelaskan. Bila parent tetap menghendaki posisi terakhir, cukup pindahkan satu baris itu.

Efek samping posisi kedua (sadar, diterima): tab bar ponsel memuat 3 tab pertama + "Lainnya", jadi satu tab lama jatuh ke "Lainnya" (mis. "Laporan harian" untuk PIC). `ROLE_COMPACT_TABS` (DIREKTUR_ENTITAS, MANAJEMEN) sengaja tidak diubah — menambah 'pesan' di sana akan memecah tata letak 4 slot ponsel yang dispesifikasikan; bagi dua peran itu Kotak masuk ada di "Lainnya" pada tablet/ponsel dan tetap kedua di sidebar desktop.

### 3.2 Ikon `kirim`, bukan `surat`

`surat` tidak ada di `IconName` (core.tsx, daftar 07 · Ikon) dan menambah ikon baru menyangkut `core.tsx` di luar zona. Dipilih `kirim` — 07-ikon.md mengaitkannya dengan "kirim laporan/pesan", dan beda dari lonceng `notifikasi` agar ikon Kotak masuk tidak kembar dengan utilitas Notifikasi di Dock.

### 3.3 Berkas di luar zona yang terpaksa diubah

`tests/cx/t8-statistik.test.ts` mengunci urutan persis tab ADMIN_PT (keputusan pemilik 9 Okt). Penambahan 'pesan' yang diwajibkan membuat asersi itu gagal; baris 18 diperbarui menjadi `['dashboard', 'pesan', 'work-desk', 'statistik', ...]` plus catatan tanggal di komentar. Tidak ada asersi lain yang berubah.

### 3.4 Badge nav

`/api/nav-badges` belum menghitung notifikasi, jadi lencana `pesan` diambil dari data `useNotifications` yang sudah dimuat shell (`/api/notifications?inbox=1`, tanpa fetch tambahan), digabung ke `navBadges` lewat memo `badges`. Sinkron seketika lewat event `mk:notifikasi-berubah` — baik dari tombol lonceng lama maupun dari PesanView. `/api/nav-badges` (route) tidak diubah (di luar zona); bila nanti unread notifikasi dipindah ke sana, cukup hapus memo `badges` di shell.

## 4. Verifikasi (dijalankan, bukan klaim)

- `npx tsc --noEmit --incremental false` → 0 galat.
- `npx eslint src/lib/constants.ts src/lib/rbac.ts src/components/shell.tsx src/components/app-shell.tsx src/components/views/pesan-view.tsx src/components/preview/mock-api.ts src/components/preview/mock-data.ts` → bersih.
- `npx vitest run` (seluruh suite) → 89 berkas / 1.566 tes lulus (termasuk `tests/cx/t8-statistik.test.ts` yang diperbarui dan `tests/cx/cx11-preview.test.ts`).

Semua di atas "lulus lokal" pada worktree `codex/kerja`; belum ada uji produksi (tanpa DB sungguhan — pratinjau `/pratinjau?peran=…` memakai mock yang juga dilayani untuk GET/PATCH `/api/notifications`).

## 5. Keterbatasan

- Klasifikasi jenis pesan heuristik dari template/judul/isi; notifikasi baru dengan template tak dikenal masuk kategori "Pemberitahuan".
- GET hanya mengambil 30 pesan terbaru (batas API yang sama dengan lonceng); tanpa paginasi di tampilan.
- Pratinjau memakai state contoh bersama: "tandai dibaca" bertahan sampai halaman dimuat ulang (pola yang sama dengan handler workDesk).
- Spesifikasi `docs/design/peran/*.md` belum memuat layar Kotak masuk (dokumentasi milik zona DOCS) — usul penambahannya ke parent.

## 6. Usulan untuk parent

- Bila ingin lencana `pesan` dihitung server-side, tambahkan unread `NotificationLog` (channel APLIKASI) ke `/api/nav-badges` lalu sederhanakan shell (hapus memo `badges`).
- Pertimbangkan memasukkan Kotak masuk ke `ROLE_COMPACT_TABS` bila pemilik inginnya tampil di 4 slot utama tablet/ponsel untuk Direktur/Manajemen (saat ini di "Lainnya").
- docs: catat tab baru di `docs/design/peran/` (semua peran) dan `07-ikon.md` bila ikon `surat` ditambahkan kelak.
