# Hasil CX 1–7

Implementasi selesai di worktree `/Users/godam/PROYEK/monitor-karya-codex`, cabang `codex/kerja`, pada 6 Oktober 2026. Tidak digabungkan ke worktree Claude; tidak ada akses Supabase, migrasi database nyata, atau deployment VPS.

| Tugas | Hasil | Laporan |
|---|---|---|
| CX 1 | Bukti laporan/task mengikuti buka kunci aktif, kedaluwarsa, dan kunci ulang | [CX1](CX1-HASIL.md) |
| CX 2 | Hari beku baca-saja, keterangan kunci aksesibel, guard pindah/edit/hapus/Urungkan | [CX2](CX2-HASIL.md) |
| CX 3 | Workflow GitHub CI lengkap dengan URL DB tiruan dan secret acak | [CX3](CX3-HASIL.md) |
| CX 4 | PostgreSQL lokal, initializer metadata Storage, skrip berpengaman | [CX4](CX4-HASIL.md), [panduan](db-lokal.md) |
| CX 5 | Seed model terbaru, relasi divisi/PIC lengkap, pengulangan hanya di DB lokal | [CX5](CX5-HASIL.md) |
| CX 6 | Skrip deploy diperkuat, checklist rilis, Docker runner teruji | [CX6](CX6-HASIL.md), [checklist](../../deploy/CHECKLIST-RILIS.md) |
| CX 7 | Supabase bawaan, driver S3/MinIO opsional dengan tanda tangan SigV4 | [CX7](CX7-HASIL.md), [konfigurasi](penyimpanan.md) |

## Bukti pemeriksaan

- TypeScript, ESLint, dan Vitest lulus: **42 berkas, 789 tes**. Tambahan CX berjumlah 129 tes.
- Next production build berhasil, 57 halaman statis. Docker target runner dan build berhasil; runner non-root, read-only, cap-drop ALL, no-new-privileges sehat. `/login` 200 dan `/pratinjau` 404 dalam produksi.
- Seluruh 9 skrip deploy dan skrip DB lokal lulus bash -n serta ShellCheck tingkat warning. YAML CI dan konfigurasi Compose sah; port app tidak dipublikasikan di paket deploy, hanya Caddy.
- PostgreSQL lokal dari Compose kosong: 22 migrasi berhasil, seed dua kali, admin uji dibuat, status migrasi mutakhir. Karena port host 54329 dipakai layanan lain, uji menggunakan namespace Docker tanpa jaringan eksternal dan tanpa port host. Tidak menghentikan layanan lain.
- Runner dengan DB lokal: login admin, sesi, dan entitas masing-masing 200. SUPERADMIN tidak memiliki meja kerja, sehingga endpoint tersebut menolak dengan 400 sesuai perannya.
- MinIO lokal terpisah: unggah nama Unicode, presigned GET privat, penolakan overwrite, hapus, hapus ulang, serta GET 404 setelah hapus lulus. Penyimpanan lain tidak disentuh.

## Tindak lanjut integrasi

1. Claude CD1: mock progress-reports dan frozenDays untuk pratinjau PIC. Saat ini pratinjau mingguan berhenti pada pesan tanpa basis data; uji visual DnD/layout nyata belum terbukti. Tes CX2 memakai mock/SSR.
2. Claude CD3: dukungan lajur nonaktif di WeeklyBoard agar hari beku kembali di urutan kronologis. Saat ini bagian baca-saja ditempatkan setelah papan aktif dan CSS bergantung struktur lajur bersama.
3. Claude CD4: CSP perlu mengizinkan origin S3 yang dikonfigurasi untuk preview gambar inline; backend dan unduhan langsung sudah teruji. Pesan route unggahan juga perlu mengikuti driver yang dipilih.
4. Workflow CI perlu dijalankan di GitHub setelah push. Script deploy, backup/restore, SSH/UFW/WireGuard, serta Caddy pada VPS memerlukan verifikasi operator di host tujuan.

Resource Docker untuk pembuktian bersifat sementara. Perintah penggunaan normal tersedia di panduan lokal. Peralihan ke S3 tidak otomatis memindahkan objek lama; Supabase tetap driver default.
