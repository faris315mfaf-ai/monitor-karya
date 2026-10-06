# Urungkan (pembatalan tindakan yang bisa dibalik)

[← Indeks](README.md)

## Tujuan

Tindakan yang bisa dibalik tidak memakai dialog konfirmasi. Setelah tindakan berhasil, toast sukses menampilkan tombol "Urungkan". Dialog konfirmasi (`useConfirm`) hanya dipakai untuk hapus.

## Tindakan yang bisa diurungkan

| Tindakan | Route asal | Aksi log | Yang dipulihkan |
| --- | --- | --- | --- |
| Setujui pengajuan proyek | `POST /api/projects/approve` | `UNDO_APPROVE_PROJECT` | Slot persetujuan yang ditandatangani dikosongkan (atau dikembalikan ke isi sebelumnya); `lifecycle`, `approvedAt`, `approvedByName` proyek |
| Tolak pengajuan proyek | `POST /api/projects/approve` | `UNDO_REJECT_PROJECT` | Sama seperti di atas; proyek kembali `DIUSULKAN` |
| Ajukan ulang proyek | `PATCH /api/projects { resubmit }` | `UNDO_RESUBMIT_PROJECT` | Semua baris persetujuan lama (termasuk catatan penolakan), `lifecycle`, `proposedAt`, `approvedAt`, `approvedByName` |
| Arsipkan proyek | `PATCH /api/projects { lifecycle: 'DIARSIPKAN' }` | `UNDO_ARCHIVE_PROJECT` | Siklus hidup proyek sebelumnya (kolom lain yang diubah bersamaan di formulir tidak ikut dibalik) |
| Tandai eskalasi ditinjau | `POST /api/escalations/actions { review }` | `UNDO_REVIEW_ESCALATION` | `status` |
| Putuskan eskalasi | `POST /api/escalations/actions { decide }` | `UNDO_DECIDE_ESCALATION` | `status`, `decidedById`, `decidedAt`, `decisionText` |
| Tutup eskalasi | `POST /api/escalations/actions { close }` | `UNDO_CLOSE_ESCALATION` | `status` |
| Teruskan laporan harian | `POST /api/inbox { kind: 'daily' }` | `UNDO_FORWARD_DAILY_REPORT` | `forwardedById`, `forwardedAt`, `isLocked`, `lockedAt` |
| Teruskan capaian mingguan | `POST /api/inbox { kind: 'weekly' }` | `UNDO_FORWARD_WEEKLY_REPORT` | `forwardedById`, `forwardedAt` |

## Aturan

- Route tindakan asal menerbitkan satu baris `UndoToken` (migrasi `0025_undo`) dan mengembalikan `undoToken` di respons. Baris itu menyimpan `snapshot` (keadaan persis sebelum tindakan) dan `stamp` (sidik keadaan sesudahnya).
- `POST /api/undo { token }` memulihkan keadaan. Syaratnya:
  - masih dalam jendela 15 menit (`UNDO_MINUTES`);
  - pengguna adalah pelaku tindakan yang sama. Tiket milik akun lain dijawab 404;
  - PT sasaran masih dalam cakupan pengguna;
  - tiket hanya bisa dipakai sekali.
- Urungkan ditolak dengan 409 bila keadaan sekarang tidak sama dengan `stamp`, yaitu bila orang lain sudah mengubahnya. Contohnya: slot berikutnya sudah ditandatangani, proyek sudah disunting, eskalasi sudah bergerak, atau laporan sudah berubah. Pemulihan memakai `updateMany` bersyarat `updatedAt`, jadi dua penulisan yang bersamaan tidak saling menimpa.
- Penolakan tambahan:
  - proyek yang baru aktif tidak dikembalikan ke pengajuan bila sudah punya laporan harian atau task sejak saat itu;
  - penerusan tidak dicabut bila pelapor sudah mengajukan buka kunci atas laporan itu.
- Klaim tiket, pemeriksaan, pemulihan, dan `AuditLog UNDO_*` berjalan dalam satu transaksi. Bila urungkan ditolak, tiket tetap tercatat belum dipakai.
- Bila tiket gagal diterbitkan (misalnya migrasi 0025 belum diterapkan), tindakan asal tetap berhasil dan toast tampil tanpa tombol "Urungkan".

## Antarmuka

Fungsi `toastWithUndo(pesan, undoToken, onUndone)` di `src/lib/undo-client.ts` dipakai oleh:

- `projects-view.tsx`: setujui cepat, setujui/tolak di Sheet, ajukan ulang (kini tanpa dialog konfirmasi), arsipkan dari alur hapus, dan arsipkan lewat formulir;
- `escalations-view.tsx`;
- `inbox-view.tsx`;
- `oversight/management-dashboard.tsx` dan `oversight/project-decisions.ts` (setujui pengajuan dari antrean keputusan).

Toast tampil 10 detik. Server tetap menerima urungkan sampai 15 menit.

## Berkas

`src/lib/undo.ts`, `src/lib/undo-client.ts`, `src/app/api/undo/route.ts`, `prisma/migrations/0025_undo/migration.sql`, `tests/lib/undo.test.ts`, `tests/api/undo.test.ts`.
