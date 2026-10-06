# Terowongan WireGuard: VPS aplikasi ↔ VPS database

Hostinger tidak menyediakan jaringan privat antar-VPS, jadi lalu lintas ke
PostgreSQL dibungkus WireGuard. Port 5432 tidak pernah terbuka ke internet;
yang terbuka di VPS database hanya UDP 51820, dan hanya untuk IP VPS aplikasi.

| Mesin | Alamat wg0 |
|---|---|
| VPS database (KVM 2) | 10.10.0.1 |
| VPS aplikasi (KVM 8) | 10.10.0.2 |
| Laptop admin (opsional, untuk psql/pgAdmin) | 10.10.0.10 |

## 1. Pasang di kedua VPS

```bash
sudo apt-get install -y wireguard
sudo install -d -m 700 /etc/wireguard
wg genkey | sudo tee /etc/wireguard/private.key | wg pubkey | sudo tee /etc/wireguard/public.key
sudo chmod 600 /etc/wireguard/private.key
```

Catat isi `public.key` dari masing-masing VPS.

## 2. VPS database — `/etc/wireguard/wg0.conf`

```ini
[Interface]
Address = 10.10.0.1/24
ListenPort = 51820
PrivateKey = <isi /etc/wireguard/private.key VPS database>

[Peer]
# VPS aplikasi
PublicKey = <public.key VPS aplikasi>
AllowedIPs = 10.10.0.2/32
```

Buka port hanya untuk IP publik VPS aplikasi:

```bash
sudo ufw allow from <IP-PUBLIK-VPS-APLIKASI> to any port 51820 proto udp comment 'wireguard app'
```

## 3. VPS aplikasi — `/etc/wireguard/wg0.conf`

```ini
[Interface]
Address = 10.10.0.2/24
PrivateKey = <isi /etc/wireguard/private.key VPS aplikasi>

[Peer]
# VPS database
PublicKey = <public.key VPS database>
Endpoint = <IP-PUBLIK-VPS-DATABASE>:51820
AllowedIPs = 10.10.0.1/32
PersistentKeepalive = 25
```

## 4. Nyalakan di kedua VPS

```bash
sudo chmod 600 /etc/wireguard/wg0.conf
sudo systemctl enable --now wg-quick@wg0
sudo wg show
ping -c 3 10.10.0.1     # dari VPS aplikasi
```

Kontainer Docker di VPS aplikasi mencapai 10.10.0.1 lewat routing host,
jadi tidak perlu pengaturan tambahan di compose.

## Laptop admin (opsional)

Tambahkan peer ketiga di VPS database (`AllowedIPs = 10.10.0.10/32`) dan buka
UDP 51820 untuk IP rumah/kantor Anda. Jangan pernah membuka 5432 ke internet
untuk "sementara".
