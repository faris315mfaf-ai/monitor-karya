#!/usr/bin/env bash
# Jalankan Codex di worktree-nya sendiri, berdampingan dengan Claude Code.
# Lihat docs/KOORDINASI-AGEN.md.
#
#   bash scripts/mulai-codex.sh            # sesi interaktif Codex
#   bash scripts/mulai-codex.sh dev        # dev server worktree Codex di port 3200
#
# Sandbox workspace-write: Codex hanya bisa menulis di worktree-nya, ditambah
# folder .git repo utama (worktree menyimpan commit di sana). Jaringan sandbox
# mati, jadi dependensi sudah dipasang lebih dulu (npm ci).
set -euo pipefail

MAIN="$(cd "$(dirname "$0")/.." && pwd)"
WT="$(cd "$MAIN/.." && pwd)/monitor-karya-codex"

if [[ ! -d "$WT" ]]; then
  echo "Worktree Codex belum ada. Buat dulu:"
  echo "  git -C \"$MAIN\" worktree add \"$WT\" codex/kerja && (cd \"$WT\" && npm ci && npx prisma generate)"
  exit 1
fi

case "${1:-codex}" in
  dev)
    cd "$WT"
    exec npx next dev -p 3200
    ;;
  codex)
    exec codex \
      --cd "$WT" \
      --sandbox workspace-write \
      --ask-for-approval on-request \
      --add-dir "$MAIN/.git"
    ;;
  *)
    echo "Pakai: mulai-codex.sh [codex|dev]"; exit 1 ;;
esac
