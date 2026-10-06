#!/usr/bin/env bash
# VPS aplikasi (Hostinger KVM 8): Docker + Caddy bersama untuk banyak proyek.
#
# Prasyarat: deploy/common/harden.sh sudah dijalankan.
#   sudo bash setup-app-host.sh <user_admin>
#
# Tata letak:
#   /srv/proxy           Caddy (satu-satunya kontainer yang membuka 80/443)
#   /srv/proxy/sites/    satu berkas *.caddy per proyek
#   /srv/apps/<proyek>/  kode + compose + .env.production tiap proyek
#   jaringan docker "web" dipakai bersama Caddy dan semua aplikasi
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Jalankan sebagai root."; exit 1; }
ADMIN_USER="${1:?Pakai: setup-app-host.sh <user_admin>}"
HERE="$(cd "$(dirname "$0")" && pwd)"

# --- Docker Engine (repo resmi) ----------------------------------------------
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git

# Log kontainer dibatasi supaya disk tidak penuh; tanpa hak istimewa baru.
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" },
  "no-new-privileges": true,
  "live-restore": true
}
EOF
systemctl restart docker
systemctl enable docker

# Grup docker setara root. Tambahkan user admin dengan sadar risiko ini.
usermod -aG docker "$ADMIN_USER"

# --- firewall ----------------------------------------------------------------
# Docker menulis aturan iptables sendiri dan MELEWATI ufw untuk port yang
# di-publish. Karena itu hanya Caddy yang boleh punya "ports:" di compose;
# aplikasi cukup "expose" di jaringan web.
ufw allow 80/tcp comment 'http'
ufw allow 443/tcp comment 'https'
ufw allow 443/udp comment 'http3'

# --- proxy bersama ------------------------------------------------------------
install -d -m 755 /srv/proxy/sites /srv/apps
cp "$HERE/proxy/docker-compose.yml" /srv/proxy/docker-compose.yml
cp "$HERE/proxy/Caddyfile" /srv/proxy/Caddyfile
chown -R "$ADMIN_USER:$ADMIN_USER" /srv/proxy /srv/apps
docker network inspect web >/dev/null 2>&1 || docker network create web
(cd /srv/proxy && docker compose up -d)

echo
echo "Host aplikasi siap. Keluar lalu masuk lagi agar grup docker berlaku untuk $ADMIN_USER."
echo "Lanjut: deploy/README.md langkah 5 (Monitor Karya)."
