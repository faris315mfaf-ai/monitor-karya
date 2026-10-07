# CX16–17 — Tenggat akses dan sesi server

7 Oktober 2026. Perubahan lokal pada cabang `codex/kerja`.

## Perilaku

- Setiap autentikasi memeriksa sesi tersimpan, status aktif, sidik kata sandi, dan akses sementara yang jatuh tempo. Cron tetap membersihkan akses, tetapi keterlambatan cron tidak memperpanjang hak pengguna.
- Pemulihan mengklaim permintaan secara atomik dan mengunci akun. Dua request/cron bersamaan tidak memulihkan dua kali. Jika pemulihan gagal, autentikasi ditolak; transaksi beserta audit dibatalkan.
- Dua pemberian akses sementara yang bertumpuk untuk satu akun ditolak dengan 409. Permintaan kedua tetap menunggu keputusan.
- Penugasan PIC sebelum hibah disimpan dan dipulihkan secara kondisional. PIC/kepala divisi lama hanya dipasang kembali bila masih aktif, mempunyai peran yang tepat, dan satu PT. Perubahan manual tidak ditimpa. Histori tanpa snapshot lengkap ditolak autentikasinya sampai direkonsiliasi; hibah yang sudah ditandai dipulihkan versi lama memerlukan audit manual, tidak ditebak pemilik lamanya.
- `AuthSession` (migrasi 0027) menyimpan id acak, pemilik, waktu kedaluwarsa, dan pencabutan. Token mentah tidak disimpan. Umur sesi tetap delapan jam, dengan id berbeda untuk tiap login.
- Keluar mencabut sesi tersebut di server dan membersihkan cookie. Perangkat lain tetap masuk. Reset/perubahan sandi membatalkan semua token lama melalui sidik kata sandi.
- Audit logout gagal tidak membatalkan pencabutan. Jika penyimpanan pencabutan gagal, cookie tetap dihapus tetapi respons 503 menyatakan sesi server belum berhasil dicabut; jangan mengaku logout server sukses.
- Penggantian sandi, audit, dan pembuatan sesi pengganti berada di satu transaksi. Kegagalan insert sesi membatalkan perubahan sandi; respons tidak membawa cookie baru.

## Penerapan

Migrasi harus dijalankan sebelum aplikasi baru digunakan. Token lama tanpa id sesi ditolak dan pengguna masuk ulang. Akun, sandi, proyek, dan laporan tidak direset. Tabel sesi memakai FK User dengan cascade, indeks pemilik/kedaluwarsa, dan RLS.

DB Docker uji baru port 54349 berhasil menerapkan 25 migrasi dari awal. DB Docker pengguna port 54339 dicadangkan ke berkas privat di luar repo lalu menerima migrasi tertunda 0026–0028. Jumlah tetap 97 akun, 40 proyek, 741 laporan. Tidak ada operasi Supabase/server.

## Bukti

Tes unit dan route: `tests/cx/session-expiry.test.ts`, `tests/lib/access-revert.test.ts`, `tests/cx/temporary-pic.test.ts`, dan tes login/sandi. Uji integrasi `scripts/uji-keamanan-lanjutan-lokal.ts` menolak selain DB loopback port 54349 dan aplikasi loopback port 3211; tidak boleh diarahkan ke database pengguna.

Uji HTTP/PostgreSQL meliputi token lama setelah logout, sesi kedua, dua request expiry bersamaan, trigger DB yang menolak audit logout, dan trigger yang menolak insert sesi pengganti. Lihat laporan integrasi CX16–20 untuk hasil akhir.
