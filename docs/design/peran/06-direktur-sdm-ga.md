# 06 · Direksi holding (SDM & GA)

**Siapa:** pemilik proses pelaporan di tingkat holding (peran `DIREKTUR_SDM_GA`, contoh: Dewi Kartika). Membaca seluruh grup seperti Manajemen, menjaga daftar eskalasi, dan melapor ke Manajemen.
**Pertanyaan utama:** Apakah semua PT dan divisi melapor tepat waktu? Eskalasi mana yang macet dan perlu saya kejar? Pengajuan apa yang menunggu tanda tangan saya?
**Papan kanvas:** belum ada papan khusus. Layar memakai susunan **01 · Manajemen** (`ManagementDashboard`) dengan hak yang berbeda di bawah. Pratinjau: `/pratinjau?peran=DIREKTUR_SDM_GA`.

## Tab (src/lib/rbac.ts `ROLE_TABS`)
Ringkasan · Proyek · Divisi · Eskalasi · Entitas · Log aktivitas.

## Desktop — urutan
Sama dengan 01 · Manajemen, dengan penyesuaian:
1. **Header:** "Selasa, 6 Oktober 2026 · Minggu ke-41 · seluruh grup" + sapaan; kanan: `SegmentedControl` periode **Minggu / Bulan / Kuartal** (hanya bila ada data output), notifikasi.
2. **Hero:** "x dari y proyek berjalan sesuai rencana."; pendukung jumlah perlu perhatian/terlambat + persetujuan menunggu. `ActivityRings`: Output · Laporan harian · Tepat waktu. KPI: Output selesai (gradient) · Rata-rata progres · Persetujuan menunggu · Kehadiran.
3. **Output selesai** + **Perlu perhatian**; **Timeline** + **Status proyek** (donat); **Proyek prioritas** + **Kinerja divisi** (tepat waktu per divisi, target 85%).
4. **Persetujuan menunggu:** pengajuan proyek pada slot Manajemen (`ApprovalItem` Setujui/Tinjau) dan eskalasi terbuka (`AttentionItem` → tab Eskalasi). Usulan geser tenggat tampil hanya untuk pemutus (Direktur entitas, Manajemen, Super Admin) — peran ini tidak memutuskannya.
5. **Aktivitas terbaru**, **Kehadiran hari ini**, lalu **Aktivitas per perusahaan**.

## Hak yang membedakan
| Bisa | Tidak bisa |
| --- | --- |
| Menandatangani slot Manajemen pada pengajuan proyek | Memutuskan eskalasi (hak Manajemen) |
| Menindaklanjuti & membuat eskalasi | Memutuskan usulan geser tenggat |
| Mengirim pengingat ke divisi yang belum melapor (`notify:remind`) | Mengelola perusahaan & akun |
| Menyetujui permintaan buka kunci (`unlock:approve`) | |
| Membaca log aktivitas seluruh grup | |
| Menandai laporan mingguan divisi "Sudah dibaca" | |

## Tablet & ponsel
Mengikuti 01 · Manajemen: tablet = hero + 4 KPI + Output selesai lebar penuh; ponsel = cincin 96, KPI 2×2, periode `full` di bawah hero, timeline & donat disembunyikan, `ProjectRow compact`.

## Data yang dibutuhkan
Sama dengan Manajemen (`/api/ringkasan`): proyek + status, output per periode, divisi (tepat waktu, laporan mingguan), keputusan menunggu, eskalasi, aktivitas, kehadiran.
