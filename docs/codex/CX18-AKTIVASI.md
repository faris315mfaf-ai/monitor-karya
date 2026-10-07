# CX18 — Aktivasi akun sekali pakai

Pembaruan integrasi parent: build Next/runner Docker final dan gerbang aplikasi lulus; hasil, bukti HTTP/PostgreSQL, serta batas produksi tercatat pada [CX16–20](CX16-20-HASIL.md). Catatan tahapan di bawah mempertahankan konteks verifikasi agen.

Status 7 Oktober 2026: implementasi dan tes terfokus selesai, tanpa commit. Parent telah mengintegrasikan schema dan migrasi 0028; gerbang build dan PostgreSQL nyata oleh parent.

## Alur yang tersedia

Persetujuan `AKUN_BARU` membuat akun dan aktivasi dalam transaksi yang sama. Respons persetujuan mengembalikan tautan sekali untuk pengelola yang memutuskan. Kartu permintaan akses membukanya dalam Sheet. Pengelola dapat menerbitkan ulang melalui tombol Kelola aktivasi atau bagian Aktivasi akun di sheet akun. Tidak mengirim email.

`POST /api/companies/users/activation` menerima `{ userId }`. `GET` dengan `?id=` hanya memeriksa kelayakan, tidak pernah mengembalikan token. Kewenangan mengikuti `decisionDesk`: Admin PT terbatas perusahaan/peran yang dikelolanya, TI tidak dapat mengaktifkan SUPERADMIN, Super Admin seluruh peran. Akun sendiri, akun tanpa persetujuan AKUN_BARU, nonaktif, sudah masuk, sudah menetapkan kata sandi, atau kredensial berubah ditolak.

Tautan relatif `/login/aktivasi#token=...`; klien menyusun origin dari lokasi browser. Token hanya di memori komponen, dibuang saat Sheet ditutup. Token fragmen tidak dikirim pada URL HTTP/referrer; halaman aktivasi segera menghapus fragmen dari riwayat alamat. `POST /api/auth/activate` menerima token dan kata sandi lewat badan JSON. Sukses mengubah `passwordHash` dan `mustChangePassword=false`, menampilkan username serta tautan masuk. Tidak memasang cookie/sesi otomatis.

## Keamanan dan kontrak schema

Token acak 32 byte, masa berlaku 24 jam. Yang disimpan hanya SHA256 token dan SHA256 passwordHash saat diterbitkan. Audit hanya ID akun, pelaku, waktu kedaluwarsa, dan IP; tidak ada token, tautan, kata sandi, atau hash kredensial dalam audit/notifikasi. Jalur galat aktivasi tidak mencetak objek galat mentah. Semua respons token no-store.

Satu baris per user. Reissue mengganti hash sebelumnya; reissue setelah consume atau perubahan password ditolak. Reset admin tetap membatalkan tautan meskipun mustChangePassword tetap true, karena sidik passwordHash berubah. Penggantian password sendiri juga membatalkan tautan. Tidak memerlukan hook tambahan di route password milik parent.

Issue/consume mengunci baris User sebelum membaca ulang data akun dan aktivasi. Consume memeriksa ulang hash token, expiry, status akun, dan sidik kredensial setelah kunci diperoleh; klaim token dan pembaruan kredensial kondisional berada dalam satu transaksi. Kegagalan salah satu membatalkan seluruh perubahan. Pemakaian kedua ditolak. Hash password baru dihitung sebelum transaksi agar kunci singkat.

```prisma
model AccountActivation {
  userId           String   @id
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash        String   @unique
  credentialDigest String
  expiresAt        DateTime
  consumedAt       DateTime?
  createdAt        DateTime @default(now())

  @@index([expiresAt])
}
```

Relasi balik User: `accountActivation AccountActivation?`. Schema, migrasi 0028, RLS, dan generate client diintegrasikan parent; agen aktivasi tidak mengedit schema atau migrasi.

Pembatas 15 menit: penerbitan 20 per pengelola dan 5 per akun untuk endpoint reissue; konsumsi 20 per IP, 10 per sidik token, 300 global per proses. Permintaan malformed ikut batas IP/global. Mengikuti utilitas existing in-memory: hitungan tidak lintas proses/restart, sehingga bukan kuota terdistribusi.

## Berkas

- `src/lib/account-activation.ts`
- `src/app/api/auth/activate/route.ts`
- `src/app/api/companies/users/activation/route.ts`
- `src/app/api/access-requests/route.ts`
- `src/app/login/aktivasi/{page,activation-form}.tsx`
- `src/components/companies/activation-handoff.tsx`
- `src/components/companies/account-sheet.tsx`
- `src/components/admin/access-requests-card.tsx`
- `tests/cx/activation.test.ts`
- `tests/cx/cx8-regressions.test.ts`: hanya tambahan mock Sheet oleh agen ini; impor sesi tetap perubahan parent.

## Bukti pemeriksaan

- 32 tes aktivasi lulus: cakupan/role/self, persetujuan wajib, hash-only storage/audit, TTL, metadata tanpa token, sukses tanpa cookie, replay, reissue, expired, reset/ganti sandi, akun nonaktif, kebijakan password, rate-limit, kegagalan klaim/rollback, simulasi race konsumsi dan reissue, token berubah ketika menunggu kunci, galat mentah teredaksi.
- Satu dari 32 tes memakai route persetujuan dan konsumsi sungguhan dengan `admin-fake-db` terisolasi: approve AKUN_BARU → handoff → set password → replay ditolak; memeriksa password dan token tidak tersimpan plaintext.
- Gabungan sebelumnya 62 tes / 3 berkas lulus (31 aktivasi saat itu + 29 cx8-regressions + 2 account-sheet-presence); setelah penambahan alur penuh aktivasi menjadi 32.
- ESLint zona implementasi/tes, TypeScript seluruh proyek setelah client baru, serta git diff --check lulus.
- Harness admin ternyata sudah punya delegate model dinamis dan `$queryRaw`; tidak perlu perubahan harness oleh agen ini. Dua tes temporary-access sempat gagal 409 ketika parent sedang memperbaiki expiry; bukan dicatat sebagai hasil akhir gerbang gabungan.

## Checklist desain dan batas bukti

Menggunakan komponen mk, token/kategori warna existing, bahasa Indonesia/Anda, label input, pesan galat, keadaan menunggu/selesai, status warna+ikon+kata, dan maksimal satu tombol primer. Detail admin di Sheet; token hilang saat tutup termasuk AccountSheet yang mempertahankan form untuk animasi keluar. Layar login memiliki metadata noindex/no-referrer.

Pemeriksaan visual 1440/834/390, terang/gelap/aksen, keyboard/zoom belum dibuktikan: percobaan browser localhost:3200 menerima connection refused. Tidak memulai/menghentikan layanan bersama. Race yang diuji di berkas unit bersifat simulasi transaksi, bukan bukti lock PostgreSQL nyata. Build produksi dan pengujian PostgreSQL lokal gabungan diserahkan pada gerbang parent. Tidak ada operasi DB nyata, seed/reset, storage eksternal, push, deploy, atau commit dari agen ini.

## Tindak lanjut P1 — PIC sementara dan hashchange (7 Oktober 2026)

Parent menyerahkan `src/lib/access-requests.ts` untuk perbaikan P1. Hibah baru menyimpan `appliedData.pics`: projectId/entityId, PIC lama beserta nama lama, PIC/nama yang dipasang. Snapshot dibaca setelah kunci baris Project diperoleh, sebelum applyRoleChange, dalam transaksi pemberian yang sama. Kunci User dan larangan hibah bertumpuk tetap ada.

Expiry memulihkan PIC independen dari pemulihan role/head divisi. PIC lama hanya dipasang kembali jika masih ada, aktif, berperan PIC_PROYEK, dan satu PT dengan proyek yang belum pindah dari PT snapshot. Akun lama dikunci sebelum pemeriksaan ini. Bila tidak memenuhi, penugasan sementara dilepas menjadi null, tidak dibiarkan menunjuk penerima hibah. Nama bebas tanpa akun dipulihkan persis dari snapshot. Proyek diubah dengan updateMany bersyarat id + entityId + picUserId + picName yang masih sama dengan penugasan sementara; penugasan/nama manual yang lebih baru dipertahankan. Perubahan PIC ikut audit TEMP_ACCESS_EXPIRED dan rollback transaksi.

**Data historis:** hibah PIC yang belum dipulihkan, tanpa snapshot lengkap, dan masih mempunyai tautan proyek tidak ditebak PIC asalnya. Transaksi pemulihan dibatalkan, revertedAt tetap null, log diagnostik meminta admin merekonsiliasi penugasan, ensureTemporaryAccessCurrent menolak akses sampai tautan diselesaikan admin. Hibah lama yang sudah ditandai revertedAt oleh versi sebelumnya tidak dipindai ulang oleh gerbang ini; perlu audit/rekonsiliasi manual oleh parent/pemilik. Ini bukan klaim semua data historis telah diperbaiki. Penugasan ulang ke ID/nama identik tidak dapat dibedakan dari hibah tanpa riwayat versi penugasan; kondisi pemulihan mengikuti kontrak id+nama yang diminta.

`tests/cx/temporary-pic.test.ts`: sebelum perbaikan 13 dari 17 tes gagal; setelah perbaikan seluruh 17 lulus. Gabungan temporary-pic + access-revert + session-expiry + activation: 66 tes/4 berkas lulus. Bukti mencakup PIC asli kembali, hilangnya akses KADIV pada proyek tanpa divisionId (fallback anggota maupun kepala divisi), penggantian manual dan race kondisional, PIC asal terhapus/nonaktif/beda peran/beda PT, proyek pindah PT/terhapus, histori kurang lengkap fail-closed, dan rollback audit. Mock access-revert tidak perlu diubah.

Temuan browser parent juga diperbaiki pada activation-form: listener hashchange membaca token ketika alamat fragment berubah tanpa navigasi halaman, segera membersihkan fragment, mengosongkan password/konfirmasi/galat/sukses lama; listener dibersihkan saat unmount. Setup efek kedua dengan hash kosong tetap mempertahankan token dalam ref (Strict Mode). Nomor percobaan mengabaikan respons request lama setelah tautan baru masuk. Verifikasi browser akhir oleh parent pada rebuild.

### Penutupan guard kepala divisi

Pemulihan kepala divisi kini memeriksa akun lama masih aktif, berperan KEPALA_DIVISI, dan scopeEntityId sama dengan entityId divisi. Akun dikunci sebelum pemeriksaan. Jika tidak layak/terhapus, tautan kepala sementara dibersihkan ke null. `division.updateMany` mencocokkan id + entityId + headUserId yang diberikan hibah; perubahan manual yang mendahului atau menyela pemulihan tidak ditimpa. Audit hanya mencatat pembaruan yang benar-benar diterapkan. Ini juga berarti kepala divisi penerima PIC sementara yang sudah dipindah permanen menjadi AUDITOR tidak dipasang kembali sebagai kepala divisi.

Mock dan ekspektasi `tests/lib/access-revert.test.ts` disesuaikan, ditambah kasus nonaktif, turun peran, pindah PT, dan kalah race penugasan manual. Ekspektasi temporary-pic untuk kepala yang menjadi AUDITOR kini null. Hasil akhir: **70 tes/4 berkas lulus**, TypeScript seluruh proyek, ESLint zona perbaikan, dan git diff --check lulus. Setelah catatan ini agen berhenti mengubah berkas agar parent dapat build final. Keterbatasan hibah PIC historis yang sudah ditandai revertedAt tetap memerlukan audit operator; tidak dilakukan tebakan/rekonstruksi PIC lama.
