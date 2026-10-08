# Laporan T2-B5 — Tes regresi UI Tahap 1

8 Oktober 2026, 11.40 WIB. Worktree `monitor-karya-codex`, cabang `codex/kerja`.

## Ringkasan tugas

Menulis tes regresi untuk tiga perubahan UI Tahap 1 (lihat [HASIL-TAHAP1](../HASIL-TAHAP1.md)) supaya regresi tidak lolos diam-diam: label 3 huruf peta panas ponsel (`short3`), hook `useIsTablet`/`useIsPhone` di `mk/layout.tsx`, kartu divisi 2 kolom tablet di `ComplianceCard`, dan daftar log `ActivityItem` di `AuditView` ponsel. Tanpa dependensi baru, tanpa menyentuh kode sumber.

## Berkas yang ditulis (semua baru)

- `tests/ui/short3.test.ts` — 14 tes unit fungsi `short3` (src/components/admin/compliance.tsx).
- `tests/ui/use-is-tablet.test.ts` — 10 tes hook `useIsPhone`/`useIsTablet` (src/components/mk/layout.tsx).
- `tests/ui/audit-view-phone.test.ts` — 6 tes cabang ponsel/non-ponsel `AuditView` (src/components/views/audit-view.tsx).
- `tests/ui/compliance-responsive.test.ts` — 8 tes kartu tablet + peta panas ponsel `ComplianceCard`/`ComplianceHeatmapCard` (src/components/admin/compliance.tsx).
- Laporan ini.

Tidak ada berkas lain yang diubah; tidak ada commit.

## Cakupan: otomatis perilaku vs kontrak statis

Semua sasaran minimal teruji otomatis (kode sungguhan dijalankan), bukan kontrak statis — kecuali satu sub-butir yang dicatat di bawah.

| Sasaran | Cara uji | Yang dipastikan |
|---|---|---|
| short3 | Unit langsung | Dua kata ke atas menjadi inisial dan maksimal 3 inisial ("Sumber Daya Manusia"→"SDM", 5 kata→3 inisial); satu kata 3 huruf pertama ("Teknologi"→"Tek", "Hukum"→"Huk"); kata pendek tidak diregangkan ("IT","SD","A"); string kosong → kosong; hanya spasi → tanpa karakter terlihat (dipatok perilaku kini, lihat catatan); kapital campuran: inisial selalu kapital ("sumber daya manusia"→"SDM") tetapi satu kata mempertahankan kapital aslinya ("keuangan"→"keu"); spasi tepi/ganda diabaikan |
| useIsTablet/useIsPhone | Perilaku dengan stub `globalThis.window.matchMedia` + mock `React.useSyncExternalStore` yang meniru kontrak React (SSR → getServerSnapshot; klien → pasang langganan lalu baca snapshot) | Query persis `'(min-width: 600px) and (max-width: 1023px)'` dan `'(max-width: 599px)'`; `.matches` diikuti benar (false→true saat viewport berubah); `addEventListener('change', cb)` dan `removeEventListener` lewat cleanup; callback dipanggil saat MQL mengirim change; tanpa `window` (SSR/render pertama) selalu false dan `matchMedia` tidak tersentuh; batas rentang ponsel (599) tepat satu piksel di bawah minimum tablet (600) — satu-satunya bagian semi-statis: konstanta query diparse angkanya |
| audit-view ponsel | Struktural pada pohon elemen hasil panggilan `AuditView()` (pola tests/cx/account-sheet-presence.test.ts: React dimock, useFetch dimock, tanpa DOM) | Cabang ponsel: setiap log jadi `<button class="mk-audit-act">` berisi tepat satu `ActivityItem` (who/inisial/waktu/last benar, ActionTag + label target di slot action); aria-label persis `<aksi> oleh <pelaku|sistem>, <waktu>. Buka rincian` (dihitung ulang pakai `AUDIT_ACTION_LABELS` + `formatDateTime`); `AuditCardRow` tidak dipakai. Non-ponsel: `AuditCardRow` di wadah `xl:hidden mk-list`, tabel `mk-adm-table` 6 kolom di wadah `hidden xl:block` dengan `AuditTableRow` per log, tanpa `mk-audit-act` |
| compliance tablet | Struktural pada pohon `ComplianceCard({state})` (state fixture ComplianceData lewat props; useFetch tidak jalan) | Tablet harian: kisi `grid grid-cols-2 gap-3`, dua kartu `mk-card--inset` berisi nama + kepala divisi + `DivisionBar` (nama "Kepatuhan harian", nilai `pctOf`, meta "x dari y orang") + `StatusBadge` (risk/"1 belum"; done/"Lengkap") + tombol Detail + Ingatkan hanya bila ada yang belum lapor dan bisa mengingatkan (aria-label "Ingatkan 1 orang Divisi Teknologi"); locked → lencana late dan Ingatkan hilang; mode mingguan → tanpa DivisionBar dan tanpa Ingatkan, lencana mingguan (done/Masuk, neutral/Belum masuk), teks tenggat; non-tablet → pola lama `mk-desk-queue` utuh (DivisionBar "Divisi Teknologi", hit aria-label Detail, Ingatkan harian tetap). Bonus: `ComplianceHeatmapCard` ponsel → `rowLabels ['Tek','SDM']` + caption membawa nama lengkap; non-ponsel → nama penuh dan caption tanpa daftar nama |

## Perintah uji yang dijalankan beserta hasilnya

- `npx vitest run tests/ui` → **4 berkas, 38 tes, semua lulus** (dijalankan dua kali: sebelum dan sesudah satu perbaikan tanda panggil `AuditView()`; hasil akhir 38 lulus, durasi ~0,35 detik).
- `DATABASE_URL=postgresql://x:y@127.0.0.1:1/db DIRECT_URL=postgresql://x:y@127.0.0.1:1/db npx tsc --noEmit --incremental false` → **tests/ui bersih tanpa galat**; proses keluar kode 2 karena 5 galat di luar zona saya (lihat di bawah).
- `npx vitest run` (penuh, hanya untuk informasi parent) → 76 berkas lulus, 4 gagal: 8 tes gagal seluruhnya di `tests/qa/keyboard/{keyboard-util,sheet-fokus}.test.ts` dan `tests/security/s2-{rate-limit,sesi-token}.test.ts` — berkas agen paralel (T2-B9/T2-S1/T2-S2) yang baru muncul di worktree bersama, bukan milik T2-B5 dan tidak berinteraksi dengan tests/ui.

## Temuan pada kode sumber (tidak diubah)

- `short3('   ')` mengembalikan tiga karakter spasi (potongan nama asli saat tidak ada kata). Di UI tampil kosong jadi tidak terlihat sebagai cacat, tetapi bila di masa depan nama divisi divalidasi, tempat ini patut diperiksa. Tes mematok perilaku kini.
- `short3` satu kata tidak mengubah kapital ("keuangan"→"keu"). Aman selama nama divisi Title Case seperti data sekarang; tes mematok perilaku ini secara eksplisit supaya perubahan apa pun disengaja.
- `useIsPhone`/`useIsTablet` di `mk/layout.tsx` masing-masing membuat MediaQueryList sendiri; tidak ada bug yang ditemukan pada subscribe/cleanup.
- Tidak ada bug pada cabang ponsel `AuditView` maupun kartu tablet `ComplianceCard` yang terendus oleh penulisan tes ini.

## Keterbatasan dan batas pembuktian

- Lingkungan vitest `node` tanpa jsdom/happy-dom (tidak ada di devDependencies; menambahnya dilarang), jadi tidak ada render klien sungguhan: hook diuji lewat mock `useSyncExternalStore` yang meniru kontrak React (dua jalurnya: server snapshot dan klien subscribe+snapshot), bukan lewat React DOM klien. Perilaku layout CSS (`hidden xl:block`, `grid-cols-2`) dipatok sebagai kelas pada elemen, bukan geometri piksel sungguhan.
- `ComplianceCard`/`AuditView` dipanggil sebagai fungsi dengan React dimock — efek samping render anak (Sheet, animasi) tidak dieksekusi; itu di luar jangkauan tes struktural ini dan sudah tercakup pola yang sama pada tests/cx.
- Interaksi klik (membuka Sheet divisi/rincian log) tidak diuji di sini.
- QA perangkat asli (pembaca layar, Safari/iOS) tetap di luar cakupan, seperti dicatat HASIL-TAHAP1 bagian batasan.

## Usulan integrasi untuk parent

- Gabungkan `tests/ui/` apa adanya ke gerbang konsolidasi (`npx vitest run` sudah memuatnya otomatis lewat pola `tests/**/*.test.ts`).
- Galat `tsc` milik agen lain perlu diselesaikan pemiliknya sebelum gerbang penuh: `tests/qa/keyboard/keyboard-util.test.ts` (TS2339 `ariaDisabled`) dan `tests/security/s2-{proxy-csrf,sesi-token}.test.ts` (TS2540 penetapan `NODE_ENV`); begitu pula 8 tes gagal di tests/qa dan tests/security pada suite penuh.
