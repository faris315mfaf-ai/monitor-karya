# CX2 — Hari beku pada papan task mingguan

Dikerjakan 6 Oktober 2026 di `/Users/godam/PROYEK/monitor-karya-codex`, cabang `codex/kerja`. Tidak membuat commit, migrasi, atau akses basis data/Supabase.

## Hasil

- Membaca `frozenDays` dari GET `/api/tasks`, mengubah instan ISO menjadi kunci hari WIB; data pratinjau lama tanpa properti ini tetap didukung.
- Hari beku, termasuk hari tanpa kartu, memiliki lajur baca-saja, ikon kunci, dan keterangan “Diteruskan ke holding · ajukan buka kunci”. Lajur dapat difokuskan dengan keyboard dan memiliki `aria-describedby` untuk keterangan kuncinya.
- Kartu beku tidak diberikan kepada permukaan DnD. Lajur kosongnya pada papan interaktif disembunyikan melalui CSS, termasuk tombol tambah dan target keyboard/pointer. Hari lain serta lajur mingguan tetap dapat dipakai.
- Menolak seluruh batch PATCH sebelum fetch bila ada asal/tujuan beku, minggu terkunci, kartu tidak dikenal, tujuan di luar minggu, data sedang dimuat/galat, atau toast berasal dari proyek/minggu lain.
- Urungkan memakai snapshot terbaru, termasuk bila kunci berubah sesudah toast ditampilkan atau komponen sudah ditutup. Susunan untuk Urungkan juga menyertakan lajur asal yang menjadi kosong setelah pindah.
- Form PUT tidak dipasang untuk sumber/dialog beku. Pilihan tujuan di dialog hanya hari yang tidak beku; perubahan daftar beku membuat dialog dipasang ulang sehingga pilihan tujuan lama tidak tersimpan. Tombol tambah utama memakai lajur mingguan bila hari ini beku.
- Tambah, ubah, dan hapus memeriksa kunci pada handler; hapus memeriksa ulang sesudah konfirmasi.

## Berkas

- `src/components/weekly-task-board.tsx`
- `src/app/css/weekly-task.css`
- `src/app/globals.css`: tepat satu impor CSS sesuai izin eksplisit pengguna.
- `tests/cx/weekly-task-board.test.ts`
- Laporan ini.

`WeeklyBoard`, `TaskDialog`, konfigurasi tes dan berkas agen lain tidak diubah.

## Pemeriksaan

- `npx vitest run tests/cx/weekly-task-board.test.ts`: **17 tes lolos**.
- `npx tsc --noEmit --incremental false`: lolos.
- `npx eslint src`: lolos.
- `npx vitest run`: **41 berkas, 765 tes lolos** pada snapshot bersama saat pemeriksaan terakhir. Agen lain sedang mengerjakan zona lain, sehingga jumlah suite dapat berubah.
- `git diff --check`: lolos.
- Tes mencakup asal/tujuan/hari yang sama beku, batch campuran, normalisasi WIB, lajur mingguan, data lama, minggu terkunci, kartu/tujuan tidak dikenal, markup lajur kosong/beku, add/dialog tujuan, Urungkan sesudah pembekuan asal/tujuan, pemuatan, pergantian minggu, dan unmount. Fetch dimock; tes tidak menyentuh basis data.
- Dibaca: AGENTS, pembagian tugas, koordinasi, DESIGN, desain PIC, checklist review, dokumentasi Next terbundel `use-client` dan `11-css`.
- Graph Tier 2: project `monitor-karya-codex`, generasi `2026-10-06T07:13:10Z`; coverage papan, shared board, route tasks, dan use-resource tanpa gap tercatat sebelum edit. TaskDialog memiliki tiga rentang parse parsial (230, 316, 427), dibaca langsung beserta jalur save/selektor hari. Graph merupakan sinyal best effort; keputusan implementasi diverifikasi dari sumber.

## Batasan dan integrasi lintas zona

`WeeklyBoard` hanya memiliki prop `disabled` untuk seluruh papan. Agar tidak mengedit zona bersama, hari beku ditampilkan **di bagian baca-saja setelah papan interaktif**, bukan di posisi kronologis aslinya. CSS bergantung pada tujuh section lajur langsung dalam `.mk-wb`, sesuai struktur shared board sekarang. Label weekday/weekend pada hari terbuka tetap benar karena daftar `days` tidak dipotong.

Untuk mengembalikan seluruh lajur ke satu papan kronologis, perubahan lintas zona minimal di `src/components/weekly-board.tsx` adalah prop opsional `disabledLanes` dan `renderLaneNote`, diterapkan ke `Lane` (droppable/tombol tambah), `SortableCard` (sensor/pegangan), serta handler drag-over/end untuk menolak asal/tujuan beku. Perubahan ini tidak diterapkan; penjagaan PATCH di CX2 tetap harus dipertahankan setelah integrasi.

Checklist desain diperiksa dari kode/markup: token CSS, teks/ikon kunci, keterangan aksesibilitas dan tidak adanya aksi pada kartu beku. Belum menjalankan pemeriksaan browser 1440/834/390, terang/gelap/aksen, zoom 200%, sensor DnD nyata, atau pembaca layar. Tes UI menggunakan SSR dan mock komponen bersama, sehingga bukan bukti perilaku layout/DnD di browser. Pengujian PUT memverifikasi kontrak pemasangan/pilihan TaskDialog, bukan mengeksekusi form nyata.

Penjagaan klien mengikuti snapshot GET terbaru; pembekuan di server setelah snapshot terakhir tetap ditolak API (409). Tidak menambahkan polling atau mengubah API.

## Percobaan visual oleh agen induk

Browser pratinjau PIC pada port Codex 3200 dapat membuka Laporan harian. Memilih Mingguan berhenti pada pesan “Pratinjau tanpa basis data” karena mock progress-reports belum tersedia di snapshot ini. Tidak mengubah zona pratinjau Claude; permintaan CD1 dicatat. Verifikasi visual hari beku belum dapat dinyatakan lulus.

## Pembaruan integrasi lanjutan

Tindak lanjut lintas zona dalam laporan awal telah diterapkan di cabang Codex atas permintaan pengguna. Hasil browser, jumlah tes terbaru dan gambar ada di [README](README.md#integrasi-lanjutan). Catatan awal di atas merupakan riwayat sebelum integrasi.
