#!/usr/bin/env bash
# Perbarui cabang `codex/basis` menjadi potret pohon kerja Claude saat ini
# (termasuk perubahan yang belum di-commit), tanpa menyentuh HEAD, index, atau
# berkas di folder Claude. Lalu Codex mengambilnya dengan merge.
#
#   bash scripts/sinkron-codex.sh              # perbarui codex/basis saja
#   bash scripts/sinkron-codex.sh --gabung     # sekaligus merge ke codex/kerja di worktree Codex
#
# Lihat docs/KOORDINASI-AGEN.md dan docs/PEMBAGIAN-TUGAS.md.
set -euo pipefail

MAIN="$(cd "$(dirname "$0")/.." && pwd)"
WT="$(cd "$MAIN/.." && pwd)/monitor-karya-codex"
cd "$MAIN"

TMPIDX="$(mktemp)"
rm -f "$TMPIDX"
trap 'rm -f "$TMPIDX"' EXIT

TREE="$(GIT_INDEX_FILE="$TMPIDX" sh -c 'git read-tree HEAD && git add -A && git write-tree')"
PREV="$(git rev-parse --verify -q codex/basis || true)"
if [[ -n "$PREV" && "$(git rev-parse "$PREV^{tree}")" == "$TREE" ]]; then
  echo "codex/basis sudah sama dengan pohon kerja Claude."
else
  PARENTS=(-p HEAD)
  [[ -n "$PREV" ]] && PARENTS+=(-p "$PREV")
  COMMIT="$(git commit-tree "$TREE" "${PARENTS[@]}" -m "Potret pohon kerja Claude untuk Codex ($(date '+%d %b %Y %H.%M'))")"
  git branch -f codex/basis "$COMMIT"
  echo "codex/basis → $(git log --oneline -1 codex/basis)"
fi

# Pastikan potret tidak membawa berkas rahasia.
if git diff --name-only HEAD codex/basis | grep -iE '(^|/)\.env($|\.)|\.pem$|\.key$|credentials' | grep -v '\.example$'; then
  echo "!! Potret memuat berkas yang tampak rahasia (di atas). Periksa .gitignore sebelum Codex menggabungkannya."
  exit 1
fi

if [[ "${1:-}" == "--gabung" ]]; then
  [[ -d "$WT" ]] || { echo "Worktree Codex tidak ada: $WT"; exit 1; }
  if [[ -n "$(git -C "$WT" status --porcelain)" ]]; then
    echo "Worktree Codex punya perubahan belum di-commit. Minta Codex commit dulu, lalu ulangi."; exit 1
  fi
  git -C "$WT" merge --no-edit codex/basis
  echo "Digabung ke codex/kerja. Codex: jalankan 'npx prisma generate' bila skema berubah."
fi
