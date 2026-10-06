# Peran kepala divisi — fungsi dan status implementasi

Spesifikasi layar: [`docs/design/peran/03-kepala-divisi.md`](../design/peran/03-kepala-divisi.md). Dokumen ini mencatat apa yang sudah dibangun untuk setiap butir spesifikasi, rumus yang dipakai, endpoint, dan bentuk data yang dibaca peran lain. Pembaruan terakhir: 6 Oktober 2026, fase F2 (wilayah skema `[F2-KADIV]`, migrasi `0021_kadiv_more`).

## Alur yang berlaku

- **Laporan harian** dikirim PIC langsung ke Admin PT. Kepala divisi hanya melihat isinya, bisa mengingatkan anggota yang belum mengirim, dan menandai laporan sudah dibaca. Tanda baca tidak mengubah alur laporan.
- **Capaian mingguan** diserahkan paling lambat **Kamis 17.00 WIB**, lalu disetujui kepala divisi (hanya dari status `MENUNGGU_PERSETUJUAN`). Admin PT meneruskannya ke holding. Minggu dikunci **Jumat 17.00 WIB**.
- **Ringkasan untuk Direktur** (baru) disusun dari angka minggu itu, berisi 3 poin yang bisa disunting. Ringkasan dikirim lewat "Kirim ke Direktur". Direktur membacanya di Ringkasan bersama laporan mingguan divisi; capaian mingguan tetap lewat Admin PT.

## Status per butir spesifikasi

| # | Butir | Status | Catatan |
| --- | --- | --- | --- |
| 1 | Sidebar dan nav khusus (Review output `n`, Laporan harian `4/5`, Proyek, Tim, Laporan mingguan) | Berbeda dari spesifikasi | `ROLE_TABS` tetap Ringkasan · Meja kerja · Capaian mingguan · Divisi. Review, tim, proyek, dan ringkasan mingguan tampil sebagai kartu di Ringkasan. `src/lib/rbac.ts` bukan milik area ini. |
| 2 | Header: konteks divisi dan jumlah orang, tombol "Laporan mingguan M41" | Selesai | Tombolnya sekunder (tombol primer ada di hero) dan menggulir ke kartu ringkasan. Tanpa data tim, tombol kembali menjadi "Isi capaian M41". |
| 3 | Hero: kalimat jawaban, pendukung, `ActivityRings`, 4 KPI | Selesai | Pendukung kini menyebut proyek yang terlambat atau perlu perhatian. KPI ke-4 adalah **Tepat waktu 30 hari** (lihat rumus). "Sisa waktu serah" pindah ke subjudul kartu ringkasan. |
| 4 | Output menunggu review: chip per proyek, Terima / Minta revisi, Terima semua, jenis bukti | Sebagian | "Terima semua" sekarang tombol primer. Tombol "Terima" per baris masih primer karena `ApprovalItem` (`src/components/mk/data.tsx`, berkas bersama) belum punya opsi varian; perlu prop `approveVariant`. Jenis bukti ditulis sebagai jumlah berkas ("2 berkas"), belum per jenis ("Laporan uji", "Tautan desain"). |
| 5 | Laporan harian tim: lencana, sheet anggota, Ingatkan yang belum mengirim | Selesai | Orang cuti, sakit, atau izin tidak masuk penyebut, dan alasannya ditulis di `sub` cincin. |
| 6 | Proyek divisi: `Timeline` dan legenda status | Selesai (baru) | `DivisionProjectsCard` (`src/components/kadiv/projects-card.tsx`). Di ponsel tampil sebagai `ProjectRow compact`. Baris membuka Sheet proyek. |
| 7 | Beban kerja (`DivisionBar`, batas sehat 80), `Heatmap` 10 hari, `AreaChart` output per minggu vs target | Selesai | Batang dibatasi 100% secara visual; angka sebenarnya ditulis di meta. `AreaChart` ada di bawah peta panas. |
| 8 | Laporan mingguan untuk Direktur: draf otomatis, `FlowDiagram`, 3 angka, 3 poin, Edit draf, Kirim ke Direktur, peringatan review | Selesai (baru) | `WeeklySummaryCard`. Lihat bagian "Ringkasan mingguan untuk Direktur". |
| 9 | Aktivitas tim | Selesai | Diambil dari AuditLog 14 hari, hanya aksi kerja. |
| S1 | Sheet anggota: lencana, beban kerja, dikerjakan hari ini, kendala, rencana besok, Kirim catatan, Tandai sudah dibaca / Ingatkan nama | Selesai | "Dikerjakan hari ini" = isi capaian laporan harian ditambah task hari ini. Kendala dan Rencana besok selalu tampil. Tombol primer: "Ingatkan Rina" bila laporan belum masuk, atau "Tandai sudah dibaca" bila sudah masuk dan belum dibaca. Tanda baca bisa diurungkan lewat toast. |
| S2 | Sheet proyek: ring, status, output, tenggat, tahapan | Selesai (baru) | `KadivProjectSheet`: progres laporan terakhir, status dan alasannya, rekap output (diterima, menunggu review, perlu revisi, dikerjakan), tenggat proyek dan tenggat output terdekat, tahapan dari `ProjectStage` (atau fase proyek bila tahapan belum disusun). |
| T | Tablet: tab Ringkasan · Review · Tim · Proyek | Belum | Layar tablet memakai dasbor yang sama dengan susunan responsif (`mk-row`). Tab terpisah tidak dibuat. |
| P | Ponsel: alur vertikal, tombol kirim lebar penuh, `ProjectRow compact`, peta panas sel 26 berlabel inisial | Sebagian | Alur vertikal, tombol lebar penuh, `ProjectRow compact`, dan peta panas di ponsel sudah ada. Tab terpisah dan detail anggota sebagai layar didorong mengikuti perilaku `Sheet` di ponsel. |
| A1 | Tenggat mingguan Kamis 17.00 / kunci Jumat 17.00 | Selesai (F1-B) | Teks kartu ringkasan mengikuti `weeklyDeadlines` (env `WEEKLY_HANDOVER_DAY`, `WEEKLY_LOCK_DAY`, `WEEKLY_CUTOFF_HOUR`). |
| A2 | Setujui hanya dari Menunggu persetujuan | Selesai (F1-B) | |
| A3 | Beku setelah diteruskan | Selesai (F1-B) | Ringkasan juga tidak bisa diubah setelah capaian diteruskan ke holding. |
| A4 | Output diterima menggerakkan hero, cincin, KPI, dan alur laporan mingguan | Selesai | Antrean review dimuat ulang setelah setiap keputusan; kartu ringkasan memuat ulang saat jumlah antrean berubah. |
| A5 | Kirim sebelum tenggat dengan review tersisa butuh konfirmasi | Selesai | Server menolak dengan 409 `PENDING_REVIEW` kecuali `confirmPending: true`; kartu menampilkan peringatan dan tombol berubah menjadi "Kirim tetap ke Direktur". Setelah tenggat serah lewat, konfirmasi tidak diminta lagi. |
| A6 | Orang cuti tidak dihitung di penyebut | Selesai | Berlaku di cincin laporan harian, KPI tepat waktu, dan langkah "Kumpulkan". |

## Rumus

### Tepat waktu 30 hari (KPI ke-4)

`src/lib/kadiv-math.ts` → `onTimeDaily`, dipanggil dari `buildTeam` (`src/lib/kadiv.ts`).

```
tepat waktu 30 hari = laporan harian tepat waktu ÷ laporan harian wajib
```

- **Hari** = hari kerja (Senin–Jumat WIB) dalam 30 hari kalender terakhir yang tenggat 17.00-nya sudah lewat. Hari ini ikut dihitung setelah pukul 17.00.
- **Wajib** = setiap pasangan (proyek AKTIF divisi, hari), dihitung sejak tanggal mulai proyek (atau tanggal dibuat bila tanggal mulai kosong), selama PIC-nya tidak cuti, sakit, atau izin hari itu. Proyek tanpa PIC tidak dihitung.
- **Tepat waktu** = laporan hari itu ada, `submittedAt` ≤ 17.00 hari itu, dan tidak bertanda `isLate`.
- Target **85%**: tile berwarna `on` bila ≥ 85%, `risk` bila di bawahnya, dan netral ("-") bila belum ada laporan wajib.
- Keterbatasan: daftar proyek diambil dari proyek AKTIF hari ini, jadi proyek yang sudah ditutup dalam 30 hari terakhir tidak ikut dihitung.

### Ringkasan mingguan untuk Direktur

`src/lib/kadiv.ts` → `buildWeeklySummary`, poin bawaan dari `src/lib/kadiv-math.ts` → `draftPoints`.

| Angka | Rumus |
| --- | --- |
| Output diterima | Output proyek divisi berstatus `DITERIMA` dengan `reviewedAt` di minggu itu |
| Target output | diterima + menunggu review + output terbuka (`DIKERJAKAN`/`PERLU_REVISI`) bertenggat sebelum akhir minggu (rumus yang sama dengan cincin Output) |
| Proyek sesuai jadwal x/y | Proyek AKTIF divisi berstatus `on` atau `done` menurut `deriveProjectStatus` (`src/lib/project-status.ts`), memakai laporan harian terakhir sampai akhir minggu |
| Kendala terbuka | Proyek yang laporan terakhirnya `TERKENDALA` atau `MENUNGGU_KEPUTUSAN`, ditambah butir capaian mingguan berstatus `TERKENDALA` |
| Review tersisa | Output divisi berstatus `MENUNGGU_REVIEW` |
| Kumpulkan (alur) | Laporan harian terkirim ÷ wajib untuk hari kerja minggu itu yang sudah berjalan, tanpa hari cuti |

Poin bawaan: (1) jumlah output diterima dan judulnya, (2) proyek sesuai jadwal dan proyek yang terlambat atau perlu perhatian beserta alasannya, (3) kendala terbuka pertama, atau "Tidak ada kendala terbuka". Setiap poin paling banyak 280 huruf; kepala divisi boleh menyunting 1–3 poin.

Aturan tulis (`summaryBlock`):

1. Hanya minggu berjalan yang bisa disunting atau dikirim.
2. Bila capaian minggu itu sudah diteruskan ke holding, ringkasan dibekukan.
3. Sejak kunci Jumat 17.00, ringkasan tidak bisa diubah.
4. Kirim sebelum tenggat serah (Kamis 17.00) dengan output yang masih menunggu review butuh konfirmasi.

Setelah dikirim, ringkasan bisa ditarik kembali ke draf ("Tarik untuk disunting", atau "Urungkan" di toast) selama aturan 1–3 masih membolehkan. Saat ringkasan dikirim, angkanya dihitung ulang di server dan disimpan sebagai potret.

## Endpoint

| Endpoint | Fungsi |
| --- | --- |
| `GET /api/kadiv/team?divisionId=` | `KadivTeam`. Baru: `onTime30`, `projects[]` berbentuk `KadivProject` (status, progres, output, tahapan, laporan terakhir), `members[].report.readAt`, `members[].today.achievements` |
| `POST /api/kadiv/team` `{ action: 'remind', userId?, divisionId? }` | Ingatkan anggota yang belum mengirim laporan harian (sudah ada) |
| `POST /api/kadiv/team` `{ action: 'read' \| 'unread', userId, divisionId? }` | Tandai laporan harian hari ini milik satu anggota sudah dibaca, atau batalkan tandanya. Audit: `KADIV_READ_DAILY` / `KADIV_UNREAD_DAILY` |
| `GET /api/kadiv/weekly-summary?divisionId=&week=2026-W41` | `WeeklySummaryView` (draf otomatis, baris tersimpan, status capaian mingguan, direktur penerima, alasan terkunci) |
| `PUT /api/kadiv/weekly-summary` `{ divisionId, points }` | Simpan draf. Audit `KADIV_SAVE_WEEKLY_SUMMARY` |
| `POST /api/kadiv/weekly-summary` `{ divisionId, action: 'send', points?, confirmPending? }` | Kirim ke Direktur. Mengirim notifikasi lonceng (templat `RINGKASAN_MINGGUAN_DIVISI`) ke direktur PT (atau induk terdekatnya). Audit `KADIV_SEND_WEEKLY_SUMMARY` |
| `POST /api/kadiv/weekly-summary` `{ divisionId, action: 'unsend' }` | Tarik kembali ke draf. Audit `KADIV_UNSEND_WEEKLY_SUMMARY` |

Semua endpoint memakai `requireApiUser`. Cakupannya hanya divisi yang dipimpin akun itu (`pickLedDivision`): divisi lain mendapat 403, dan anggota di luar tim mendapat 404. Selama migrasi 0021 belum dijalankan, endpoint tulis membalas 503 dengan pesan jelas, sedangkan endpoint baca mengembalikan data kosong untuk tabel baru.

## Bentuk data untuk Direktur (dibaca lewat `/api/ringkasan`)

Tabel `WeeklyDivisionSummary` (satu baris per divisi per minggu ISO, unik `divisionId + isoYear + isoWeek`):

```ts
{
  divisionId: string
  isoYear: number
  isoWeek: number
  weeklyReportId: string | null   // WeeklyDivisionReport minggu itu, bila sudah ada
  status: 'DRAF' | 'TERKIRIM'
  points: string[]                // 1–3 poin, masing-masing ≤ 280 huruf
  outputsAccepted: number
  outputsTarget: number
  projectsOnTrack: number
  projectsTotal: number
  openObstacles: number
  pendingReview: number           // review tersisa saat dikirim (> 0 = dikirim dengan konfirmasi)
  sentAt: Date | null
  sentById: string | null
}
```

Untuk area Direktur ([F2-DIREKTUR]), gunakan pembantu di `src/lib/kadiv.ts`:

```ts
import { readDivisionSummaries } from '@/lib/kadiv'
// divisionIds = divisi yang memang boleh dilihat pembaca (cakupan dijaga pemanggil)
const summaries = await readDivisionSummaries(divisionIds, reportWk.isoYear, reportWk.isoWeek)
// Map<divisionId, { points, outputsAccepted, outputsTarget, projectsOnTrack, projectsTotal,
//                   openObstacles, pendingReview, sentAt, sentById }>
```

Hanya ringkasan berstatus `TERKIRIM` yang dikembalikan; draf tidak ikut. Bila migrasi 0021 belum dijalankan, hasilnya peta kosong. Saran tampilan: bila ringkasan ada, pakai `points` sebagai "Poin utama" di `DivisionSummary.weekly.points` (menggantikan poin otomatis dari butir capaian), dan tampilkan "Ringkasan dari {kepala divisi} · {sentAt}". Pemanggilan dari `/api/ringkasan` belum dipasang karena berkas itu milik area Direktur.

## Model data baru (migrasi `0021_kadiv_more`)

- `WeeklyDivisionSummary`: lihat di atas.
- `DailyReportRead (dailyReportId, userId, readAt)`: unik per laporan per akun. Tanda baca kepala divisi atas laporan harian anggota.

Keduanya tanpa relasi Prisma dan tanpa foreign key (pola `WeeklyReportRead` di 0017), sehingga model milik area lain tidak berubah. RLS aktif.

## Berkas

- Server: `src/lib/kadiv.ts` (`buildTeam`, `markMemberRead`, `buildWeeklySummary`, `entityDirectors`, `readDivisionSummaries`), `src/lib/kadiv-math.ts` (rumus murni, dites di `tests/lib/kadiv-math.test.ts`), `src/app/api/kadiv/team/route.ts`, `src/app/api/kadiv/weekly-summary/route.ts`.
- UI: `src/components/kadiv/weekly-summary-card.tsx`, `src/components/kadiv/projects-card.tsx`, `src/components/kadiv/member-sheet.tsx`, `src/components/kadiv/review-card.tsx`, dan `KadivDashboard` di `src/components/views/role-dashboards.tsx`.
- Pratinjau: `src/components/preview/mock-kadiv.ts`, yang menangani `/api/kadiv/weekly-summary` dan aksi `read`/`unread`.
