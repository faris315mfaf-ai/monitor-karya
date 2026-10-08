# Aturan kerja penerus

## Ruang kerja dan kewenangan

- Kerja di `/Users/godam/PROYEK/monitor-karya-codex`, cabang `codex/kerja`. Nama folder tidak perlu diubah karena berganti alat ke Zcode.
- `/Users/godam/PROYEK/monitor karya` adalah worktree lain pada `desain-baru`; jangan menimpa atau menyinkronkan otomatis.
- Sebelum mengedit, baca [AGENTS](../../AGENTS.md), [koordinasi](../KOORDINASI-AGEN.md), periksa Git, lalu klaim zona. Bila ada agen lain, pisahkan kepemilikan berkas dan jangan membatalkan perubahan mereka.
- Migrasi alat ini mengizinkan persiapan dokumentasi. Bukan izin otomatis untuk deploy, push, PR, atau mengubah aturan bisnis terbuka.

| Boleh dalam lingkup tugas yang diberikan | Tidak boleh |
|---|---|
| Membaca kode, dokumentasi, diff, tes | Menampilkan atau menyalin rahasia ke log/dokumen/chat |
| Mengubah kode pada zona yang diklaim dan menguji lokal | Mengedit worktree Claude tanpa arahan pemilik |
| Menulis migrasi baru setelah memeriksa nomor terakhir | Mengubah/menghapus migrasi yang sudah diterapkan untuk menyembunyikan drift |
| Menggunakan DB Docker **terisolasi** untuk fixture dan tes mutasi | Seed/reset DB pengguna persisten 54339, menghapus volumenya |
| Commit lokal kecil sesuai topik | Rebase, reset, force-push; push/PR tanpa izin eksplisit |
| Mendokumentasikan usulan produk beserta dampaknya | Menetapkan sendiri keputusan bagian B backlog |

**Tidak ada operasi Supabase/server produksi dalam kewenangan saat ini.** Jangan menjalankan migrasi, db push, db execute, seed, skrip akun, atau pengujian tulis ke sana. Prosedur deploy hanya panduan untuk operator. Jangan menyimpulkan URL aman hanya karena nama env berisi “local”; periksa host, port, database, dan tujuan aplikasi tanpa mencetak kredensial.

Nomor terakhir saat snapshot: **0028**, berikutnya **0029 bila masih kosong**. Larangan lama “Codex tidak boleh menulis migrasi” telah diganti handoff 6 Oktober; kewajiban menguji lokal dan larangan produksi tetap berlaku. Jangan mengisi nomor 0020/0022/0024 yang sengaja kosong.

## Desain dan bahasa

Sumber: [DESIGN](../../DESIGN.md), [panduan desain](../design/), [spesifikasi peran](../design/peran/).

- Nilai visual dari `design-system/tokens.css` atau kelas bertoken; gunakan `src/components/mk`. Jangan menambah palet, hex, ukuran acak, atau bayangan sendiri.
- Aksen gunakan `--accent`, `--accent-fill`, `--accent-soft`, `--on-accent`. Tema melalui `data-theme`, aksen melalui `data-accent`.
- Bahasa Indonesia, sapaan “Anda”, sentence case, angka di depan, tombol kata kerja + objek; tanpa emoji/tanda seru.
- Status warna + ikon + kata melalui `StatusBadge`: on/Sesuai jadwal, risk/Perlu perhatian, late/Terlambat, done/Selesai, neutral/Belum mulai.
- Maksimal 4 KPI, 1 tombol primer per kartu, 1 kartu bergradien per layar. Ringkasan dashboard satu kalimat di atas.
- Detail melalui `Sheet`, bukan memecah navigasi halaman tanpa alasan/desain yang disetujui.
- Konfirmasi untuk hapus; tindakan yang dapat dibalik memakai Urungkan. Server tetap memvalidasi izin dan token Urungkan.
- Pertahankan keyboard, fokus kembali, target sentuh, reduced motion, tema terang/gelap. Baca [checklist](../design/15-checklist-review.md).
- Nama View Transition hanya aktif di `.mk-vt`, jangan duplikasi nama pada dua elemen yang terlihat.

## Rekayasa dan pelaporan

Baca panduan Next yang relevan di `node_modules/next/dist/docs/` sebelum mengubah kode Next. Jangan menghapus blok Next otomatis pada AGENTS. Jangan mengasumsikan konvensi versi lama berlaku.

Otorisasi wajib di server: sesi + kapabilitas + cakupan + relasi objek + status/kunCI. Tombol tersembunyi tidak menggantikan pemeriksaan API. Perubahan terkait keamanan/transaksi harus punya regresi yang bermakna. Jangan menghapus guard fixture agar tes dapat dijalankan pada data pengguna.

Untuk kode: TypeScript, ESLint `src`, Vitest dan build dengan env lokal/tiruan sesuai [pengujian](06-STATUS-DAN-PENGUJIAN.md). Dokumentasi saja: tautan, kebersihan diff, konsistensi sumber dan rahasia; tidak perlu mengklaim menjalankan ulang tes aplikasi.

Catat berkas, alasan, hasil tes, batasan, dan pekerjaan tersisa. Bedakan “ditulis”, “lulus mock”, “lulus HTTP/DB lokal”, dan “terverifikasi produksi”. Jangan menandai keseluruhan proyek selesai hanya karena tugas terakhir lulus.
