#!/usr/bin/env bash
# Pengerasan dasar Ubuntu 24.04 untuk VPS Hostinger (dipakai VPS aplikasi & VPS database).
#
# Jalankan sebagai root, SEKALI, setelah Anda bisa masuk SSH dengan kunci:
#   sudo bash harden.sh <nama_user> "<kunci publik SSH Anda>"
#
# Yang dilakukan:
#   - membuat user admin non-root dengan sudo + kunci SSH
#   - SSH: tanpa root, tanpa kata sandi, hanya user itu
#   - firewall UFW: tolak semua masuk kecuali SSH (dengan batas laju)
#   - fail2ban untuk SSH
#   - pembaruan keamanan otomatis
#   - parameter kernel jaringan yang lebih aman
#
# PENTING: biarkan sesi SSH yang sekarang tetap terbuka. Uji masuk dengan user
# baru dari terminal LAIN sebelum menutupnya, supaya tidak terkunci di luar.
set -euo pipefail

ADMIN_USER="${1:?Pakai: harden.sh <nama_user> \"<kunci publik SSH>\"}"
PUBKEY="${2:?Kunci publik SSH wajib diisi (isi ~/.ssh/id_ed25519.pub di laptop Anda)}"
SSH_PORT="${SSH_PORT:-22}"

[[ $EUID -eq 0 ]] || { echo "Jalankan sebagai root."; exit 1; }
[[ "$ADMIN_USER" =~ ^[a-z][a-z0-9_-]{0,31}$ && "$ADMIN_USER" != root ]] || { echo "Nama admin tidak sah."; exit 1; }
[[ "$SSH_PORT" =~ ^[0-9]{1,5}$ ]] && ((10#$SSH_PORT >= 1 && 10#$SSH_PORT <= 65535)) || { echo "Port SSH tidak sah."; exit 1; }
[[ "$PUBKEY" != *$'\n'* && "$PUBKEY" != *$'\r'* ]] || { echo "Kunci harus satu baris."; exit 1; }
[[ "$PUBKEY" =~ ^(ssh-ed25519|ssh-rsa|ecdsa-sha2-) ]] || { echo "Kunci publik tidak dikenali."; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get install -y --no-install-recommends ufw fail2ban unattended-upgrades apt-listchanges \
  ca-certificates curl gnupg jq rsync

# --- user admin -------------------------------------------------------------
if ! id "$ADMIN_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$ADMIN_USER"
fi
usermod -aG sudo "$ADMIN_USER"
install -d -m 700 -o "$ADMIN_USER" -g "$ADMIN_USER" "/home/$ADMIN_USER/.ssh"
AUTH="/home/$ADMIN_USER/.ssh/authorized_keys"
touch "$AUTH"
grep -qxF -- "$PUBKEY" "$AUTH" || echo "$PUBKEY" >> "$AUTH"
chown "$ADMIN_USER:$ADMIN_USER" "$AUTH"
chmod 600 "$AUTH"
# sudo tanpa kata sandi hanya bila Anda mau; bawaan: tetap minta kata sandi.
if ! passwd -S "$ADMIN_USER" | grep -q " P "; then
  echo ">> Setel kata sandi sudo untuk $ADMIN_USER:"
  passwd "$ADMIN_USER"
fi

# --- SSH --------------------------------------------------------------------
cat > /etc/ssh/sshd_config.d/00-monitor-karya-hardening.conf <<EOF
Port $SSH_PORT
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
AllowUsers $ADMIN_USER
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
sshd -t
systemctl reload ssh

# --- firewall ---------------------------------------------------------------
# Ubuntu 24.04 memakai socket activation: nonaktifkan socket agar Port sshd
# berlaku setelah restart; operator tetap memegang sesi SSH yang sekarang.
systemctl disable --now ssh.socket
systemctl enable ssh
systemctl restart ssh
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw limit "$SSH_PORT/tcp" comment 'ssh'
ufw --force enable

# --- fail2ban ---------------------------------------------------------------
cat > /etc/fail2ban/jail.d/sshd.local <<EOF
[sshd]
enabled  = true
port     = $SSH_PORT
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
bantime.increment = true
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

# --- pembaruan keamanan otomatis ---------------------------------------------
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/52unattended-local <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:30";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF

# --- kernel -----------------------------------------------------------------
cat > /etc/sysctl.d/90-hardening.conf <<'EOF'
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.tcp_syncookies = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
EOF
sysctl --system >/dev/null

timedatectl set-timezone Asia/Jakarta

echo
echo "Selesai. Uji dari terminal LAIN sebelum menutup sesi ini:"
echo "  ssh -p $SSH_PORT $ADMIN_USER@<IP-VPS>"
echo "Root dan login kata sandi sudah dimatikan."
