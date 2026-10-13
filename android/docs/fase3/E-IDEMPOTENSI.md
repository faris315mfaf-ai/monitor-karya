# E — Idempotensi tulis server (kontrak untuk outbox Android)

Agen server gelombang E, 13 Oktober 2026. Cabang `claude/perbaiki-bug-sisa`, tanpa commit.
Menutup batas di [B2-OUTBOX-PIC](B2-OUTBOX-PIC.md): entri/bukti bisa terkirim dua kali bila
proses Android mati tepat setelah POST sukses, karena outbox mengulang pesan yang belum tercatat
sukses. Kode Android **belum** diubah (di luar lingkup agen ini) — lihat §6.

## 1. Header

| Hal | Nilai |
| --- | --- |
| Header permintaan | `Idempotency-Key: <kunci>` |
| Bentuk kunci | 8–64 karakter `[A-Za-z0-9_.:-]`, diawali huruf/angka. **Pakai UUID v4** (36 karakter). |
| Kosong / tidak dikirim | Perilaku lama persis (web tidak mengirimnya) |
| Bentuk tidak sah | `400` `{ error }` — tidak ada yang ditulis |
| Header respons ulangan | `Idempotency-Replayed: true` (hanya pada respons yang diambil dari simpanan) |
| Masa berlaku | 7 hari sejak permintaan pertama; disapu cron harian `kpi-snapshot` |

Satu kunci = satu pesan outbox. Buat UUID saat pesan **diantre**, simpan di baris outbox, kirim
ulang kunci yang SAMA pada setiap percobaan. Jangan pernah memakai ulang kunci untuk pesan lain.

## 2. Rute

| Jenis outbox | Rute | Kunci rute di server | Tanpa kunci, ulangan setelah sukses |
| --- | --- | --- | --- |
| `TAMBAH_ENTRI` | `POST /api/tasks` | `POST /api/tasks` | **Entri ganda** (alasan utama) |
| `UNGGAH_BUKTI` | `POST /api/evidence/upload` (multipart) | `POST /api/evidence/upload` | **Bukti ganda** |
| `UBAH_ENTRI`, `UBAH_TUGAS` | `PUT /api/tasks` | `PUT /api/tasks` | Isi idempoten (ganti utuh), tetapi bisa `409` bila laporan dibekukan di antaranya → GAGAL palsu |
| `HAPUS_ENTRI` | `DELETE /api/tasks?id=&context=HARIAN` | `DELETE /api/tasks` | `404 Task tidak ditemukan` → GAGAL palsu |
| `KIRIM_LAPORAN` | `PUT /api/daily-input` | `PUT /api/daily-input` | Isi idempoten, tetapi `submittedAt` bergeser ke waktu ulangan (bisa mengubah penilaian terlambat) dan bisa `409` beku |

Semua lima rute menerima header yang sama. Ubah/hapus "hampir" idempoten secara alami, tetapi
ulangan setelah sukses bisa berakhir galat palsu; dengan kunci, ulangan dibalas sukses pertama.

## 3. Perilaku server

1. Kunci dicari per **(userId sesi, kunci)**. Kunci yang sama dari akun lain tidak bentrok dan
   tidak pernah membaca respons akun lain (diproses sebagai permintaan baru miliknya).
2. Sudah tercatat untuk rute yang sama → **status + badan respons pertama** dikembalikan apa
   adanya, plus `Idempotency-Replayed: true`. Tidak ada tulisan, audit, atau unggahan baru
   (unggah bukti: dijawab sebelum berkas dibaca).
3. Sudah tercatat untuk rute **lain** → `422` `{ error }` (bug klien: kunci dipakai ulang).
4. Belum tercatat → aksi berjalan normal. Hanya respons **2xx** yang dicatat, di transaksi yang
   sama dengan tulisannya (commit bersama atau batal bersama).
5. Respons non-2xx (`409` beku/kunci, `422` validasi, `403`, `404`, `5xx`) **tidak** dicatat:
   mengulang dengan kunci sama setelah keadaan berubah (mis. buka kunci disetujui) diproses
   normal.
6. Balapan: dua permintaan bersamaan berkunci sama → INSERT kunci kedua menunggu di indeks unik
   lalu gagal P2002; transaksinya batal tanpa menulis apa pun dan ia membalas respons pemenang
   (untuk bukti: objek storage yang kalah langsung dihapus). Hasilnya selalu satu objek.
7. Badan respons > 64 KiB disimpan sebagai `{ ok: true, idempotentSummary: true, resourceId }`
   (tidak terjadi pada lima rute ini dengan batas medan sekarang).
8. Kunci > 7 hari dianggap tidak ada (dibuang saat ditemui, disapu cron).

## 4. Pemetaan hasil di outbox (tidak berubah)

Respons ulangan berstatus sama dengan aslinya (`200`), jadi `HasilKirim.dari` memetakannya ke
sukses biasa: id server dari badan (`task.id`, `evidence.id`) dipakai untuk mengganti
`"lokal:<idOutbox>"` seperti biasa. `400` kunci tidak sah dan `422` kunci rute lain → GAGAL
permanen (bug klien). `409 locked:false` "sedang diproses" (seharusnya tidak pernah terlihat)
→ sementara + backoff, sama seperti P2002 sekarang.

## 5. Penyimpanan (server)

- Tabel `IdempotencyKey` — migrasi `prisma/migrations/0033_idempotency_key` (additive,
  `IF NOT EXISTS`): `userId`, `key`, `route`, `responseStatus`, `responseBody JSONB`,
  `resourceId`, `createdAt`; `UNIQUE (userId, key)`, indeks `createdAt`. Tanpa FK ke `User`.
- Dipilih tabel terpisah, bukan kolom `clientRequestId` pada `Task`/`Evidence`: satu mekanisme
  untuk lima rute (termasuk PUT/DELETE yang tidak membuat baris), respons asli bisa dikirim
  ulang persis, lingkup per pengguna, dan model lama tidak berubah.
- Helper: `src/lib/idempotency.ts` (`withIdempotency`, `findIdempotentReplay`,
  `recordIdempotentResponse`, `purgeExpiredIdempotencyKeys`). Pembersihan di
  `src/app/api/cron/kpi-snapshot/route.ts` (harian 17.30; gagal sapu tidak menggagalkan KPI).
- Tes: `tests/api/idempotensi.test.ts` (15) — ulangan sama tanpa duplikat, kunci akun lain tidak
  bentrok/bocor, balapan P2002 (entri & bukti), tanpa header = lama, non-2xx tidak dicatat,
  header tidak sah, rute lain, kedaluwarsa, PUT/DELETE ulangan, sapu 7 hari, batas 64 KiB.

## 6. Tindak lanjut Android (belum dikerjakan)

1. Kolom baru `kunciIdempotensi TEXT` di tabel outbox (Room v5, migrasi additive), diisi
   `UUID.randomUUID()` saat `AntreanOutbox` mengantre; pesan lama tanpa kunci tetap dikirim
   tanpa header.
2. `PengirimLaporanPic`/`OutboxProsesor` menambah header `Idempotency-Key` untuk `TAMBAH_ENTRI`,
   `UBAH_ENTRI`, `HAPUS_ENTRI`, `UNGGAH_BUKTI`, `KIRIM_LAPORAN`, `UBAH_TUGAS`.
3. Kirim daring langsung (gerbang "daring dulu") sebaiknya juga mengirim kunci yang sama dengan
   yang akan dipakai bila jatuh ke antrean, supaya galat jaringan setelah server sukses tidak
   menghasilkan duplikat saat diantre ulang.
4. Tes: ulangan 200 + `Idempotency-Replayed` → id lokal tetap diganti id server.
