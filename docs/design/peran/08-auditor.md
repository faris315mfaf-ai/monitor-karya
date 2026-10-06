# 08 · Auditor

**Siapa:** pemeriksa internal/eksternal (peran `AUDITOR`, contoh: Yusuf Pratama). Membaca seluruh grup tanpa mengubah apa pun, dan menelusuri jejak audit.
**Pertanyaan utama:** Apakah laporan masuk tepat waktu dan konsisten? Siapa mengubah apa, kapan? Di mana kepatuhan paling lemah?
**Papan kanvas:** belum ada papan khusus. Ringkasan memakai susunan **01 · Manajemen** dalam mode baca. Pratinjau: `/pratinjau?peran=AUDITOR`.

## Tab (src/lib/rbac.ts `ROLE_TABS`)
Ringkasan · Proyek · Divisi · Entitas · Log aktivitas.

## Desktop — Ringkasan (mode baca)
1. **Header & hero** sama dengan Manajemen: "x dari y proyek berjalan sesuai rencana.", cincin Output · Laporan harian · Tepat waktu, 4 KPI.
2. Tombol primer hero tetap navigasi ("Tinjau yang mendesak" membuka Sheet detail) — tidak ada tombol yang mengubah data.
3. **Persetujuan menunggu** diganti **Keputusan terbuka**: eskalasi terbuka sebagai `AttentionItem` (baca saja). Pengajuan proyek dan usulan tenggat tidak tampil karena auditor tidak menandatangani.
4. Laporan mingguan tidak bisa ditandai "Sudah dibaca"; pengingat tidak bisa dikirim.
5. Detail proyek di Sheet berisi tombol navigasi saja ("Buka modul proyek").

## Hak
| Bisa | Tidak bisa |
| --- | --- |
| Membaca seluruh data grup (`group:read`) | Mengisi, menyetujui, meneruskan, atau mengunci laporan |
| Membaca log aktivitas lengkap (`audit:read`) | Membuat atau memutuskan eskalasi, pengajuan proyek, usulan tenggat |
| | Mengirim pengingat, mengubah akun |

## Tablet & ponsel
Mengikuti 01 · Manajemen. Log aktivitas di ponsel: daftar `ActivityItem` dengan saringan peran/aksi di Sheet.

## Interaksi
| Aksi | Hasil |
| --- | --- |
| Klik baris proyek / timeline / perlu perhatian | Sheet detail (baca saja) |
| Klik eskalasi | Membuka tab Log aktivitas (auditor tidak punya tab Eskalasi) untuk menelusuri jejaknya |

## Data yang dibutuhkan
`/api/ringkasan` (respons tanpa `decisions` dan `deadlineProposals` untuk peran ini), `/api/audit-logs`.
