# T10-AUD2 — Audit UI/state frontend Monitor Karya

- Agen: T10-AUD2 (pemburu bug UI/state, baca-saja)
- Tanggal: 10 Oktober 2026
- Zona: `src/components/**`, `src/hooks/**`, `src/lib/format.ts`, `src/lib/project-status.ts`
- Cabang: `codex/kerja` (worktree `/Users/godam/PROYEK/monitor-karya-codex`)
- Metode: baca menyeluruh (hooks, mk/, views/, oversight/, admin/, kadiv/, work-desk/, pic/, companies/, group/, search/, misc) + grep pola berisiko (setState-dalam-render, deps `reload`, `toLocale*` tanpa zona WIB, divide-by-zero, `dangerouslySetInnerHTML`, fallback `17.00`) + penelusuran silang kontrak API terkait (`/api/daily-input`, `/api/work-desk`, `/api/my-dashboard`, `/api/inbox`).

## Ringkasan

- **16 temuan**: 1 HIGH, 3 MEDIUM, 5 LOW, 7 INFO/catatan positif.
- Temuan paling serius ada persis di area yang baru diperbaiki (aturan pelaporan per entitas): UI belum menangani kontrak baru `countdown: null` (mode 24/7) sehingga tab Laporan harian PIC **crash**.
- Tidak ditemukan XSS (satu-satunya `dangerouslySetInnerHTML` di `src/app/layout.tsx` berisi konstanta statis `PREFS_BOOT_SCRIPT`, bukan data klien/API).
- RBAC UI konsisten: tindakan tulis digerakkan `can()` (rbac.ts) atau bendera izin dari server (`p.permissions`, `canApprove`, `can.request/approve/execute`, `canManageCompanies`, `viewer.canRemind`). Tidak ada tombol peran lain yang bocor.
- Tidak ditemukan infinite loop `useEffect` aktif (lihat INFO-1 untuk ranjau `reload`).

---

## Temuan

### [HIGH] H1 — Crash pada tab Laporan harian saat aturan pelaporan 24/7 (`countdown: null`)

- Lokasi: `src/components/views/daily-input-view.tsx:328` (tipe di baris 69).
- `GET /api/daily-input` (`src/app/api/daily-input/route.ts:169`) kini mengembalikan `countdown: null` ketika settings entri `dailyCutoffHour === null` (mode "24/7 tanpa batas" pada kartu Aturan pelaporan), dengan `locked: false`. Tapi `DailyInputView` tetap menulis tipe `countdown: { hours; minutes; passed }` (non-null) dan merender:
  ```tsx
  : `Tenggat ${formatTime(data.lockAt)} WIB · ${data.countdown.hours} jam ${data.countdown.minutes} menit lagi.…`
  ```
- Dampak: begitu Admin PT memilih "24/7 (tanpa batas)" di Statistik → Aturan pelaporan, setiap PIC entitas itu yang membuka tab "Laporan harian" mendapat TypeError `Cannot read properties of null (reading 'hours')` — layar mati total (tidak ada error boundary per tab).
- Usulan perbaikan: perbarui tipe `Data.countdown` menjadi `{ hours; minutes; passed } | null`; saat null dan tidak terkunci tampilkan kalimat tanpa tenggat (mis. "Mode 24/7 · kirim kapan saja hari ini"); tambahkan pengujian render dengan `countdown: null`. (Sekalian: `lockAt` masih dihitung `dailyLockAt()` env di route — di mode 24/7 jangan tampilkan "Tenggat 17.00".)

### [MEDIUM] M1 — Hero PIC memakai label tenggat konstanta env, bukan `lockAt` dari API

- Lokasi: `src/components/views/role-dashboards.tsx:74-76` (import di baris 19), data `lockAt` tersedia di baris 64.
- `deadlineText()` menyusun "Tenggat 17.00 WIB · X jam Y menit lagi" dari `DAILY_CUTOFF_LABEL` (konstanta env `src/lib/lock.ts:43`, ter-bundle ke klien), padahal `PicData.lockAt` dikirim `/api/my-dashboard` dan sudah dipakai untuk hitungan "lewat X menit".
- Dampak: jika jam batas entri diubah lewat settings/env, angka hitung mundur (dari API) dan label jam (konstanta) bisa bertentangan ("Tenggat 17.00 WIB · 6 jam lagi" untuk cutoff 23.00). Ini sisa langsung dari kelas bug lockAt/countdown yang baru diperbaiki.
- Usulan: ganti `${DAILY_CUTOFF_LABEL}` dengan `${formatTime(lockAt)} WIB` (param sudah ada), atau turunkan label cutoff dari respons API.

### [MEDIUM] M2 — Kartu Aturan pelaporan menghilang diam-diam saat API gagal; fallback klien bertentangan dengan bawaan server

- Lokasi: `src/components/admin/report-settings-card.tsx:46-57` dan `:77`; fallback di baris 52.
- Saat `fetch /api/admin/report-settings` gagal, `catch` kosong (`/* fallback bawaan */`) tidak mengisi apa pun → `settings` tetap null → `if (!settings) return null` membuat seluruh kartu lenyap tanpa pesan error/retry.
- Selain itu fallback baris 52 memakai `{ dailyCutoffHour: null, ... }` (24/7) sementara bawaan server `DEFAULT_SETTINGS.dailyCutoffHour = 17` (`src/lib/report-settings.ts:26`) — jika respons tanpa `settings`, UI menampilkan "24/7" padahal server mengunci 17.00.
- Dampak: Admin PT tidak tahu aturan gagal dimuat dan bisa salah membaca mode saat ini.
- Usulan: simpan pesan error + render `ErrorNote` dengan retry; samakan fallback dengan `DEFAULT_SETTINGS` (atau minta server selalu mengembalikan `settings`).

### [MEDIUM-LOW] M3 — Teks "tenggat Kamis 17.00 WIB" dikodekan keras (3 tempat) padahal `data.week.handoverBy` tersedia

- Lokasi: `src/components/admin/compliance.tsx:130`, `:187`, `:403`.
- Kartu kepatuhan (subtitle mingguan, kartu divisi tablet, dan Sheet divisi) menulis "Tenggat Kamis 17.00 WIB" literal, meski `weeklyBadge()` di file yang sama memakai `data.week.handoverPassed` (deadline sesungguhnya ada di payload).
- Dampak: saat `weeklyCutoffHour` entri disetel 15.00 (opsi di kartu Aturan pelaporan), Admin PT tetap melihat "Kamis 17.00".
- Usulan: format dari `data.week.handoverBy` (pola `deadline()` di `division-weekly-desk.tsx:152`).

### [MEDIUM-LOW] M4 — Pergantian hari (buka kunci lampau) menampilkan data hari lama tanpa sinyal memuat

- Lokasi: `src/components/views/daily-input-view.tsx:252-259`.
- `setDay()` mengubah URL `useResource`; selama fetch baru, `data` masih milik tanggal sebelumnya dan `loading && !data` false, jadi layar merender laporan tanggal lama seolah tanggal yang baru dipilih (view ini tidak memakai `opacity-60`/`aria-busy` seperti `division-weekly-desk`/`projects-view`/`pesan-view`).
- Dampak: PIC yang membuka laporan lampau lewat tombol "Ubah laporan tanggal X" sempat melihat isi hari ini tanpa penanda; berpotensi salah baca/menyunting entri.
- Usulan: bungkus konten dengan indikator `loading` (pola `cx('…', loading && 'opacity-60 pointer-events-none') aria-busy`), atau jangan render tubuh saat `data.reportDateKey !== day`.

### [LOW] L1 — Fallback `cutoffLabel ?? '17.00'`

- Lokasi: `src/components/kadiv/team-cards.tsx:82`.
- `TeamDailyCard` mundur ke string `'17.00'` saat API lama tanpa `cutoffLabel`, padahal `t.lockAt` ada di payload `/api/kadiv/team`.
- Dampak: label tenggat bisa salah untuk entitas dengan jam batas berbeda.
- Usulan: `t?.cutoffLabel ?? formatTime(t?.lockAt) ?? '—'`.

### [LOW] L2 — `reload` dari `hooks/use-fetch.ts` tidak stabil + jalur 401 menggantung `loading`

- Lokasi: `src/hooks/use-fetch.ts:86` (`reload: () => setTick(...)` dibuat ulang tiap render) dan `:59-63` (401 `return` tanpa setState).
- Hari ini aman (tidak ada pemanggil yang memasukkan `reload` ini ke deps `useEffect` — `admin/use-fetch.ts` punya `useCallback`, `use-resource.ts` juga), tapi identitas yang berubah tiap render adalah ranjau infinite-loop bila kelak dipakai di deps. Jalur 401 juga meninggalkan `loading=true` selamanya bila redirect ke `/login` tidak jalan (mis. mode pratinjau).
- Usulan: bungkus `reload` dengan `useCallback([], …)`; di jalur 401 set `loading:false` sebelum redirect.

### [LOW] L3 — Helper format menyamakan data kosong dengan nol

- Lokasi: `src/lib/format.ts:80-98` (`formatNumber/formatPercent/formatRp` mengembalikan '0'/'0%'/'Rp 0' untuk `null/undefined`) dan `:122-128` (`formatRpShort` menghasilkan `Rp0` tanpa spasi vs `Rp 1,2 M` dengan spasi).
- Dampak: KPI "belum ada data" tampil seolah nilainya 0; format rupiah pendek tidak konsisten.
- Usulan: kembalikan '—' untuk null/undefined (atau sediakan varian eksplisit), rapikan spasi `Rp`.

### [LOW] L4 — Desimal MB tidak konsisten (titik vs koma)

- Lokasi: `src/components/evidence-panel.tsx:20` (`(bytes/1024/1024).toFixed(1)` → "1.5 MB") vs `src/components/pic/outputs.tsx:299` dan `oversight/approval-requests.tsx:379` (koma, "1,5 MB" / `toLocaleString('id-ID')`).
- Dampak: inkonsistensi format angka Indonesia antar layar bukti.
- Usulan: satu helper `humanSize` bersama yang memakai koma.

### [LOW] L5 — Lencana nav untuk peran TI tidak pernah diambil

- Lokasi: `src/components/pic/nav-badges.ts:23`.
- `enabled` hanya PIC, MANAJEMEN, DIREKTUR_ENTITAS, DIREKTUR_SDM_GA, SUPERADMIN — TI (yang memegang tab eskalasi/inbox/system sesuai `ROLE_TABS.TI`) tidak pernah memanggil `/api/nav-badges`.
- Dampak: TI tidak melihat lencana "n eskalasi" di navigasi, tidak seperti peran grup lain.
- Usulan: tambahkan `'TI'` ke daftar (atau turunkan dari `canSeeTab(role, 'escalations')`).

### [LOW] L6 — Proyek DITUTUP tanpa laporan tampil "100% selesai"

- Lokasi: `src/lib/project-status.ts:27-29` — cabang done mengembalikan `progress: latest ? progress : 100`.
- Dampak: proyek ditutup tanpa satu laporan pun dirender "100% selesai" di baris/ring proyek — menyesatkan pembaca.
- Usulan: kembalikan progress 0 (atau null) saat tidak ada laporan, biarkan status `done` yang berbicara.

### [LOW] L7 — Label tenggat mingguan memakai konstanta env di Sheet pengawas

- Lokasi: `src/components/oversight/weekly-reports.tsx:17,288` (`WEEKLY_HANDOVER_LABEL` / `WEEKLY_LOCK_LABEL`).
- `weeklyCutoffHour` kini bisa 15.00 per entitas; teks Sheet "Tenggat serahnya Kamis 17.00 WIB" bisa salah. `division-weekly-desk` sudah benar (pakai `data.week.handoverBy`).
- Usulan: bawa `handoverBy`/`lockAt` minggu berjalan di payload ringkasan, atau format dari data yang ada.

---

## INFO / catatan

1. **Ranjau deps (tidak aktif)**: `admin/activity-log.tsx:54` memasang `[reloadKey, reload]` — aman hanya karena `admin/use-fetch.ts` men-stabilkan `reload` dengan `useCallback`. Jalur `hooks/use-fetch.ts` (L2) tidak stabil; jangan mencampur.
2. **SetState-during-render yang aman**: pola "simpan last untuk animasi tutup" di `mk/sheet.tsx:55-67`, `dash-common.tsx:140-143`, `work-desk/admin-desk.tsx:511-512`, `entities-view.tsx:388-389`, `pesan-view.tsx:224-225` adalah pola penyesuaian-state-saat-render yang diakui React dan berhenti sendiri — bukan bug.
3. **`shell.tsx:519-534`**: listener ⌥⌘D dipasang ulang tiap render (effect tanpa deps) — sengaja agar closure selalu segar; hanya boros kecil, bukan kebocoran (cleanup ada).
4. **Dead code**: `companies-view.tsx:~228` `companies={full ? companies : companies}` (ternary no-op).
5. **Teks "0 divisi Anda"**: `role-dashboards.tsx:356-357` saat `data.divisions` kosong — tidak crash, hanya kalimat janggal.
6. **WIB konsisten**: semua format tanggal/jam klien lewat `timeZone: 'Asia/Jakarta'` atau pola shift `+7h` + getter UTC (`wibKey`, `toWibTime`, `toDateInput`, `weekKeyOf`) — tidak ditemukan timezone mismatch. `timelineFrame` benar memakai `startOfDayWIB`.
7. **Deviasi kecil yang disengaja dan aman**: `system-view` menampilkan `dailyCutoff` dari `/api/system` (label env global, bukan per-entitas) — wajar untuk konsol TI, tapi akan menyesatkan bila settings per-entitas menyebar.

## Yang diperiksa dan sehat (ringkas)

- **XSS**: tidak ada `innerHTML`/`dangerouslySetInnerHTML` di zona; log audit dirender lewat `safeStringify` ke text node; `window.open` selalu `noopener,noreferrer`; mailto/tel di-escape.
- **Divide-by-zero**: semua helper `pct(a,b)` menjaga `b>0`; `mk/data.tsx` (Donut `total||1`, Sparkline `Math.max(...data,1)`, Bar `max ? … : 6`, Area `max-min||1`), Heatmap, `Timeline`, `AreaChart` kosong tidak menghasilkan NaN/crash.
- **Aksesibilitas**: Sheet memakai Radix (focus trap, Esc, fokus kembali ke pemicu + fallback `[data-sheet-focus-fallback]`); grafik punya `aria-label` + roving focus panah/Home/End (`mk/keyboard.ts`); tombol ikon selalu berlabel; tabel pembaca layar untuk heatmap; `prefers-reduced-motion` dihormati di animasi; tautan lompat "Lewati ke isi" ada. Tidak menemukan kontrol interaktif tanpa keyboard.
- **RBAC UI**: `ProjectsView` (mayPropose/permissions), `EscalationsView` (`escalationPerms`), `UnlockCard` (`can.request/approve/execute` + anti-self-approve), `CompaniesView`/`AccountSheet` (`canManageCompanies`, `manageableRoles`), `ApprovalRequestsCard` (`canRequest`), `WeeklyReportsCard` (`viewer.canRemind/canMarkRead/canComment`), tab via `tabsForRole`/`canSeeTab`, notifikasi hanya melompat ke tab yang boleh dilihat peran. Tidak ada temuan.
- **Data flow**: `useResource`/`useFetch` menangani 401 (redirect), error terpesan; kartu-kartu Admin gagal mandiri; `useKadivData` memakai `Promise.allSettled` + nomor urut anti-race; `WeeklyTaskBoard`/`outputs.tsx` menjaga tindakan pasca-unmount dengan ref `isCurrent`.

## Prioritas tindak lanjut

1. Perbaiki H1 segera (crash tersulit oleh fitur baru Aturan pelaporan; tambahkan uji render `countdown: null`).
2. M1 + M3 + L1 + L7 dalam satu sapuan "label tenggat dari API" (`lockAt`/`handoverBy`).
3. M2: error state + fallback konsisten pada kartu Aturan pelaporan.
4. M4: indikator memuat saat berganti hari di Laporan harian.
