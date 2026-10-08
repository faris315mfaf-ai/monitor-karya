#!/usr/bin/env bash
#
# Pra-rilis Monitor Karya — satu perintah gerbang + gladi ringkas sebelum rilis.
#
# Tujuan: merangkai gerbang kode proyek (docs/zcode/06-STATUS-DAN-PENGUJIAN.md)
# dan gladi rilis Docker ringkas (bentuk pendek dari docs/zcode/HASIL-GLADI-RILIS.md)
# sehingga agen/operator lokal cukup menjalankan satu perintah sebelum menyerahkan rilis.
#
# Mode:
#   --cepat   tanpa Docker: prisma generate+validate (env tiruan), tsc --noEmit,
#             eslint src, vitest run, verifikasi vendor/braces, tes dependensi,
#             git diff --check.
#   (default) mode penuh: seluruh --cepat ditambah docker build --target runner dan
#             --target migrate (tag pra-rilis-<stempel waktu>), lalu gladi ringkas:
#             PostgreSQL 17 sekali pakai (port bebas dari 5460-5469, metadata
#             storage.buckets tiruan), `migrate deploy` dua kali (semua terpasang,
#             lalu idempoten), runner sekali pakai (port bebas dari 3240-3249,
#             AUTH_SECRET/CRON_SECRET acak per-jalan), cek /api/health 200,
#             /api/health/ready 200 dengan ok:true, /api/cron/kpi-snapshot 401.
#   --bantuan tampilkan pemakaian.
#
# Batasan (baca sebelum memakai hasil):
#   - Skrip ini TIDAK menggantikan checklist operator produksi (bagian A3 pada
#     docs/SISA-PEKERJAAN.md): unggah Storage Supabase nyata (PROSEDUR-A2-08),
#     Caddy/HTTPS/WireGuard, cron host, hook backup, dan restore offsite tetap
#     tugas operator.
#   - Tidak memakai rahasia nyata apa pun. Variabel rahasia warisan shell di-unset
#     di awal; kontainer hanya menerima nilai tiruan atau acak per-jalan.
#   - Tidak pernah menyentuh port 54339 (DB dev pengguna), 3200/3100 (dev server
#     Codex/Claude), 3211/54349 (pengujian CX16), dan tidak mengganggu kontainer
#     lain. Port dipilih hanya dari rentang 5460-5469 (basis data) dan 3240-3249
#     (aplikasi) lewat pemindaian port kosong; bila rentang penuh, skrip gagal
#     cepat sebelum memulai Docker.
#   - Semua kontainer, jaringan, image pra-rilis, dan direktori sementara
#     dibersihkan trap saat skrip selesai, terlepas sukses atau gagal. Cache build
#     Docker sengaja dibiarkan (aman dipakai ulang, berguna untuk pekerjaan lain).
#   - Mode penuh butuh Docker berjalan dan dapat menarik postgres:17-bookworm dari
#     registry publik bila image belum ada.
#
# Pemakaian:
#   bash scripts/pra-rilis.sh            # mode penuh (gerbang + gladi Docker)
#   bash scripts/pra-rilis.sh --cepat    # gerbang tanpa Docker
#   bash scripts/pra-rilis.sh --bantuan
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ---- Konstanta -----------------------------------------------------------------

ENV_TIRUAN='postgresql://x:y@127.0.0.1:1/db'   # loopback port 1: tidak pernah terhubung.
PORT_TERLARANG='54339 3200 3100 3211 54349'    # DB dev pengguna, dev server, uji CX16.
DB_PORT_AWAL=5460
DB_PORT_AKHIR=5469
APP_PORT_AWAL=3240
APP_PORT_AKHIR=3249
STAMP="$(date +%Y%m%d%H%M%S)"
TAG_RUNNER="pra-rilis-${STAMP}"
TAG_MIGRATE="pra-rilis-${STAMP}-migrate"
DB_KONTAINER="mk-pra-rilis-db-${STAMP}"
APP_KONTAINER="mk-pra-rilis-app-${STAMP}"
JARINGAN="mk-pra-rilis-${STAMP}"
DB_USER='mk_pra_rilis'
DB_PASS='pra_rilis_dummy'   # nilai tiruan, bukan rahasia; hidup sesi kontainer saja.
DB_NAMA='monitor_karya_local'
MODE_PENUH=1
GLADI_MULAI=0
NOMOR_LANGKAH=0
DB_PORT=''
APP_PORT=''
JUMLAH_MIGRASI=0

# ---- Argumen ---------------------------------------------------------------------

bantuan() {
  local header_akhir
  header_akhir=$(( $(grep -n -m1 '^set -euo pipefail$' "${BASH_SOURCE[0]}" | cut -d: -f1) - 1 ))
  sed -n "2,${header_akhir}p" "${BASH_SOURCE[0]}" | sed 's/^#\{1\} \{0,1\}//'
  exit 0
}

ARG="${1:---}"
case "$ARG" in
  --cepat) MODE_PENUH=0 ;;
  --bantuan|--help|-h) bantuan ;;
  --) ;;
  *) echo "Argumen tidak dikenal: $ARG. Pakai --cepat atau --bantuan." >&2; exit 2 ;;
esac
if [[ -n "${2:-}" ]]; then
  echo 'Hanya satu argumen yang diterima.' >&2
  exit 2
fi

# Direktori kerja sementara (log langkah + SQL initdb); dihapus trap.
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mk-pra-rilis.XXXXXX")"
INFO="$TMP_DIR/info.txt"   # anotasi langkah yang tampil pada baris [OK].
: > "$INFO"

# ---- Pra-syarat -------------------------------------------------------------------
# Gerbang tidak boleh mewarisi env produksi yang kebetulan ada di shell
# (peringatan docs/zcode/06-STATUS-DAN-PENGUJIAN.md). Skrip hanya memakai nilai
# tiruan atau acak yang dibuatnya sendiri.
unset DATABASE_URL DIRECT_URL AUTH_SECRET CRON_SECRET \
      OPS_HEALTH_SECRET BACKUP_REPORT_SECRET SUPABASE_SERVICE_ROLE_KEY \
      NEXT_PUBLIC_SUPABASE_URL STORAGE_DRIVER

butuh_perintah() {
  local p
  for p in "$@"; do
    command -v "$p" >/dev/null 2>&1 || {
      echo "Perintah $p tidak ditemukan. Butuh: node, npx, python3, git$( [[ $MODE_PENUH == 1 ]] && echo ', docker' )." >&2
      exit 1
    }
  done
}

butuh_perintah node npx python3 git
if [[ "$MODE_PENUH" == 1 ]]; then
  butuh_perintah docker
  # Gagal cepat sebelum menghabiskan waktu gerbang bila Docker tidak siap.
  docker info >/dev/null 2>&1 || {
    echo 'Docker tidak siap (daemon tidak berjalan?). Mode penuh butuh Docker; pakai --cepat untuk gerbang tanpa Docker.' >&2
    exit 1
  }
fi

# ---- Pelaksana langkah: satu baris [OK]/[GAGAL] per langkah ----------------------
# CATATAN: langkah dijalankan dalam kondisi `if`, jadi errexit mati di dalam tubuh
# fungsi langkah. Setiap fungsi langkah wajib merambatkan kegagalan secara eksplisit
# (perintah terakhir yang berarti, atau `... || return 1`).

langkah() {
  local judul=$1
  shift
  NOMOR_LANGKAH=$((NOMOR_LANGKAH + 1))
  local log="$TMP_DIR/langkah-${NOMOR_LANGKAH}.log"
  : > "$INFO"
  printf '%s' "[$NOMOR_LANGKAH] $judul ... "
  if "$@" >"$log" 2>&1; then
    if [[ -s "$INFO" ]]; then
      echo "[OK] ($(cat "$INFO"))"
    else
      echo '[OK]'
    fi
  else
    echo '[GAGAL]'
    echo "    ekor log $log:"
    tail -n 40 "$log" 2>/dev/null | sed 's/^/    /' || true
    exit 1
  fi
}

catat() { printf '%s' "$*" >> "$INFO"; }   # anotasi untuk baris [OK] langkah berjalan.

# ---- Util port --------------------------------------------------------------------
# Pemindaian mengikat sesaat 127.0.0.1:<port> dengan node; port yang sudah
# didengar siapa pun dianggap terpakai. Ada jendela kecil antara pemindaian dan
# pemakaian (TOCTOU) — bila ada yang menyita port di antaranya, docker run gagal
# terbit dan langkah jujur melaporkan [GAGAL].

port_bebas() { # 0 bila 127.0.0.1:<port> bisa didengar sesaat (artinya kosong).
  node -e '
    const net = require("net");
    const s = net.createServer();
    s.once("error", () => process.exit(1));
    s.listen(Number(process.argv[1]), "127.0.0.1", () => s.close(() => process.exit(0)));
  ' "$1"
}

tolak_port_terlarang() { # jaring pengaman bila rentang suatu saat diedit sampai menabrak.
  local port=$1 p
  for p in $PORT_TERLARANG; do
    if [[ "$port" == "$p" ]]; then
      echo "Port $port termasuk port terlarang ($PORT_TERLARANG). Perbaiki rentang skrip." >&2
      exit 1
    fi
  done
}

pilih_port() { # <awal> <akhir> <label>; cetak port kosong pertama, gagal bila penuh.
  local awal=$1 akhir=$2 label=$3 port
  for ((port = awal; port <= akhir; port++)); do
    tolak_port_terlarang "$port"
    if port_bebas "$port"; then
      echo "$port"
      return 0
    fi
  done
  echo "Tidak ada port bebas pada rentang ${awal}-${akhir} untuk ${label}; hentikan pemakai rentang itu atau tunggu." >&2
  return 1
}

acak_rahasia() { # <jumlah byte>; cetak base64url (cukup panjang untuk AUTH/CRON_SECRET).
  node -e 'process.stdout.write(require("crypto").randomBytes(Number(process.argv[1])).toString("base64url"))' "$1"
}

tunggu_port_dibuka() { # <port> <batas detik>: tunggu koneksi TCP ke 127.0.0.1 berhasil.
  node -e '
    const net = require("net");
    const port = Number(process.argv[1]);
    const batas = Number(process.argv[2]);
    const mulai = Date.now();
    const coba = () => {
      const s = net.connect(port, "127.0.0.1");
      s.once("connect", () => { s.destroy(); process.exit(0); });
      s.once("error", () => { s.destroy(); ulang(); });
    };
    const ulang = () => {
      if (Date.now() - mulai > batas * 1000) {
        console.error("port " + port + " tidak menerima koneksi dalam " + batas + " detik");
        process.exit(1);
      }
      setTimeout(coba, 1000);
    };
    coba();
  ' "$1" "$2"
}

cek_status() { # <url> <status diharapkan>: fetch tanpa redirect, bandingkan status.
  node -e '
    const url = process.argv[1];
    const want = Number(process.argv[2]);
    fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000) })
      .then((r) => {
        if (r.status !== want) { console.error("HTTP " + r.status + ", diharapkan " + want); process.exit(1); }
        process.exit(0);
      })
      .catch((e) => { console.error(String((e && e.message) || e)); process.exit(1); });
  ' "$1" "$2"
}

cek_siap() { # <url>: 200 DAN badan JSON memuat ok:true. Status boleh "degraded" —
             # benar saat Storage belum dikonfigurasi (perilaku CX20); 503 berarti gagal.
  node -e '
    const url = process.argv[1];
    fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000) })
      .then(async (r) => {
        const b = await r.json().catch(() => null);
        if (r.status !== 200 || !b || b.ok !== true) {
          console.error("HTTP " + r.status + " isi " + JSON.stringify(b));
          process.exit(1);
        }
        process.exit(0);
      })
      .catch((e) => { console.error(String((e && e.message) || e)); process.exit(1); });
  ' "$1"
}

tunggu_status() { # <url> <status> <batas detik>: polling sampai status cocok.
  local url=$1 want=$2 batas=$3
  local mulai=$SECONDS
  while (( SECONDS - mulai < batas )); do
    if cek_status "$url" "$want"; then
      return 0
    fi
    sleep 2
  done
  echo "$url tidak menjawab HTTP $want dalam ${batas} detik." >&2
  return 1
}

# ---- Langkah gerbang (--cepat) ------------------------------------------------------

gerbang_prisma_generate() { env DATABASE_URL="$ENV_TIRUAN" DIRECT_URL="$ENV_TIRUAN" npx prisma generate; }
gerbang_prisma_validate() { env DATABASE_URL="$ENV_TIRUAN" DIRECT_URL="$ENV_TIRUAN" npx prisma validate; }
gerbang_tsc()             { npx tsc --noEmit --incremental false; }
gerbang_eslint()          { npx eslint src; }
gerbang_vitest()          { npx vitest run; }
gerbang_braces()          { python3 vendor/braces/verify.py; }
gerbang_dependensi()      { npm run test:dependencies; }
gerbang_git_diff()        { git diff --check; }

# ---- Langkah gladi Docker (mode penuh) -----------------------------------------------

pilih_port_gladi() {
  DB_PORT="$(pilih_port "$DB_PORT_AWAL" "$DB_PORT_AKHIR" 'basis data pra-rilis')" || return 1
  APP_PORT="$(pilih_port "$APP_PORT_AWAL" "$APP_PORT_AKHIR" 'aplikasi pra-rilis')" || return 1
  catat "DB ${DB_PORT}, aplikasi ${APP_PORT}"
}

hitung_migrasi() {
  JUMLAH_MIGRASI="$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d '[:space:]')"
  if ! [[ "$JUMLAH_MIGRASI" =~ ^[0-9]+$ ]] || [[ "$JUMLAH_MIGRASI" == 0 ]]; then
    echo 'Tidak menemukan direktori migrasi di prisma/migrations.' >&2
    return 1
  fi
  catat "${JUMLAH_MIGRASI} direktori migrasi"
}

build_runner()  { docker build --target runner  -t "$TAG_RUNNER"  .; }
build_migrate() { docker build --target migrate -t "$TAG_MIGRATE" .; }

siapkan_initdb() {
  # Metadata storage.buckets tiruan, identik dengan config compose dev
  # (docker-compose.dev.yml) yang dibutuhkan migrasi 0006. Bukan implementasi Storage.
  mkdir -p "$TMP_DIR/initdb"
  cat > "$TMP_DIR/initdb/00-storage-metadata.sql" <<'SQL'
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
SQL
}

naikkan_postgres() {
  GLADI_MULAI=1   # mulai alokasi sumber daya Docker; trap wajib membersihkan.
  docker network create "$JARINGAN" >/dev/null || return 1
  siapkan_initdb
  docker run -d --rm \
    --name "$DB_KONTAINER" \
    --network "$JARINGAN" \
    -p "127.0.0.1:${DB_PORT}:5432" \
    -e "POSTGRES_USER=${DB_USER}" \
    -e "POSTGRES_PASSWORD=${DB_PASS}" \
    -e "POSTGRES_DB=${DB_NAMA}" \
    -v "${TMP_DIR}/initdb:/docker-entrypoint-initdb.d:ro" \
    postgres:17-bookworm >/dev/null || return 1
  catat "kontainer ${DB_KONTAINER}"
}

tunggu_postgres() {
  # Entripoint resmi postgres hanya membuka TCP setelah skrip init (termasuk
  # storage.buckets) selesai; jadi koneksi TCP berarti skema siap untuk migrasi.
  tunggu_port_dibuka "$DB_PORT" 120 || return 1
  docker exec "$DB_KONTAINER" psql -U "$DB_USER" -d "$DB_NAMA" -tAc 'SELECT 1' >/dev/null
}

db_url_jaringan() {
  echo "postgresql://${DB_USER}:${DB_PASS}@${DB_KONTAINER}:5432/${DB_NAMA}?schema=public"
}

migrasi_pertama() {
  local url terpasang
  url="$(db_url_jaringan)"
  docker run --rm --network "$JARINGAN" \
    -e "DATABASE_URL=${url}" -e "DIRECT_URL=${url}" \
    "$TAG_MIGRATE" | tee "$TMP_DIR/migrasi-1.out" || return 1
  # DB baru wajib benar-benar menerapkan, bukan "tidak ada yang menunggu".
  if grep -q 'No pending migrations' "$TMP_DIR/migrasi-1.out"; then
    echo 'Migrasi pertama tidak menerapkan apa pun pada DB baru; ada yang tidak beres.' >&2
    return 1
  fi
  terpasang="$(docker exec "$DB_KONTAINER" psql -U "$DB_USER" -d "$DB_NAMA" -tAc \
    'SELECT count(*) FROM _prisma_migrations' | tr -d '[:space:]')"
  if [[ "$terpasang" != "$JUMLAH_MIGRASI" ]]; then
    echo "Baris _prisma_migrations=${terpasang}, harusnya ${JUMLAH_MIGRASI}." >&2
    return 1
  fi
  catat "terpasang ${terpasang} dari ${JUMLAH_MIGRASI} migrasi"
}

migrasi_kedua() {
  local url
  url="$(db_url_jaringan)"
  docker run --rm --network "$JARINGAN" \
    -e "DATABASE_URL=${url}" -e "DIRECT_URL=${url}" \
    "$TAG_MIGRATE" | tee "$TMP_DIR/migrasi-2.out" || return 1
  # Idempoten: jalanan kedua tidak punya pekerjaan.
  grep -q 'No pending migrations' "$TMP_DIR/migrasi-2.out" || {
    echo 'Migrasi kedua seharusnya tidak punya pekerjaan; periksa keluaran di atas.' >&2
    return 1
  }
}

jalankan_runner() {
  local url
  RAHASIA_AUTH="$(acak_rahasia 32)"   # >=32 karakter; dibuat baru tiap jalan, tak dicetak.
  RAHASIA_CRON="$(acak_rahasia 24)"   # >=16 karakter; dibuat baru tiap jalan, tak dicetak.
  url="$(db_url_jaringan)"
  docker run -d --rm \
    --name "$APP_KONTAINER" \
    --network "$JARINGAN" \
    -p "127.0.0.1:${APP_PORT}:3000" \
    -e "DATABASE_URL=${url}" \
    -e "DIRECT_URL=${url}" \
    -e "AUTH_SECRET=${RAHASIA_AUTH}" \
    -e "CRON_SECRET=${RAHASIA_CRON}" \
    -e "APP_ORIGINS=http://127.0.0.1:${APP_PORT}" \
    "$TAG_RUNNER" >/dev/null || return 1
  catat "kontainer ${APP_KONTAINER} di port ${APP_PORT}"
}

tunggu_runner() {
  # healthcheck image memberi start-period 40 detik; anggarkan dua kali lipat.
  tunggu_status "http://127.0.0.1:${APP_PORT}/api/health" 200 120
}

cek_health() { cek_status "http://127.0.0.1:${APP_PORT}/api/health" 200; }
cek_ready()  { cek_siap "http://127.0.0.1:${APP_PORT}/api/health/ready"; }
cek_cron()   {
  # Tanpa header Authorization: CRON_SECRET memang terpasang (acak per-jalan),
  # sehingga pagar memutus tepat 401, bukan 503 "belum dikonfigurasi".
  cek_status "http://127.0.0.1:${APP_PORT}/api/cron/kpi-snapshot" 401
}

# ---- Bersih-bersih --------------------------------------------------------------------

bersihkan() {
  local rc=$?
  trap - EXIT
  if [[ "${GLADI_MULAI:-0}" == 1 ]]; then
    [[ -n "${APP_KONTAINER:-}" ]] && docker rm -f "$APP_KONTAINER" >/dev/null 2>&1 || true
    [[ -n "${DB_KONTAINER:-}" ]]  && docker rm -f "$DB_KONTAINER"  >/dev/null 2>&1 || true
    [[ -n "${JARINGAN:-}" ]]      && docker network rm "$JARINGAN" >/dev/null 2>&1 || true
  fi
  # Image pra-rilis dibuang di mode penuh apa pun tahap gladi tercapai (bila build
  # sukses tapi langkah berikutnya gagal, image tetap tidak dibiarkan tertinggal).
  if [[ "${MODE_PENUH:-0}" == 1 ]]; then
    docker rmi "$TAG_RUNNER" "$TAG_MIGRATE" >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP_DIR:-}" >/dev/null 2>&1 || true
  if [[ "${GLADI_MULAI:-0}" == 1 ]]; then
    echo '[BERSIH] kontainer, jaringan, image pra-rilis, dan berkas sementara dihapus.'
  fi
  exit "$rc"
}
trap bersihkan EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ---- Jalankan ---------------------------------------------------------------------------

echo "== Monitor Karya pra-rilis ${STAMP} =="
if [[ "$MODE_PENUH" == 1 ]]; then
  echo "Mode penuh: gerbang + build Docker + gladi ringkas (port DB ${DB_PORT_AWAL}-${DB_PORT_AKHIR}, aplikasi ${APP_PORT_AWAL}-${APP_PORT_AKHIR})."
else
  echo 'Mode cepat: gerbang tanpa Docker.'
fi
echo "Log langkah di: $TMP_DIR"
echo

langkah 'prisma generate (env tiruan)'  gerbang_prisma_generate
langkah 'prisma validate (env tiruan)'  gerbang_prisma_validate
langkah 'tsc --noEmit'                  gerbang_tsc
langkah 'eslint src'                    gerbang_eslint
langkah 'vitest run'                    gerbang_vitest
langkah 'verifikasi vendor/braces'      gerbang_braces
langkah 'tes dependensi'                gerbang_dependensi
langkah 'git diff --check'              gerbang_git_diff

if [[ "$MODE_PENUH" == 1 ]]; then
  langkah 'pilih port bebas (gagal cepat bila penuh)'    pilih_port_gladi
  langkah 'hitung migrasi'                               hitung_migrasi
  langkah "docker build --target runner ${TAG_RUNNER}"   build_runner
  langkah "docker build --target migrate ${TAG_MIGRATE}" build_migrate
  langkah 'naikkan PostgreSQL 17 sekali pakai'           naikkan_postgres
  langkah 'tunggu PostgreSQL siap'                       tunggu_postgres
  langkah 'migrate deploy pertama (semua terpasang)'     migrasi_pertama
  langkah 'migrate deploy kedua (idempoten)'             migrasi_kedua
  langkah 'jalankan runner sekali pakai'                 jalankan_runner
  langkah 'tunggu runner menyala'                        tunggu_runner
  langkah 'GET /api/health = 200'                        cek_health
  langkah 'GET /api/health/ready = 200 ok:true'          cek_ready
  langkah 'GET /api/cron/kpi-snapshot = 401 tanpa rahasia' cek_cron
fi

echo
echo "== Pra-rilis lulus: ${NOMOR_LANGKAH} langkah (mode $( [[ $MODE_PENUH == 1 ]] && echo penuh || echo cepat )). =="
