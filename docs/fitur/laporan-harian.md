# Laporan harian (laporan kemajuan proyek)

[← Indeks](README.md) · Spesifikasi: [`05-pic-proyek.md`](../design/peran/05-pic-proyek.md)

![Alur laporan harian](img/alur-laporan-harian.svg)

## Tujuan

Setiap hari kerja PIC proyek melaporkan kemajuan proyeknya:

- apa yang dikerjakan (tugas);
- capaian;
- kendala;
- rencana tindak lanjut;
- bukti.

Laporan dikirim **langsung ke Admin PT** (keputusan pemilik produk, 6 Okt 2026). Kepala divisi hanya melihat isinya dan bisa menandainya sudah dibaca. Admin PT meneruskan laporan ke holding; sejak saat itu laporan **dibekukan**. Di tab yang sama PIC juga mengisi **laporan kemajuan mingguan dan bulanan** per proyek.

| Desktop terang | Desktop gelap |
| --- | --- |
| ![Laporan harian PIC](img/layar/pic-laporan-harian-desktop.png) | ![Laporan harian PIC, tema gelap](img/layar/pic-laporan-harian-desktop-gelap.png) |

## Siapa memakai

| Peran | Hak |
| --- | --- |
| PIC proyek | Proyek yang ia pegang (`Project.picUserId`). Juga dari kartu Laporan harian di layar Hari ini (`DailyReportCard`). |
| Kepala divisi | Tidak mengisi. Melihat laporan anggota di Ringkasan dan menandainya sudah dibaca (`POST /api/kadiv/team`, `DailyReportRead`). |
| Admin PT | Semua proyek PT-nya, untuk mengisi atas nama PIC bila perlu |
| TI, Super Admin | Semua proyek |
| Peran lain | Tidak punya tab ini. API menjawab 403 "Peran Anda tidak melakukan input harian". |

## Alur langkah demi langkah

1. **Buka tab Laporan harian.**
   - Bila PIC memegang satu proyek, formulir tampil langsung di kartu.
   - Bila lebih dari satu, tampil daftar baris dan tiap proyek dibuka di Sheet lebar.
   - Pilihan Harian / Mingguan / Bulanan berupa `SegmentedControl`.
2. **Susun tugas hari ini.**
   - Tambah, ubah, atau hapus tugas lewat `TaskDialog` (Sheet). Isinya: judul, deskripsi, tag, jam mulai/selesai, urgensi (Rendah, Sedang, Tinggi, Kritis), status, progres, dan langkah (subtugas).
   - Centang di kartu tugas menandai selesai, dengan toast "Urungkan".
   - Hapus tugas memakai `useConfirm`.
3. **Rollup otomatis.** Bila proyek punya tugas hari itu, status dan progres laporan diturunkan dari tugas (`computeRollup`). Status yang diketik di formulir diabaikan.
4. **Isi capaian.** Kolom Kendala dan Rencana besok **selalu tampil**. Kendala wajib bila status Terkendala atau Menunggu keputusan; Rencana besok wajib bila Terkendala.
5. **Lampirkan bukti** di `EvidencePanel`:
   - seret-lepas berkas, "Unggah bukti", atau tombol terpisah "Lampirkan foto" (foto, PDF, dokumen, maks 20 MB);
   - atau tautan http(s).
   - Berkas disimpan di Supabase Storage (bucket privat `evidence`).
6. **Kirim laporan.**
   - `PUT /api/daily-input` dengan `action: 'submit'`.
   - Server memvalidasi. Bila gagal, jawabannya 422 dengan daftar `errors` yang ditampilkan di formulir.
   - Bila berhasil, `submittedAt` diisi, lencana menjadi "Terkirim HH.MM", dan badge navigasi "Laporan harian" hilang seketika (`refreshNavBadges()`).
   - Laporan bisa dikirim ulang ("Kirim ulang laporan") sampai 17.00, selama belum diteruskan.
7. **Simpan draf**: `action: 'save'`, tanpa validasi kelengkapan.
8. **Hapus laporan** lewat `useConfirm`. Ditolak bila sudah terkunci atau sudah diteruskan.
9. **17.00 WIB**: laporan hari itu terkunci. Admin PT meneruskannya di [Penerimaan](penerimaan.md) (`forwardedAt` dan `isLocked` diisi). PIC melihat "Diteruskan ke holding" di `FlowDiagram`.
10. **Setelah diteruskan, laporan beku.** Simpan, kirim ulang, dan hapus dijawab 409 "Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya." Layar menampilkan kotak kunci (`LockNotice`) dengan tombol sekunder "Ajukan buka kunci".
11. **Ajukan buka kunci** (`UnlockRequestSheet`): PIC menulis alasan (minimal 10 karakter), lalu `POST /api/unlock-requests` dengan `targetType: 'DAILY_REPORT'`. PIC hanya bisa mengajukan untuk laporan proyeknya sendiri. Direksi SDM & GA (atau TI/Super Admin) menyetujui, TI atau Super Admin menjalankan. Selama buka kunci berlaku, laporan, tugas HARIAN, dan buktinya bisa diubah; `forwardedAt` tetap terisi dan perubahan tercatat di AuditLog dengan `unlockRequestId` dan `afterForward: true`.

```mermaid
stateDiagram-v2
    [*] --> Draf: Simpan draf
    Draf --> Terkirim: Kirim laporan (valid)
    Terkirim --> Terkirim: Kirim ulang (sebelum 17.00)
    Terkirim --> Diteruskan: Admin PT teruskan (forwardedAt + isLocked)
    Diteruskan --> Terkirim: Urungkan penerusan (≤ 15 menit, Admin PT yang sama)
    Draf --> Terkunci: 17.00 WIB
    Terkirim --> Terkunci: 17.00 WIB
    Terkunci --> Dibuka: buka kunci disetujui & dijalankan
    Diteruskan --> Dibuka: buka kunci disetujui & dijalankan (tetap diteruskan)
    Dibuka --> Terkunci: unlockUntil lewat / kunci lagi
    Diteruskan --> [*]
```

## Aturan bisnis

**Tenggat.** Laporan hari D terkunci pada D pukul 17.00 WIB (`isDailyLocked`). Setelah itu:

| Endpoint | Jawaban |
| --- | --- |
| `PUT /api/daily-input` | 409 `{ locked: true }` |
| `DELETE /api/daily-input` | 409 |
| Tugas hari itu di `/api/tasks` | ditolak |

**Beku setelah diteruskan** (`dailyGate`, `frozenMessage`, `FORWARDED_FROZEN_MESSAGE` di [`daily-rollup.ts`](../../src/lib/daily-rollup.ts)). Satu pembantu menjaga semua jalur tulis. Laporan dengan `forwardedAt` atau `isLocked` ditolak kecuali `activeUnlockFor('DAILY_REPORT', id)` menemukan buka kunci yang berlaku:

| Endpoint | Jawaban |
| --- | --- |
| `PUT/DELETE /api/daily-input` | 409 `{ error, frozen: true, reportId }` |
| `POST/PUT/DELETE/PATCH /api/tasks` (tugas HARIAN) | 409 yang sama; papan mingguan ditolak bila hari asal atau tujuan beku |
| Bukti laporan dan tugas HARIAN (`evidence-access.ts`) | ditolak |
| `rollupDailyReport` | tidak menghitung ulang laporan yang diteruskan |

Laporan yang sudah diteruskan **tidak pernah bisa dihapus**, juga saat dibuka. Laporan yang pertama kali dikirim setelah 17.00 lewat buka kunci ditandai `isLate`. Buka kunci selalu menunjuk satu laporan yang ada, jadi hari lampau tanpa laporan tidak bisa dibuka atau diisi; layar menjelaskannya. Buka kunci harian tidak mengubah kunci mingguan.

**Hari kerja.** Senin–Jumat WIB. Badge navigasi tidak muncul di hari libur maupun setelah tenggat.

**Validasi** (`validateDailyReport` di [`lock.ts`](../../src/lib/lock.ts)):

| Kolom | Wajib bila |
| --- | --- |
| Status | selalu: `SELESAI`, `ON_PROGRESS`, `TERKENDALA`, `MENUNGGU_KEPUTUSAN`, atau `TIDAK_ADA_PERUBAHAN` |
| Capaian hari ini | selalu |
| Bukti minimal 1 | semua status kecuali `TIDAK_ADA_PERUBAHAN` |
| Kendala | `TERKENDALA` atau `MENUNGGU_KEPUTUSAN` (kolom selalu tampil) |
| Rencana besok (`followUp`) | `TERKENDALA` (kolom selalu tampil) |

**Bukti dihitung dari tabel `Evidence`**, bukan dari kolom `evidenceCount`. `syncEvidenceCount` menyelaraskan kolom itu.

**Satu laporan per proyek per hari**: kunci unik `(projectId, reportDate)`. `reportDate` = tengah malam WIB.

**Hapus** ditolak bila laporan sudah diteruskan (409 "Laporan yang sudah diteruskan tidak dapat dihapus").

**Laporan kemajuan:**

- Mingguan (`periodKey` "2026-W41") terkunci bersama kunci Jumat 17.00.
- Bulanan ("2026-10") terkunci tanggal 3 bulan berikutnya pukul 17.00 WIB.
- Satu laporan per proyek per kadens per periode.

**Tugas:**

- Konteks harian mengikuti kunci 17.00 hari tugas itu.
- Konteks papan mingguan (`context=week`) mengikuti kunci Jumat, sehingga capaian Senin masih bisa dirapikan hari Rabu.
- `PUT /api/tasks` tanpa `picUserId` mempertahankan nilai lama. Mengirim `null` mengosongkannya.
- Batas panjang: judul 200, deskripsi 4000, tag 40.

**Eskalasi dari tugas.** Tugas Terkendala atau Menunggu keputusan bisa diajukan sebagai eskalasi (`POST /api/escalations/actions`, `action: 'raise'`, `sourceType: 'TASK'`). `Task.escalationId` mencegah eskalasi ganda. Lihat [eskalasi.md](eskalasi.md).

## Endpoint

| Metode & path | Parameter | Jawaban | Izin |
| --- | --- | --- | --- |
| `GET /api/daily-input` | `?projectId=` opsional | Proyek tanggung jawab akun beserta laporan hari ini (`status`, `progressPct`, `submittedAt`, `forwardedAt`, `isLocked`, …) dan hitung mundur | `daily:input` |
| `PUT /api/daily-input` | `{ projectId, reportDate? ("YYYY-MM-DD"), action: 'save'\|'submit', status, progressPct, achievementToday, obstacle?, followUp?, decisionRequestedFrom? }` | laporan tersimpan; 422 `{ error, errors, evidenceCount }`; 409 terkunci atau `frozen` | `daily:input` + pemilik proyek; tanggal lampau hanya bila buka kunci berlaku |
| `DELETE /api/daily-input` | `?projectId=` | hapus laporan hari ini | sama; tidak bila terkunci/diteruskan |
| `POST /api/unlock-requests` | `{ targetType: 'DAILY_REPORT', targetId, reason }` | pengajuan buka kunci | `unlock:request`; PIC hanya laporan proyeknya (404 selain itu) |
| `GET /api/tasks` | `?projectId=&date=YYYY-MM-DD` atau `?projectId=&week=2026-W41` | tugas sehari atau seminggu | pemilik proyek |
| `POST /api/tasks` | tugas + `subtasks[]` | tugas baru | `daily:input` + pemilik proyek |
| `PUT /api/tasks` | `{ id, … }` (daftar subtugas diganti) | tugas terbarui + rollup | sama |
| `PATCH /api/tasks` | `{ projectId, week, moves: [{ id, lane, sortOrder }] }`; `lane` = tanggal hari (YYYY-MM-DD) atau lajur mingguan | urutan papan mingguan | sama |
| `DELETE /api/tasks` | `?id=` | hapus tugas | sama |
| `GET /api/progress-reports` | `?projectId=&cadence=MINGGUAN\|BULANAN` | periode terakhir beserta laporannya | pemilik proyek |
| `PUT /api/progress-reports` | `{ projectId, cadence, periodKey?, action, status, progressPct, summary, obstacle?, followUp? }` | simpan/kirim satu periode | `daily:input` + pemilik; periode terkunci → 409 |
| `DELETE /api/progress-reports` | `?id=` | hapus yang belum terkunci | sama |
| `GET /api/evidence` | `?targetType=&targetId=` | daftar bukti | `canReadEvidence` |
| `POST /api/evidence` | `{ targetType, targetId, fileName, url }` | tambah tautan (http/https, ≤ 2000 karakter, tanpa kredensial) | `canWriteEvidence` |
| `POST /api/evidence/upload` | multipart `file, targetType, targetId, label?` | unggah ke Storage | sama; > 20 MB → 413, isi tidak cocok MIME → 415, Storage belum disiapkan → 503 |
| `GET /api/evidence/[id]` | — | URL bertanda tangan 5 menit (berkas) atau tautan | `canReadEvidence` |
| `DELETE /api/evidence/[id]` | — | hapus baris dan objek Storage | `canWriteEvidence` |
| `GET /api/daily-reports` | `?entityId&status&dateFrom&dateTo&search&page&pageSize` | daftar laporan berhalaman (pengawas) | cakupan entitas |
| `GET /api/project-progress` | `?projectId=` | jam kirim hari ini, rencana vs aktual per minggu, tenggat terdekat, riwayat 6 hari | `guardProjectAccess`; lihat [peran-pic.md](peran-pic.md) |

Jenis berkas bukti yang diterima: JPG, PNG, WEBP, HEIC, GIF, PDF, DOC/DOCX, XLS/XLSX, TXT, CSV. Ekstensi harus cocok dengan MIME, dan byte awal berkas harus cocok dengan jenisnya.

## Berkas kode utama

| Lapisan | Berkas |
| --- | --- |
| Layar | [`views/daily-input-view.tsx`](../../src/components/views/daily-input-view.tsx), [`task-section.tsx`](../../src/components/task-section.tsx), [`task-dialog.tsx`](../../src/components/task-dialog.tsx), [`progress-report-panel.tsx`](../../src/components/progress-report-panel.tsx), [`evidence-panel.tsx`](../../src/components/evidence-panel.tsx), CSS [`app/css/laporan.css`](../../src/app/css/laporan.css) |
| API | [`api/daily-input`](../../src/app/api/daily-input/route.ts), [`api/tasks`](../../src/app/api/tasks/route.ts), [`api/progress-reports`](../../src/app/api/progress-reports/route.ts), [`api/evidence`](../../src/app/api/evidence/route.ts), [`api/evidence/upload`](../../src/app/api/evidence/upload/route.ts) |
| Aturan | [`lib/lock.ts`](../../src/lib/lock.ts), [`lib/daily-rollup.ts`](../../src/lib/daily-rollup.ts) (`dailyGate`), [`lib/unlock-requests.ts`](../../src/lib/unlock-requests.ts) (`activeUnlockFor`), [`lib/evidence-access.ts`](../../src/lib/evidence-access.ts), [`lib/storage.ts`](../../src/lib/storage.ts) |
| Tes | [`tests/api/daily-input.test.ts`](../../tests/api/daily-input.test.ts), [`tests/lib/evidence-access.test.ts`](../../tests/lib/evidence-access.test.ts), [`tests/lib/lock.test.ts`](../../tests/lib/lock.test.ts) |

## Catatan terbuka

Butir di bawah sudah diputuskan dan dikerjakan (diperiksa ulang saat integrasi akhir, 6 Okt 2026):

- **Tujuan pengiriman (diputuskan).** Laporan harian dikirim langsung ke Admin PT; kepala divisi hanya melihat. Tombol berbunyi "Kirim laporan".
- **Kolom Kendala dan Rencana besok** selalu tampil; wajib hanya bila Terkendala/Menunggu keputusan (Rencana besok: bila Terkendala).
- **Laporan setelah diteruskan dibekukan.** Ubah/kirim ulang/hapus dijawab 409 "Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya." (`dailyGate` di `daily-rollup.ts`).
- **Buka kunci hari lalu** berlaku di `/api/daily-input`, `/api/tasks`, dan sejak integrasi akhir juga di unggah/hapus bukti (`evidence-access.ts` memanggil `activeUnlockFor`).
- **Pratinjau.** `/pratinjau` sudah punya data contoh untuk `/api/daily-input` (F3-A untuk peran selain PIC, `mock-pic.ts` untuk PIC).

Masih terbuka:

- Papan tugas mingguan (`weekly-task-board.tsx`) belum memakai `frozenDays` dari `GET /api/tasks?week=`; API sudah menolak hari yang beku, tetapi kolomnya belum ditandai lebih dulu.
- Belum dicoba dengan basis data sungguhan.
