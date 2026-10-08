# Data, transaksi, dan batas keamanan

## Skema dan migrasi

Sumber struktur adalah `prisma/schema.prisma`; SQL pada `prisma/migrations`. Ada **25 folder migrasi**, nomor terakhir **0028_account_activation**. Nomor tidak berurutan penuh. 0026 menambah indeks FK review/keputusan, 0027 AuthSession, 0028 AccountActivation. CX20 memakai AuditLog sehingga tidak membuat 0029.

Migrasi lama 0006 mengharapkan `storage.buckets`. Compose lokal menyediakan metadata tiruan melalui initializer; itu bukan layanan unggah Storage. Jangan menghapus SQL lama untuk meloloskan database kosong.

`prisma.config.ts` tidak memuat `.env` implisit untuk CLI: pemanggil harus menyediakan DATABASE_URL dan DIRECT_URL. Next dev memiliki mekanisme env sendiri; dua hal ini jangan disamakan.

Seluruh migrasi lolos pada DB terisolasi. DB persisten lokal menerima 0026–0028 setelah backup tanpa reset/seed. Status produksi belum diperiksa. Drift 0001–0012 (indeks manual dan `Project.approvalChain` NOT NULL) masih terbuka. Tinjau SQL yang diusulkan tool sebelum menjalankan migrasi baru; jangan otomatis menghapus indeks lama.

## Sesi dan autentikasi

`auth.ts`: cookie HMAC dengan `sid` acak, sidik kata sandi `pv`, masa 8 jam. `AuthSession` menyimpan ID, pengguna, waktu/kedaluwarsa/pencabutan, bukan token mentah. Auth memeriksa sesi tersimpan, akun aktif, sidik sandi, serta kedaluwarsa akses sementara. Token lama tanpa sid/pv ditolak: pengguna perlu login ulang setelah pembaruan.

Logout mencabut sesi yang bersangkutan; sesi perangkat lain tetap sah. Kegagalan audit tidak boleh mencegah pencabutan. Kegagalan DB pencabutan dilaporkan 503 walau cookie dibersihkan. Perubahan kata sandi, audit, dan sesi pengganti satu transaksi; kegagalan insert sesi menggulung balik perubahan sandi. Jangan mengembalikan cookie baru sebelum transaksi berhasil.

## Akses sementara

`ensureTemporaryAccessCurrent` dijalankan pada autentikasi/login, tidak menunggu cron. Pengembalian mengunci baris User, mengklaim request secara kondisional, memulihkan hak/penugasan, dan menulis audit secara atomik. Hibah bertumpuk dibatasi.

Snapshot PIC lama/entitas/kepala divisi dijaga; perubahan manual terbaru tidak ditimpa sembarangan. Pemulihan hanya untuk akun asal yang masih sah sesuai peran/entitas. Hibah lama tanpa snapshot tidak boleh direkonstruksi dengan tebakan. Kasus belum pulih dapat menolak autentikasi sampai admin merekonsiliasi; hibah yang sudah ditandai pulih oleh versi lama perlu audit operator.

## Aktivasi

Tautan sekali pakai 24 jam, token acak 32 byte, hanya hash disimpan. Terikat sidik kredensial; penerbitan ulang mengganti tautan sebelumnya. Konsumsi serentak hanya boleh berhasil sekali. Tidak otomatis login atau mengirim email. Token melalui fragmen URL lalu dibersihkan oleh UI; jangan masuk log/audit atau disimpan di storage klien. Perpindahan fragmen pada halaman sama harus tetap berfungsi.

## Lapisan lain yang wajib dipertahankan

- Server memeriksa cakupan entitas dan relasi objek, termasuk akses bukti, pencarian dan audit.
- CSRF dan CSP bernonce di `src/proxy.ts`; development Report-Only tidak membuktikan CSP produksi lolos.
- Bukti Supabase privat; URL sementara, hak tulis mengikuti kunci laporan/tugas. Uji baca health tidak membuktikan hak unggah/hapus.
- Error internal tidak dikirim mentah; sanitasi lewat `api-error.ts` dan helper keamanan.
- Pembatas laju saat ini per proses; multi-instans memerlukan penyimpanan bersama.
- Cron/internal health/backup memakai rahasia terpisah, bukan sesi pengguna.
- Dependensi braces adalah **patch lokal**. Wajib menyertakan seluruh `vendor/braces`, tarball, lisensi, upstream, patch, `verify.py`, dan tes. Jangan mengganti lockfile/override tanpa menguji regresi. Audit npm nol bukan sertifikasi rilis upstream.

Rujukan: [keamanan](../KEAMANAN.md), [akses/sesi](../codex/CX16-17-AKSES-SESI.md), [aktivasi](../codex/CX18-AKTIVASI.md), [dependensi](../codex/CX19-DEPENDENSI.md).
