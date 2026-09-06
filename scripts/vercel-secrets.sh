#!/usr/bin/env bash
# Push the four secret environment variables to Vercel Production.
#
# Three are copied from the local .env because they name the same Supabase
# project. AUTH_SECRET is generated fresh instead: a leaked development secret
# must not be able to forge production sessions.
#
# Run from the repository root:  bash scripts/vercel-secrets.sh

set -uo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env tidak ditemukan di $(pwd)" >&2
  exit 1
fi

# Read one key out of .env, dropping surrounding quotes and any CRLF.
read_env() {
  grep -E "^$1=" .env | head -1 \
    | sed -e "s/^$1=//" -e 's/\r$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

push() {
  local name="$1" value="$2"
  if [ -z "$value" ]; then
    echo "  SKIP $name — nilai kosong" >&2
    return 1
  fi
  # Drop any earlier copy so re-running the script stays idempotent.
  npx --yes vercel env rm "$name" production --yes >/dev/null 2>&1
  if printf '%s' "$value" | npx --yes vercel env add "$name" production >/dev/null 2>&1; then
    echo "  OK   $name (${#value} karakter)"
  else
    echo "  GAGAL $name" >&2
    return 1
  fi
}

echo "Mengirim rahasia ke Vercel Production..."
fail=0
push DATABASE_URL              "$(read_env DATABASE_URL)"              || fail=1
push DIRECT_URL                "$(read_env DIRECT_URL)"                || fail=1
push SUPABASE_SERVICE_ROLE_KEY "$(read_env SUPABASE_SERVICE_ROLE_KEY)" || fail=1
push AUTH_SECRET               "$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')" || fail=1

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
