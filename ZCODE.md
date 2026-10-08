# Mulai di sini — Monitor Karya untuk Zcode

Paket serah terima 8 Oktober 2026. Baca [ringkasan](docs/SERAH-TERIMA-ZCODE.md), lalu [seluruh paket dokumentasi](docs/zcode/README.md).

**Buka folder `/Users/godam/PROYEK/monitor-karya-codex`, cabang `codex/kerja`.**
Folder `/Users/godam/PROYEK/monitor karya` adalah worktree berbeda dan belum memuat hasil terbaru. Jangan menimpa folder tersebut atau memindahkan linked worktree dengan salinan biasa.

Basis yang diperiksa `4117a25`; paket dokumentasi berada setelah commit itu. Mulai dengan `git status`, `git log`, dan `git worktree list` untuk memastikan keadaan aktual. [Prompt siap salin](docs/zcode/09-PROMPT-ZCODE.md) tersedia bila Zcode tidak membaca instruksi otomatis.

- Ikuti [AGENTS](AGENTS.md), [aturan](docs/zcode/01-ATURAN-KERJA.md), dan desain per peran.
- Jangan mengakses/memutasi produksi, reset/seed DB pengguna 54339, rebase/reset/force-push, push/PR/deploy tanpa kewenangan yang sesuai.
- Kode lima prioritas terakhir selesai lokal; produksi dan backlog global belum semuanya selesai.
- Rahasia, akun, database, dan proses runtime tidak dipindah oleh dokumentasi ini.
- Jangan memakai handoff Claude→Codex lama sebagai status terbaru; baca koreksi di [status](docs/zcode/06-STATUS-DAN-PENGUJIAN.md).
