# T8-W2 — Meja Kerja Admin PT menjadi pemroses laporan masuk

Keputusan pemilik 9 Okt 2026 diterapkan tanpa commit, tanpa menyentuh basis data, dan tanpa menyentuh berkas agen lain. Meja kerja Admin PT kini murni **memeriksa** laporan yang masuk: dua seksi akordeon + Sheet rincian dengan galeri bukti, tanpa aksi tulis (penerusan tetap lewat tombol di Ringkasan).

## 1. Berkas yang diubah

- `src/components/work-desk/admin-desk.tsx` — ditulis ulang seluruhnya. (Tugas menyebut `src/components/admin/admin-desk.tst`; berkas meja kerja admin yang sesungguhnya dipetakan `work-desk-view` adalah `src/components/work-desk/admin-desk.tsx`, jadi di situlah penulisan ulang dilakukan.)
- `src/components/views/work-desk-view.tsx` — satu baris pemetaan: `<AdminDeskView data={d} reload={reload} />` menjadi `<AdminDeskView data={d} />` (prop `reload` tidak lagi dipakai; komponen ini kini baca-saja), plus satu kalimat docblock pemetaan peran Admin diselaraskan. Tidak ada perubahan logika lain di berkas ini.

Tipe `AdminDesk` tetap diekspor dengan bentuk yang sama (tetap mendeskripsikan payload `GET /api/work-desk` kind `ADMIN`), sehunya `type Desk = PicDesk | KadivDesk | AdminDesk` di `work-desk-view` tidak berubah. Tidak ada API, CSS, atau berkas zona lain yang disentuh.

## 2. Struktur baru meja kerja

- **Satu kalimat jawaban** di atas layar (Hero tanpa KPI): `x laporan proyek masuk hari ini, y laporan divisi minggu ini.` dengan pendukung jumlah belum lapor dan jumlah yang menunggu diteruskan dari Ringkasan.
- **Dua akordeon yang terbuka otomatis** (kepala kartu = tombol, `aria-expanded`/`aria-controls`, chevron memakai kelas `mk-card__head` yang sudah ada — tanpa CSS baru):
  - **Laporan proyek** — pelapor harian: proyek dengan `report.submittedAt`, terurut terbaru di atas. Baris: nama + PIC/kode, lencana ringkas **Baru** (info) / **Sudah diteruskan** (done), dan waktu kirim WIB.
  - **Laporan divisi** — pelapor mingguan (M<isoWeek>): divisi dengan `report.submittedAt`, baris nama + kadiv, lencana dan waktu serah yang sama.
  - Kosong: "Belum ada proyek yang mengirim laporan hari ini." / "Belum ada divisi yang menyerahkan laporan minggu ini." (dibedakan dari "belum ada proyek aktif/divisi aktif").
- **Sheet rincian** (pola Sheet web, `backLabel="Meja kerja"`, isi dipertahankan selama animasi tutup lewat snapshot baris terakhir):
  - **Laporan proyek** — identitas (proyek, PIC, pengirim, pukul kirim), status & progres (DailyStatusBadge + lencana Terlambat masuk/Perlu eskalasi bila ada + ProgressBar), capaian hari itu, kendala & tindak lanjut (dengan target tanggal), lalu **galeri bukti**.
  - **Laporan divisi** — identitas (divisi, kadiv, minggu, pukul serah), status (WeeklyHeaderBadge + Baru/Sudah diteruskan, catatan persetujuan kadiv), dan ringkasan butir: `x dari y item selesai` + bar proses + `z item terkendala · n item tanpa bukti`.
- **Tanpa aksi tulis**: tombol Ingatkan/Teruskan, alur, peta panas, kartu pengajuan/eskalasi, permintaan akses, dan buka kunci dari versi lama dihapus dari meja kerja. (Kepatuhan/peta panas kini di tab Statistik dan pengingat di Ringkasan sesuai T8-W3; salinan di salinan laporan merujuk "Ringkasan", bukan tab Penerimaan yang sudah tidak dimiliki Admin PT.)

## 3. Pengambilan data (hanya saat dibutuhkan)

- Daftar pelapor: dari payload `/api/work-desk` yang sudah dimuat `work-desk-view` — tidak ada permintaan tambahan saat membuka layar.
- Kendala & tindak lanjut tidak dibawa `/api/work-desk`; saat Sheet proyek dibuka diambil dari `GET /api/daily-reports?projectId=…&dateFrom=<hari>&dateTo=<hari>` lalu dipadukan dengan `reportId` (skeleton saat memuat, ErrorNote+Coba lagi saat gagal).
- Bukti: `GET /api/evidence?targetType=DAILY_REPORT&targetId=<reportId>` hanya saat Sheet terbuka (komponen galeri terpasang di isi Sheet, terlepas saat ditutup). Foto unggahan (`url` kosong, `mime image/*`) meminta URL bertanda tangan per berkas dari `GET /api/evidence/<id>` — sama dengan pola `PhotoThumb` di `evidence-panel.tsx`; `img loading="lazy"`, `object-fit: cover`, radius token lewat kelas `mk-lap-thumb` di `laporan.css`; klik membuka URL penuh di tab baru. Tautan/berkas non-gambar jadi baris berkas (`mk-lap-file`) dengan tombol buka (tautan langsung, unggahan lewat URL bertanda).

## 4. Kepatuhan aturan proyek

- Bahasa Indonesia, sapaan "Anda", sentence case, angka di depan, tombol kata kerja + objek; status selalu warna + ikon + kata (StatusBadge); tanpa emoji/tanda seru.
- Nilai visual hanya dari token: kelas `mk-*` yang ada plus kelas Tailwind bertoken (`text-ink-2`, `bg-fill-1`, `text-ink-3`, `mk-soft--risk`); tidak ada hex/px baru; tanpa penambahan CSS (zona terbatas komponen).
- UI sama di ponsel & PC: satu kolom daftar; detail di Sheet (ponsel layar didorong, desktop 440); grid foto `auto-fill minmax(96px,1fr)` menyesuaikan lebar.

## 5. Uji (semua lulus)

- `DATABASE_URL/DIRECT_URL=postgresql://x:y@127.0.0.1:1/db npx tsc --noEmit --incremental false` → nol galat.
- `npx eslint src/components/work-desk/admin-desk.tsx src/components/views/work-desk-view.tsx` → lulus tanpa peringatan.
- `npx vitest run tests/cx tests/api` → **56 berkas / 1186 tes lulus** (termasuk `tests/api/work-desk.test.ts` 26 tes yang mengunci bentuk `/api/work-desk`, dan `tests/cx/t8-statistik.test.ts` milik T8-W3).

## 6. Catatan batasan

- Pratinjau `/pratinjau?peran=ADMIN_PT` (`mock-admin.ts`) ada di zona agen lain dan tidak disentuh; mock belum tentu memuat `obstacle/followUp` — Sheet tetap berfungsi, seksi kendala menampilkan "Tidak ada kendala yang dilaporkan." bila rincian tidak ditemukan.
- `GET /api/evidence` dan `GET /api/daily-reports` sudah menjaga cakupan entitas di server (ADMIN_PT terikat satu PT), jadi meja kerja tidak menambah pemeriksaan otorisasi sisi klien.
