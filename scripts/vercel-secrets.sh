#!/usr/bin/env bash
# Push the four secret environment variables to Vercel Production.
#
# Three are copied from the local .env because they name the same Supabase
# project. AUTH_SECRET is generated fresh instead: a leaked development secret
# must not be able to forge production sessions.
#
# Run from the repository root:
#   PowerShell / cmd :  .\scripts\vercel-secrets.cmd   (finds Git Bash itself)
#   Git Bash         :  bash scripts/vercel-secrets.sh
# DRY_RUN=1 exercises everything except the push to Vercel.

set -uo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env tidak ditemukan di $(pwd)" >&2
  exit 1
fi

# Every push below fails the same opaque way when the CLI is signed out or the
# directory is not linked, so say which of the two it is up front.
if ! whoami_out=$(npx --yes vercel whoami 2>&1); then
  echo "ERROR: Vercel CLI belum masuk. Jalankan dulu: npx vercel login" >&2
  printf '%s
' "$whoami_out" | sed 's/^/  /' >&2
  exit 1
fi
echo "Masuk sebagai: $(printf '%s' "$whoami_out" | tail -1)"

if [ ! -f .vercel/project.json ]; then
  echo "ERROR: folder ini belum ditautkan. Jalankan dulu: npx vercel link" >&2
  exit 1
fi

# Read one key out of .env, dropping surrounding quotes and any CRLF.
read_env() {
  grep -E "^$1=" .env | head -1 \
    | sed -e "s/^$1=//" -e 's/\r$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

push() {
  local name="$1" value="$2" out
  if [ -z "$value" ]; then
    echo "  SKIP $name — tidak ada di .env" >&2
    return 1
  fi
  if [ "${DRY_RUN:-}" = "1" ]; then
    echo "  (uji-coba) $name siap dikirim (${#value} karakter) — tidak dikirim"
    return 0
  fi
  # Drop any earlier copy so re-running the script stays idempotent.
  npx --yes vercel env rm "$name" production --yes >/dev/null 2>&1
  # Keep the CLI's own message: swallowing it leaves a bare "GAGAL" that says
  # nothing about whether this was a login, a network or a permission problem.
  if out=$(printf '%s' "$value" | npx --yes vercel env add "$name" production 2>&1); then
    echo "  OK   $name (${#value} karakter)"
  else
    echo "  GAGAL $name — pesan dari Vercel:" >&2
    printf '%s
' "$out" | sed 's/^/         /' >&2
    return 1
  fi
}

# Prove the connection strings work before any of them leaves this machine. A
# value that cannot open the database here will not open it from Vercel either,
# and pushing it would take the live site down until someone notices.
echo "Menguji koneksi database dengan nilai dari .env..."
for key in DATABASE_URL DIRECT_URL; do
  if ! DB_URL="$(read_env "$key")" node --input-type=module -e '
    import { PrismaClient } from "@prisma/client"
    const db = new PrismaClient({ datasources: { db: { url: process.env.DB_URL } }, log: [] })
    try { await db.$queryRaw`SELECT 1` }
    catch (e) {
      const NL = String.fromCharCode(10)
      const lines = String(e && e.message ? e.message : e).split(NL).map((l) => l.trim()).filter(Boolean)
      // Prefer the line that names the cause over the generic first line from Prisma.
      const reason = lines.find((l) => /P1[0-9]{3}|authentication|password|tenant|not found|refused|timed out|ENOTFOUND/i.test(l)) || lines[0] || "tidak ada pesan"
      console.error("    " + reason.replace(/:[/][/][^@ ]+@/g, "://***@").slice(0, 200))
      process.exit(1)
    } finally { await db.$disconnect() }
  '; then
    echo "ERROR: $key di .env tidak bisa terhubung ke database. Tidak ada yang dikirim ke Vercel." >&2
    echo "       Periksa password dan bentuk URL (harus postgresql://user:password@host:port/db)." >&2
    exit 1
  fi
  echo "  OK   $key terhubung"
done
echo

echo "Mengirim rahasia ke Vercel Production..."
fail=0
push DATABASE_URL              "$(read_env DATABASE_URL)"              || fail=1
push DIRECT_URL                "$(read_env DIRECT_URL)"                || fail=1
push SUPABASE_SERVICE_ROLE_KEY "$(read_env SUPABASE_SERVICE_ROLE_KEY)" || fail=1
push AUTH_SECRET               "$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')" || fail=1

if [ "${DRY_RUN:-}" = "1" ]; then
  echo; echo "Mode uji-coba selesai: tidak ada yang dikirim ke Vercel."; exit "$fail"
fi

echo
echo "Memeriksa hasil..."
listed=$(npx --yes vercel env ls production 2>&1)
for v in DATABASE_URL DIRECT_URL SUPABASE_SERVICE_ROLE_KEY AUTH_SECRET; do
  if echo "$listed" | grep -qE "^ $v "; then echo "  ada     $v"; else echo "  HILANG  $v"; fail=1; fi
done

if [ "$fail" -ne 0 ]; then
  echo; echo "Ada yang gagal. Jalankan lagi, atau tambahkan lewat dashboard Vercel." >&2
  exit 1
fi
echo; echo "Selesai. Empat rahasia sudah ada di Production."
