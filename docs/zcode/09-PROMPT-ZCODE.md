# Prompt pembuka untuk Zcode

Salin isi blok berikut ke percakapan baru Zcode setelah membuka folder terbaru. Prompt tidak memerlukan sesi Codex lama.

```text
Anda melanjutkan proyek Monitor Karya dari Codex. Mulai di:
/Users/godam/PROYEK/monitor-karya-codex
Cabang: codex/kerja. Basis implementasi/dokumentasi sebelumnya 4117a25;
commit paket handoff yang lebih baru dapat berada di atasnya.
Folder /Users/godam/PROYEK/monitor karya adalah worktree Claude yang berbeda.

Baca ZCODE.md, AGENTS.md, docs/SERAH-TERIMA-ZCODE.md dan seluruh paket
docs/zcode/README.md sesuai urutan. Baca docs/SISA-PEKERJAAN.md sebagai
backlog lengkap. Ikuti DESIGN.md serta docs/design/peran sebelum mengubah UI.
Baca guide lokal node_modules/next/dist/docs sebelum mengubah kode Next.

Pertama lakukan orientasi read-only: verifikasi cwd/cabang/HEAD/status,
worktree, berkas penting, dan apakah localhost:3200 masih hidup. Jangan
menampilkan .env/token/kata sandi. Jangan memasang ulang/reset/seed atau
menyalakan server kedua tanpa memeriksa keadaan.

Kode CX 1–20 sudah diimplementasikan sesuai laporan masing-masing.
Bukti terakhir 7 Oktober: 1.356 tes aplikasi, 794 tes dependensi, build Docker,
7 skenario HTTP/PostgreSQL dan 3 probe gangguan. Itu bukti historis, bukan tes baru.
Dokumen lama yang menyebut 872/1.192 tes, cron 07–18, atau sesi cookie saja
sudah dilengkapi oleh CX 16–20. Baca koreksi pada dokumen status Zcode.

Jangan mengakses/memutasi Supabase atau server produksi; jangan seed/reset
DB persisten 54339 atau menghapus volumenya. Gunakan fixture terisolasi
untuk tes tulis. Jangan rebase/reset/force-push/push/PR/deploy.
Migrasi terakhir 0028; nomor berikutnya harus diperiksa sebelum dipakai.
Pertahankan vendor/braces beserta sumber, patch, tarball, lisensi, dan tes.

Setelah membaca, laporkan: posisi kode, aturan utama, hasil yang sudah
terbukti, pekerjaan tersisa, dan rekomendasi tugas berikutnya. Tulis catatan
penerimaan docs/zcode/PENERIMAAN-ZCODE.md berisi bukti yang benar-benar
Anda periksa. Jangan mengklaim produksi siap atau semua backlog selesai.
Jangan mengimplementasikan keputusan bisnis terbuka tanpa keputusan pemilik.
Saat tugas berikutnya diberikan, klaim zona, ubah kode bertahap, uji sesuai
risiko, lalu perbarui catatan hasil dan backlog.
```

## Isi laporan penerimaan yang diharapkan

Tanggal/WIB, path dan branch/HEAD aktual, perubahan belum commit, layanan yang benar-benar diperiksa, dokumen dibaca, ketidaksesuaian, keterbatasan alat, rencana tugas berikutnya. Jangan mencantumkan rahasia atau menyalin keluaran env mentah. Laporan penerimaan dibuat oleh Zcode setelah pemeriksaan, bukan dipalsukan oleh pembuat paket.
