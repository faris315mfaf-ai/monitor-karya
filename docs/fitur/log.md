# Log aktivitas

[← Indeks](README.md)

## Tujuan

Jejak audit: siapa melakukan apa, kapan, terhadap data apa, dan isi sebelum/sesudahnya. Dipakai untuk pemeriksaan, investigasi, dan menjawab "kenapa angka ini berubah".

## Siapa memakai

| Peran | Melihat |
| --- | --- |
| Pemegang `audit:read` di tingkat grup: Direksi SDM & GA, Manajemen, Auditor, TI, Super Admin | seluruh grup |
| Direktur entitas (`audit:read`, tanpa `group:read`) | akun dalam cakupan PT-nya |
| Peran tanpa `audit:read` | hanya jejaknya sendiri (lewat API; tab tidak tampil) |

Pembatasan untuk peran tanpa `audit:read` ditambahkan pada penguatan keamanan 6 Okt 2026. Sebelumnya PIC bisa membaca log seluruh PT, termasuk IP dan perubahan akun orang lain.

## Alur di layar

1. **Header.** `PageHeader` dengan satu kalimat jawaban.
2. **Saringan.**
   - Chip sasaran (`targetType`).
   - Pilihan aksi.
   - Rentang tanggal.
3. **Daftar.**
   - Desktop dan tablet (≥ 768 px) memakai tabel. Ponsel memakai baris daftar.
   - Diff sebelum/sesudah memakai warna token.
   - Label aksi dari `AUDIT_ACTION_LABELS`, ditampilkan oleh `ActionTag`.
4. **Ketuk baris** untuk membuka Sheet berisi diff lengkap, IP, dan user-agent.
5. **Pagination** dengan `IconButton`. Kosong dan kosong-setelah-saring punya tombol "Hapus saringan".

## Aksi yang dicatat (contoh)

| Area | Aksi |
| --- | --- |
| Masuk | `LOGIN`, `LOGIN_FAILED` |
| Laporan | simpan/kirim/hapus laporan harian, penerusan, serahkan/setujui mingguan |
| Proyek | `PROPOSE_PROJECT`, `CREATE_PROJECT`, `CREATE_PROJECT_NO_APPROVAL`, `UPDATE_PROJECT`, `RESUBMIT_PROJECT`, `REJECT_PROJECT`, `DELETE_PROJECT` |
| Eskalasi | `CREATE_ESCALATION`, `REVIEW_ESCALATION`, `DECIDE_ESCALATION`, `CLOSE_ESCALATION` |
| Pengingat | `REMIND_PIC`, `AUTO_REMINDER`, `UPDATE_REMINDER_RULE` (dengan kalimat "<nama> mematikan …" di `afterData.message`) |
| Akses | `REQUEST_ACCESS`, `APPROVE_ACCESS_REQUEST`, `REJECT_ACCESS_REQUEST`, `GRANT_TEMP_ACCESS`, `TEMP_ACCESS_EXPIRED` |
| Buka kunci | `REQUEST_UNLOCK`, `APPROVE_UNLOCK`, `REJECT_UNLOCK`, `RELOCK_REPORT` |
| Akun & perusahaan | tambah/ubah/hapus akun, setel ulang kata sandi, ubah perusahaan |

Kepala divisi melihat sebagian log ini sebagai "Aktivitas tim". Isinya hanya aksi yang aman ditampilkan, tanpa urusan masuk atau kata sandi (daftar di [`src/lib/kadiv.ts`](../../src/lib/kadiv.ts)).

## Endpoint

| Metode & path | Parameter | Jawaban | Izin |
| --- | --- | --- | --- |
| `GET /api/audit-logs` | `?page&pageSize (≤ 200, bawaan 50)&action&targetType&actorId&dateFrom&dateTo` | baris log berhalaman dengan nama & peran aktor | `audit:read` (cakupan); tanpa itu hanya jejak sendiri |

## Berkas kode utama

- [`src/components/views/audit-view.tsx`](../../src/components/views/audit-view.tsx) (ekspor `AUDIT_ACTION_LABELS`, `ActionTag`, juga dipakai `system-view.tsx`)
- [`src/app/api/audit-logs/route.ts`](../../src/app/api/audit-logs/route.ts)

## Catatan terbuka

- Belum semua aksi baru punya label di `AUDIT_ACTION_LABELS`. Aksi tanpa label tampil sebagai kode mentah. Kode yang tertinggal termasuk `REQUEST_ACCESS`, `APPROVE_ACCESS_REQUEST`, `REJECT_ACCESS_REQUEST`, `GRANT_TEMP_ACCESS`, `TEMP_ACCESS_EXPIRED`, `UPDATE_REMINDER_RULE`, `AUTO_REMINDER`, `REQUEST_UNLOCK`, `APPROVE_UNLOCK`, `REJECT_UNLOCK`, dan `RELOCK_REPORT`.
- Belum ada "Unduh log" (ekspor CSV).
- `/pratinjau` belum punya data contoh untuk `/api/audit-logs`.
