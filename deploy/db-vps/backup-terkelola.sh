#!/usr/bin/env bash
# Cadangan database TERKELOLA (Biznet / layanan PostgreSQL terkelola lain)
# yang dijalankan dari VPS aplikasi — pengganti backup.sh (yang dirancang
# berjalan di host database lokal). pg_dump dijalankan lewat kontainer
# postgres:17 sekali pakai sehingga versi klien selalu cocok dengan server.
#
# Pasang di VPS aplikasi (bukan mesin pengembangan):
#   apt-get install -y age rclone        # opsional: enkripsi age + salin offsite
#   install -m 700 backup-terkelola.sh /usr/local/sbin/mk-backup-terkelola
#   install -d -m 700 /etc/mk-backup
# Berkas /etc/mk-backup/env (chmod 600) berisi minimal:
#   BACKUP_DB_URL='postgresql://...@host-biznet:5432/monitor_karya?sslmode=require'
# Opsional:
#   AGE_RECIPIENT_FILE=/etc/mk-backup/recipient.txt   # enkripsi age (kunci publik)
#   RCLONE_REMOTE=offsite:monitor-karya               # salin ke R2/B2 lewat rclone
#   RETENTION_DAYS=14
#   REPORT_CONTAINER=monitor-karya-monitor-karya-1    # laporan tahap ke aplikasi
# Kunci RAHASIA age disimpan di laptop/pengelola kata sandi, BUKAN di VPS.
# Crontab (01.15 WIB):
#   15 1 * * * root . /etc/mk-backup/env && /usr/local/sbin/mk-backup-terkelola >> /var/log/mk-backup.log 2>&1
#
# Keluar: 0 sukses; 70 sukses tetapi laporan ke aplikasi gagal; 1 gagal backup.
# Kegagalan pelaporan tidak pernah menghentikan backup (kontrak CX20).
set -euo pipefail
umask 077

BACKUP_DB_URL="${BACKUP_DB_URL:-${DATABASE_URL:-}}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/monitor-karya}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
AGE_RECIPIENT_FILE="${AGE_RECIPIENT_FILE:-}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
REPORT_CONTAINER="${REPORT_CONTAINER:-}"
PGIMAGE="${PGIMAGE:-postgres:17-bookworm}"
RUN_ID="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N)"
REPORT_STATUS=0
TMP_SHAS=""

fail() { echo "[GAGAL] $*" >&2; exit 1; }
[ -n "$BACKUP_DB_URL" ] || fail "BACKUP_DB_URL kosong. Isi /etc/mk-backup/env (lihat kepala skrip)."
command -v docker >/dev/null || fail "docker tidak ditemukan."

# Laporan tahap ke /api/health/backup lewat docker exec: Caddy memblokir
# endpoint ini dari luar, tetapi dari dalam kontainer 127.0.0.1:3000 sah.
report() { # $1 = running|success|failure
  [ -n "$REPORT_CONTAINER" ] || return 0
  if MK_REPORT_STATUS="$1" MK_REPORT_RUN_ID="$RUN_ID" \
      docker exec -i -e MK_REPORT_STATUS -e MK_REPORT_RUN_ID \
      "$REPORT_CONTAINER" node --input-type=module - <<'NODE'
const secret = process.env.BACKUP_REPORT_SECRET
if (!secret) process.exit(3)
const res = await fetch('http://127.0.0.1:3000/api/health/backup', {
  method: 'POST',
  headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
  body: JSON.stringify({ status: process.env.MK_REPORT_STATUS, runId: process.env.MK_REPORT_RUN_ID }),
  signal: AbortSignal.timeout(8000),
}).catch(() => null)
process.exit(res && res.status === 200 ? 0 : 4)
NODE
  then return 0; fi
  case "$1" in
    running) echo "[PERINGATAN] laporan running tidak terkirim." ;;
    *) REPORT_STATUS=70 ;;
  esac
}

install -d -m 700 "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
RAW="$BACKUP_DIR/monitor_karya-$STAMP.dump"
OUT="$RAW"

report running
trap '[ -n "$TMP_SHAS" ] && rm -f "$TMP_SHAS"; if [ $? -ne 0 ]; then report failure || true; fi' EXIT

echo "[1/5] pg_dump (kontainer $PGIMAGE)…"
# Custom-format pg_dump tidak andal ke stdout (--file=- menghasilkan 0 byte,
# /dev/stdout gagal fsync): tuangkan langsung ke berkas lewat volume terpasang.
docker run --rm -v "$BACKUP_DIR:/out:rw" "$PGIMAGE" \
  pg_dump "$BACKUP_DB_URL" --format=custom --compress=6 --file="/out/$(basename "$RAW")" \
  || fail "pg_dump gagal (periksa jaringan, TLS, dan allowlist IP di Biznet)."
[ -s "$RAW" ] || fail "hasil dump kosong."

echo "[2/5] checksum…"
TMP_SHAS="$(mktemp)"
( cd "$BACKUP_DIR" && sha256sum "$(basename "$RAW")" | tee "$TMP_SHAS" >>"$BACKUP_DIR/SHA256SUMS" )

echo "[3/5] enkripsi age…"
if [ -n "$AGE_RECIPIENT_FILE" ]; then
  command -v age >/dev/null || fail "AGE_RECIPIENT_FILE terpasang tetapi biner age tidak ada."
  age -R "$AGE_RECIPIENT_FILE" -o "$RAW.age" "$RAW" && rm -f "$RAW" && OUT="$RAW.age" \
    || fail "enkripsi age gagal."
fi

echo "[4/5] salin offsite…"
if [ -n "$RCLONE_REMOTE" ]; then
  command -v rclone >/dev/null || fail "RCLONE_REMOTE terpasang tetapi rclone tidak ada."
  rclone copyto "$OUT" "$RCLONE_REMOTE/$(basename "$OUT")" --checksum || exit 1
fi

echo "[5/5] retensi ${RETENTION_DAYS} hari…"
find "$BACKUP_DIR" -maxdepth 1 -name 'monitor_karya-*.dump*' -mtime "+$RETENTION_DAYS" -delete || true

report success || true
if [ "$REPORT_STATUS" -ne 0 ]; then
  echo "[PERINGATAN] backup sukses tetapi laporan ke aplikasi gagal (exit 70)."
  exit 70
fi
echo "[OK] $OUT"
