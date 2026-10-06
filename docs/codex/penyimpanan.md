# Penyimpanan bukti

Supabase Storage tetap bawaan. Tanpa `STORAGE_DRIVER`, atau dengan
`STORAGE_DRIVER=supabase`, konfigurasi dan perilaku sebelumnya berlaku:
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, bucket privat `evidence`,
unggah `upsert: false`, dan tautan baca 300 detik. Nilai driver selain `supabase`
atau `s3` ditolak; tidak ada fallback antar penyedia.

Driver opsional S3/MinIO menggunakan SigV4 dari `node:crypto`, tanpa dependensi
baru. Konfigurasi dibaca pada server saat operasi berjalan. Kredensial S3 tidak
boleh memakai awalan `NEXT_PUBLIC_`. Modul ditandai `server-only` dan membutuhkan
runtime Node.js, yang sudah dipakai route unggahan.

Contoh konfigurasi lokal **belum diaktifkan** (nilai kredensial contoh saja):

```dotenv
STORAGE_DRIVER=s3
S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_BUCKET=evidence
S3_ACCESS_KEY_ID=ganti-dengan-kunci-lokal
S3_SECRET_ACCESS_KEY=ganti-dengan-rahasia-lokal
S3_FORCE_PATH_STYLE=true
```

| Variabel | Keterangan |
|---|---|
| `S3_ENDPOINT` | Opsional, origin HTTP(S) tanpa path, query, fragmen, atau kredensial. Bawaan `https://s3.<region>.amazonaws.com`. |
| `S3_REGION` | Opsional, bawaan `us-east-1`; samakan dengan konfigurasi penyedia. |
| `S3_BUCKET` | Wajib, bucket yang sudah dibuat. |
| `S3_ACCESS_KEY_ID` | Wajib, kunci akses server. |
| `S3_SECRET_ACCESS_KEY` | Wajib, rahasia server. |
| `S3_FORCE_PATH_STYLE` | `true` atau `false`, bawaan `false`. MinIO/alamat IP biasanya memerlukan `true`. |

Jika aplikasi berjalan di container, `127.0.0.1` menunjuk container aplikasi.
Endpoint harus dapat diakses server aplikasi dan browser pengguna: URL baca yang
ditandatangani mengandung hostname endpoint yang sama. Untuk deployment, gunakan
endpoint HTTPS yang dapat diakses pengguna. Tidak ada endpoint terpisah untuk
browser, rewrite hostname, atau redirect otomatis.

Bucket harus privat dengan akses anonim dinonaktifkan. Pembuatan bucket dan
kebijakan akses dilakukan operator; modul tidak mengubah ACL atau membuat bucket.
Kunci layanan membutuhkan izin `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`
pada objek di bucket itu. Gunakan kredensial statis; STS/session token dan rantai
kredensial AWS otomatis belum didukung. Sinkronkan waktu server untuk SigV4.

Baca menggunakan URL GET privat 300 detik, termasuk penandatanganan nama unduhan.
Jangan simpan URL ini di basis data atau log. Unggah memakai PUT dengan hash
SHA-256 badan dan `If-None-Match: *` yang ikut ditandatangani. Penyedia harus
mendukung conditional PUT; HTTP 409/412 menghasilkan kegagalan tanpa retry atau
fallback. Penghapusan menerima sukses dan HTTP 404; galat lainnya diteruskan.
Permintaan mutasi tidak memakai cache, menolak redirect, dan memiliki timeout
30 detik. Badan galat penyedia tidak ditampilkan.

Format `storageKey` tetap `targetType/targetId/stamp-rand-fileName`; nama lama tidak
diubah atau di-decode. Key S3 dengan segmen `.` atau `..` ditolak agar normalisasi
URL tidak mengarahkan ke objek lain. Batas 20 MiB, daftar MIME, dan otorisasi route
unggahan tetap memakai kontrak lama.

## Pergantian penyedia

Ini pemilihan penyedia global, bukan migrasi objek. Objek Supabase lama tidak
tersalin otomatis. Sebelum mengaktifkan S3, operator harus menyalin seluruh objek
ke bucket baru dengan key yang sama, memverifikasi isi, dan mengatur akses privat.
Peralihan memerlukan koordinasi unggahan agar tidak ada objek yang tertinggal.
Untuk kembali ke Supabase, pastikan objek baru juga tersedia di sana. Jangan
mengganti driver produksi sebelum penyalinan dan verifikasi ini selesai.

Implementasi CX7 tidak mengaktifkan S3, mengubah `.env`, membuat bucket, mengirim
permintaan storage nyata, atau menjalankan migrasi basis data.

## Verifikasi offline

```bash
npx vitest run tests/cx/storage.test.ts
npx eslint src/lib/storage.ts src/lib/storage-s3.ts tests/cx/storage.test.ts
npx tsc --noEmit --incremental false
```

Tes memalsukan semua `fetch` dan klien Supabase. Tes mencocokkan vektor presigned
URL resmi [AWS SigV4](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-query-string-auth.html),
memverifikasi ulang tanda tangan permintaan PUT/DELETE dari badan dan header yang
benar-benar dikirim, serta menguji key khusus, TTL, unduhan, galat, konfigurasi,
dan kontrak Supabase. Perilaku conditional PUT mengacu pada
[PutObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html).
Uji integrasi terhadap versi MinIO/S3 yang akan dipakai masih diperlukan oleh
operator; belum ada storage hidup yang dihubungi untuk CX7.
