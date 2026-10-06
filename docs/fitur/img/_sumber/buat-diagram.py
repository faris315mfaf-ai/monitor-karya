#!/usr/bin/env python3
"""Pembuat diagram SVG statis untuk docs/fitur/img/.

Pakai:  python3 docs/fitur/img/_sumber/buat-diagram.py docs/fitur/img

Teks diagram (alur, wireframe, peta navigasi) ditulis di skrip ini. Bila layar
atau aturan berubah, ubah teksnya di sini lalu jalankan ulang; jangan menyunting
SVG hasil secara manual. ROLE_TABS di bawah adalah salinan src/lib/rbac.ts.

Semua diagram memakai latar terang sendiri (kartu membulat) agar terbaca di
tema terang maupun gelap penampil Markdown. Warna netral, aksen sedikit untuk
makna (status, model baru).
"""
import os
import sys
from xml.sax.saxutils import escape

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

FONT = "-apple-system, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
MONO = "'SF Mono', Menlo, Consolas, monospace"
C = dict(
    bg='#F5F5F7', panel='#FFFFFF', panel2='#FAFAFB', line='#D1D1D6', line2='#E5E5EA',
    ink='#1D1D1F', ink2='#48484A', ink3='#6E6E73',
    acc='#B3261E', accSoft='#FBEAE8',
    ok='#1E7B34', okSoft='#E6F4EA', warn='#8A5300', warnSoft='#FFF3DC',
    bad='#B3261E', badSoft='#FBEAE8', info='#1F5FAD', infoSoft='#E7EFFA',
    d1='#2F6FD1', d2='#1E8A4C', d3='#C2397A', d4='#7B4FD1', d5='#C76B12', d6='#4F6B7A',
)


class Svg:
    def __init__(self, w, h, title, desc=''):
        self.w, self.h = w, h
        self.parts = []
        self.title, self.desc = title, desc

    def add(self, s):
        self.parts.append(s)

    def rect(self, x, y, w, h, fill=None, stroke=None, r=10, sw=1, dash=None, opacity=None):
        a = f'x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill or "none"}"'
        if stroke:
            a += f' stroke="{stroke}" stroke-width="{sw}"'
        if dash:
            a += f' stroke-dasharray="{dash}"'
        if opacity is not None:
            a += f' opacity="{opacity}"'
        self.add(f'<rect {a}/>')

    def text(self, x, y, s, size=13, fill=None, weight=400, anchor='start', mono=False, italic=False):
        fam = MONO if mono else FONT
        st = ' font-style="italic"' if italic else ''
        self.add(
            f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" font-weight="{weight}" '
            f'fill="{fill or C["ink"]}" text-anchor="{anchor}"{st}>{escape(s)}</text>'
        )

    def lines(self, x, y, rows, size=12, fill=None, gap=None, weight=400, anchor='start', mono=False):
        gap = gap or size + 5
        for i, r in enumerate(rows):
            self.text(x, y + i * gap, r, size, fill, weight, anchor, mono)

    def line(self, x1, y1, x2, y2, stroke=None, sw=1.5, dash=None, arrow=False):
        a = f'x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke or C["ink3"]}" stroke-width="{sw}"'
        if dash:
            a += f' stroke-dasharray="{dash}"'
        if arrow:
            a += ' marker-end="url(#panah)"'
        self.add(f'<line {a}/>')

    def path(self, d, stroke=None, sw=1.5, dash=None, arrow=False, fill='none'):
        a = f'd="{d}" fill="{fill}" stroke="{stroke or C["ink3"]}" stroke-width="{sw}"'
        if dash:
            a += f' stroke-dasharray="{dash}"'
        if arrow:
            a += ' marker-end="url(#panah)"'
        self.add(f'<path {a}/>')

    def circle(self, cx, cy, r, fill=None, stroke=None, sw=1):
        a = f'cx="{cx}" cy="{cy}" r="{r}" fill="{fill or "none"}"'
        if stroke:
            a += f' stroke="{stroke}" stroke-width="{sw}"'
        self.add(f'<circle {a}/>')

    def pill(self, x, y, s, fg, bg, size=11):
        w = int(len(s) * size * 0.58) + 16
        self.rect(x, y, w, size + 9, bg, None, r=(size + 9) / 2)
        self.text(x + w / 2, y + size + 2, s, size, fg, 600, 'middle')
        return w

    def arrow(self, x1, y1, x2, y2, label=None, color=None, dash=None, curve=0, lx=None, ly=None):
        color = color or C['ink3']
        if curve:
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2 + curve
            self.path(f'M{x1},{y1} Q{mx},{my} {x2},{y2}', color, 1.5, dash, True)
        else:
            self.line(x1, y1, x2, y2, color, 1.5, dash, True)
        if label:
            tx = lx if lx is not None else (x1 + x2) / 2
            ty = ly if ly is not None else (y1 + y2) / 2 - 6
            w = int(len(label) * 6.4) + 10
            self.rect(tx - w / 2, ty - 12, w, 17, C['bg'], None, r=4, opacity=0.92)
            self.text(tx, ty, label, 11, C['ink2'], 500, 'middle')

    def save(self, name):
        head = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" '
            f'viewBox="0 0 {self.w} {self.h}" role="img" aria-labelledby="judul ket">'
            f'<title id="judul">{escape(self.title)}</title><desc id="ket">{escape(self.desc)}</desc>'
            '<defs><marker id="panah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
            f'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{C["ink3"]}"/></marker></defs>'
            f'<rect x="0" y="0" width="{self.w}" height="{self.h}" rx="18" fill="{C["bg"]}"/>'
        )
        with open(os.path.join(OUT, name), 'w') as f:
            f.write(head + ''.join(self.parts) + '</svg>\n')
        print('ditulis', name)


def box(s, x, y, w, h, title, sub=None, fill=None, stroke=None, tsize=14):
    s.rect(x, y, w, h, fill or C['panel'], stroke or C['line'], r=12)
    s.text(x + 14, y + 24, title, tsize, C['ink'], 650)
    if sub:
        rows = sub if isinstance(sub, list) else [sub]
        s.lines(x + 14, y + 44, rows, 11.5, C['ink2'])


# ---------------------------------------------------------------- 1. arsitektur
def arsitektur():
    s = Svg(1240, 820, 'Arsitektur sistem Monitor Karya',
            'Peramban, Caddy dan kontainer Next.js di VPS, proxy, App Router, route API, pustaka src/lib, Prisma, PostgreSQL dan Storage Supabase, cron VPS.')
    s.text(32, 46, 'Arsitektur sistem', 24, weight=700)
    s.text(32, 70, 'Satu aplikasi Next.js 16 (App Router) di VPS (Docker + Caddy). PostgreSQL dan penyimpanan berkas bukti di Supabase.', 13, C['ink2'])

    # pengguna
    s.rect(32, 100, 220, 300, C['panel'], C['line'], r=14)
    s.text(48, 128, 'Peramban', 15, weight=700)
    s.lines(48, 152, ['Desktop ≥1024: sidebar / Dock', 'Tablet 600–1023: tab bar mengambang', 'Ponsel <600: tab bar bawah'], 11.5, C['ink2'])
    s.text(48, 222, '9 peran', 13, weight=650)
    s.lines(48, 242, ['PIC proyek · Kepala divisi', 'Admin PT · Direktur entitas', 'Direksi SDM & GA · Manajemen', 'TI · Super Admin · Auditor'], 11.5, C['ink2'])
    s.text(48, 330, 'Cookie sesi HMAC', 12, C['ink2'], 600)
    s.text(48, 348, '__Host-mk_session (produksi)', 11, C['ink3'], mono=True)
    s.text(48, 378, 'Tema & aksen: localStorage', 11.5, C['ink3'])

    # cron
    s.rect(32, 430, 220, 160, C['panel'], C['line'], r=14)
    s.text(48, 458, 'Cron VPS (cron.sh)', 15, weight=700)
    s.lines(48, 480, ['remind-divisions', '  09.00 WIB Sen–Jum', 'reminder-rules', '  tiap 30 mnt 07–18', 'kpi-snapshot', '  17.30 WIB setiap hari'], 11, C['ink2'], gap=15, mono=True)

    # vercel container
    s.rect(290, 100, 640, 690, C['panel2'], C['line'], r=16, dash='6 5')
    s.text(310, 128, 'VPS aplikasi · Caddy (HTTPS) → kontainer non-root, read-only · Next.js 16.3.8 + React 19', 13, C['ink2'], 650)

    s.rect(310, 145, 600, 92, C['accSoft'], C['acc'], r=12)
    s.text(326, 170, 'src/proxy.ts  (pengganti middleware)', 14, C['acc'], 700)
    s.lines(326, 192, ['CSRF: Origin / Sec-Fetch-Site untuk POST·PUT·PATCH·DELETE  ·  batas badan 1 MB (unggah 21 MB)',
                       'CSP bernonce (ditegakkan di produksi)  ·  /pratinjau → 404 di produksi'], 11.5, C['ink2'])

    s.rect(310, 255, 290, 230, C['panel'], C['line'], r=12)
    s.text(326, 280, 'Halaman (App Router)', 14, weight=700)
    s.lines(326, 302, ['/            → AppShell (sesi wajib)', '/login       → LoginForm', '/login/ganti-sandi → wajib ganti', '/pratinjau   → PreviewApp (dev)'], 11, C['ink2'], mono=True)
    s.text(326, 384, 'src/components', 12, weight=650)
    s.lines(326, 402, ['shell.tsx · dock.tsx · search (⌘K)', 'views/* (satu per tab)', 'mk/* (sistem desain)', 'work-desk · pic · kadiv · admin', 'oversight · group · companies'], 11, C['ink2'], gap=15)

    s.rect(620, 255, 290, 230, C['panel'], C['line'], r=12)
    s.text(636, 280, 'Route API  src/app/api', 14, weight=700)
    s.lines(636, 302, ['68 route.ts, semuanya:', '  requireApiUser() + can(...)', '  + cakupan entitas/divisi/proyek', '  + AuditLog untuk mutasi', 'Laporan: daily-input, tasks,', '  weekly-input, inbox, evidence', 'Peran: outputs, kadiv/*, admin/*,', '  approval-requests, system/grup', 'Lintas: ringkasan, search, undo'], 11, C['ink2'])

    s.rect(310, 505, 600, 150, C['panel'], C['line'], r=12)
    s.text(326, 530, 'Pustaka bersama  src/lib', 14, weight=700)
    cols = [
        ['auth.ts  sesi, cakupan', 'rbac.ts  peran → tab, kapabilitas', 'security.ts  laju, teks aman', 'password-policy.ts  min. 8'],
        ['lock.ts  17.00 WIB, Kamis/Jumat', 'project-status.ts  status proyek', 'daily-rollup.ts  dailyGate, beku', 'undo.ts  Urungkan 15 menit'],
        ['pic-access.ts · kadiv.ts', 'oversight.ts · group-panel.ts', 'reminders-pic · reminder-rules', 'kpi-math · admin-compliance'],
    ]
    for i, c in enumerate(cols):
        s.lines(326 + i * 196, 554, c, 11, C['ink2'], gap=18, mono=False)
    s.text(326, 640, 'Semua tenggat dihitung dari jam WIB (UTC+7); kunci diturunkan dari jam, bukan dari cron.', 11.5, C['ink3'])

    s.rect(310, 675, 600, 95, C['infoSoft'], C['info'], r=12)
    s.text(326, 700, 'Prisma Client 6', 14, C['info'], 700)
    s.lines(326, 722, ['prisma/schema.prisma · 43 model · migrasi 0001–0025 (0013–0025 belum diterapkan)',
                       'DATABASE_URL (pooler 6543) untuk aplikasi · DIRECT_URL (5432) untuk migrasi'], 11.5, C['ink2'])

    # supabase
    s.rect(965, 100, 245, 690, C['panel2'], C['line'], r=16, dash='6 5')
    s.text(983, 128, 'Supabase', 15, C['ink2'], 700)
    s.rect(983, 330, 210, 310, C['panel'], C['line'], r=12)
    s.text(999, 356, 'PostgreSQL', 14, weight=700)
    s.lines(999, 378, ['RLS aktif di semua tabel,', 'tanpa policy: akses hanya', 'lewat Prisma di server.', '', 'Organisasi · Pengguna', 'Proyek · Laporan harian', 'Laporan mingguan · Output', 'Eskalasi · Buka kunci', 'AuditLog · NotificationLog', '', 'Sasaran pindah: VPS basis', 'data (deploy/db-vps)'], 11.5, C['ink2'])
    s.rect(983, 150, 210, 160, C['panel'], C['line'], r=12)
    s.text(999, 176, 'Storage', 14, weight=700)
    s.lines(999, 198, ['bucket privat "evidence"', 'unggah lewat server', '(SUPABASE_SERVICE_ROLE_KEY)', 'URL bertanda tangan 5 menit', 'maks 20 MB per berkas'], 11.5, C['ink2'])
    s.rect(983, 660, 210, 110, C['panel'], C['line'], r=12)
    s.text(999, 686, 'Tanpa Supabase Auth', 13, weight=700)
    s.lines(999, 706, ['Masuk memakai tabel User', '(scrypt) + cookie HMAC', 'AUTH_SECRET'], 11.5, C['ink2'])

    # arrows
    s.arrow(252, 190, 310, 190, 'HTTPS')
    s.arrow(252, 510, 620, 470, curve=40)
    s.text(48, 612, 'Bearer CRON_SECRET →', 11, C['ink2'], 600)
    s.arrow(610, 237, 610, 255)
    s.arrow(455, 237, 455, 255)
    s.arrow(600, 340, 620, 340, None)
    s.arrow(765, 485, 765, 505)
    s.arrow(610, 655, 610, 675)
    s.arrow(910, 720, 983, 560, 'SQL', lx=946, ly=650)
    s.arrow(910, 560, 983, 240, 'Storage', lx=946, ly=330)
    s.save('arsitektur.svg')


# ---------------------------------------------------------------- 2. alur harian & mingguan
def swim(s, x, y, w, lanes, lane_h, head_w=150):
    for i, (name, sub) in enumerate(lanes):
        yy = y + i * lane_h
        s.rect(x, yy, w, lane_h - 8, C['panel'] if i % 2 == 0 else C['panel2'], C['line2'], r=12)
        s.text(x + 16, yy + 28, name, 14, weight=700)
        if sub:
            s.lines(x + 16, yy + 48, sub, 11, C['ink3'])
    s.line(x + head_w, y + 6, x + head_w, y + len(lanes) * lane_h - 14, C['line2'], 1)


def step(s, x, y, w, h, title, sub=None, tone=None):
    fill, stroke, fg = C['panel'], C['line'], C['ink']
    if tone == 'acc':
        fill, stroke, fg = C['accSoft'], C['acc'], C['acc']
    elif tone == 'ok':
        fill, stroke, fg = C['okSoft'], C['ok'], C['ok']
    elif tone == 'warn':
        fill, stroke, fg = C['warnSoft'], C['warn'], C['warn']
    elif tone == 'info':
        fill, stroke, fg = C['infoSoft'], C['info'], C['info']
    s.rect(x, y, w, h, fill, stroke, r=10)
    s.text(x + 10, y + 20, title, 12.5, fg, 650)
    if sub:
        s.lines(x + 10, y + 37, sub if isinstance(sub, list) else [sub], 10.5, C['ink2'], gap=14)


def alur_harian():
    s = Svg(1320, 700, 'Alur antarperan laporan harian',
            'PIC menyusun tugas dan laporan sebelum 17.00 WIB dan mengirimnya langsung ke Admin PT, Admin PT meneruskan ke holding sehingga laporan dibekukan, perubahan sesudahnya lewat buka kunci.')
    s.text(32, 46, 'Alur antarperan · laporan harian', 24, weight=700)
    s.text(32, 70, 'Setiap hari kerja (Senin–Jumat WIB). Dikirim langsung ke Admin PT; kepala divisi hanya melihat. Tenggat 17.00 WIB.', 13, C['ink2'])
    lanes = [('PIC proyek', ['Laporan harian', 'Meja kerja']), ('Sistem', ['src/lib/lock.ts', 'daily-rollup.ts']),
             ('Admin PT', ['Meja kerja', 'Penerimaan']), ('Holding', ['Direktur · Manajemen', 'Ringkasan'])]
    X, Y, LH = 32, 96, 145
    swim(s, X, Y, 1256, lanes, LH)
    sx = X + 170
    # PIC lane
    step(s, sx, Y + 22, 170, 92, '1. Susun tugas hari ini', ['POST/PUT /api/tasks', 'centang, progres, kendala', 'subtugas (langkah)'])
    step(s, sx + 200, Y + 22, 180, 92, '3. Isi laporan + bukti', ['capaian; Kendala & Rencana', 'besok selalu tampil; bukti', 'min. 1 (kecuali "Tidak ada…")'])
    step(s, sx + 410, Y + 22, 170, 92, '4. Kirim laporan', ['PUT /api/daily-input', 'action: submit', 'sebelum 17.00 WIB'], 'acc')
    step(s, sx + 610, Y + 22, 190, 92, 'Ajukan buka kunci', ['POST /api/unlock-requests', 'alasan ≥ 10 karakter; setuju', 'SDM GA, jalankan TI'], 'warn')
    step(s, sx + 830, Y + 22, 220, 92, 'PIC melihat status', ['"Terkirim HH.MM" lalu', '"Diteruskan ke holding"', 'badge nav "Laporan harian" hilang'])
    # Sistem lane
    sy = Y + LH
    step(s, sx + 30, sy + 22, 200, 92, '2. Rollup otomatis', ['status & progres laporan', 'diturunkan dari tugas', '(computeRollup)'], 'info')
    step(s, sx + 410, sy + 22, 170, 92, 'Validasi', ['validateDailyReport', 'galat → 422 + daftar'], 'info')
    step(s, sx + 610, sy + 22, 190, 92, 'Terkunci / dibekukan', ['17.00 WIB atau diteruskan:', 'dailyGate → 409 untuk', 'ubah, kirim ulang, hapus'], 'warn')
    step(s, sx + 830, sy + 22, 220, 92, '16.30 pengingat otomatis', ['ReminderRule HARIAN', 'cron reminder-rules (VPS,', 'tiap 30 menit, 07–18 WIB)'])
    # Admin lane
    ay = Y + 2 * LH
    step(s, sx + 200, ay + 22, 180, 92, 'Ingatkan PIC', ['POST /api/work-desk', 'remind-pic / remind-all-pics', 'sekali per proyek per hari'], 'warn')
    step(s, sx + 410, ay + 22, 170, 92, '5. Baris jadi "Masuk"', ['Meja kerja &', 'Ringkasan Admin', '(countDailyIntake)'])
    step(s, sx + 610, ay + 22, 190, 92, '6. Teruskan ke holding', ['POST /api/inbox kind=daily', 'forwardedAt + isLocked', 'Urungkan ≤ 15 menit'], 'acc')
    # Holding lane
    hy = Y + 3 * LH
    step(s, sx + 610, hy + 22, 190, 92, '7. Ringkasan pengawas', ['GET /api/ringkasan', 'kepatuhan per PT,', 'status proyek'], 'ok')
    step(s, sx + 830, hy + 22, 220, 92, 'Proyek bermasalah', ['deriveProjectStatus:', 'Terlambat · Perlu perhatian', '→ eskalasi bila perlu'])
    # arrows
    s.arrow(sx + 170, Y + 68, sx + 200, Y + 68)
    s.arrow(sx + 85, Y + 114, sx + 110, sy + 22)
    s.arrow(sx + 230, sy + 50, sx + 290, Y + 114, curve=-10)
    s.arrow(sx + 380, Y + 68, sx + 410, Y + 68)
    s.arrow(sx + 495, Y + 114, sx + 495, sy + 22)
    s.arrow(sx + 495, sy + 114, sx + 495, ay + 22)
    s.arrow(sx + 580, ay + 68, sx + 610, ay + 68)
    s.arrow(sx + 705, ay + 114, sx + 705, hy + 22)
    s.arrow(sx + 800, ay + 50, sx + 830, Y + 100, curve=-30)
    s.arrow(sx + 290, ay + 22, sx + 290, Y + 114, 'notifikasi', dash='5 4', lx=sx + 290, ly=sy + 140)
    s.arrow(sx + 800, hy + 68, sx + 830, hy + 68)
    s.arrow(sx + 705, sy + 22, sx + 705, Y + 114, None, dash='5 4')
    s.text(32, 690, 'Garis putus-putus = notifikasi atau jalur kembali. Laporan yang sudah diteruskan dibekukan (409); perubahan hanya lewat buka kunci yang disetujui dan dijalankan.', 11.5, C['ink3'])
    s.save('alur-laporan-harian.svg')


def alur_mingguan():
    s = Svg(1320, 700, 'Alur antarperan capaian mingguan',
            'Kepala divisi mengisi papan capaian, menyerahkan Kamis 17.00, menyetujui dari Menunggu persetujuan, Admin PT meneruskan sebelum Jumat 17.00, kepala divisi mengirim ringkasan ke Direktur, Direktur membaca dan menanggapi.')
    s.text(32, 46, 'Alur antarperan · capaian mingguan divisi', 24, weight=700)
    s.text(32, 70, 'Minggu ISO berjalan (Senin 00.00 – Minggu 23.59 WIB). Serah Kamis 17.00 WIB, kunci Jumat 17.00 WIB.', 13, C['ink2'])
    lanes = [('Kepala divisi', ['Capaian mingguan', 'Meja kerja']), ('Sistem', ['lock.ts', 'reminders.ts']),
             ('Admin PT', ['Penerimaan', 'Divisi']), ('Holding', ['Direktur · Manajemen', 'Ringkasan'])]
    X, Y, LH = 32, 96, 145
    swim(s, X, Y, 1256, lanes, LH)
    sx = X + 170
    step(s, sx, Y + 22, 175, 92, '1. Isi papan capaian', ['PUT /api/weekly-input', 'kartu per hari + lajur', '"Mingguan"; seret-lepas'])
    step(s, sx + 205, Y + 22, 175, 92, '2. Lampirkan bukti', ['Selesai/Berjalan/', 'Terkendala wajib bukti;', 'Belum mulai & N/A tidak'])
    step(s, sx + 410, Y + 22, 175, 92, '3. Serahkan', ['POST /api/weekly-input', 'action: submit', 'Kamis 17.00 WIB'], 'acc')
    step(s, sx + 615, Y + 22, 175, 92, '4. Setujui', ['POST action: approve', 'hanya dari MENUNGGU_', 'PERSETUJUAN → DISETUJUI'], 'acc')
    sy = Y + LH
    step(s, sx + 410, sy + 22, 175, 92, 'Validasi item', ['validateWeeklyItem', 'bukti dihitung dari', 'tabel Evidence → 422'], 'info')
    step(s, sx + 820, sy + 22, 200, 92, 'Jumat 17.00: terkunci', ['isWeeklyLocked', 'minggu lalu hanya baca', 'buka kunci: UnlockRequest'], 'warn')
    step(s, sx, sy + 22, 200, 92, 'Pengingat 09.00 WIB', ['cron remind-divisions', 'Senin–Jumat, divisi yang', 'belum menyerahkan'])
    ay = Y + 2 * LH
    step(s, sx + 615, ay + 22, 175, 92, '5. Teruskan ke holding', ['POST /api/inbox', 'kind=weekly, lalu beku', 'sebelum Jumat 17.00'], 'acc')
    step(s, sx + 205, ay + 22, 175, 92, 'Ingatkan divisi', ['POST /api/notifications/', 'remind { divisionId, week }', 'Admin PT · Direktur'], 'warn')
    hy = Y + 3 * LH
    step(s, sx + 615, hy + 22, 175, 92, '6. Baca laporan', ['Direktur: lencana Terkirim', '/ Terlambat masuk /', 'Belum masuk / Sudah dibaca'], 'ok')
    step(s, sx + 820, hy + 22, 200, 92, '8. Baca & tanggapi', ['ringkasan kepala divisi,', 'Beri tanggapan (weekly-', 'comments), tandai dibaca'], 'ok')
    step(s, sx + 820, Y + 22, 200, 92, '7. Ringkasan ke Direktur', ['POST /api/kadiv/weekly-summary', 'action: send · 3 poin', '(WeeklyDivisionSummary)'])
    s.path(f'M{sx + 1020},{Y + 68} L{sx + 1046},{Y + 68} L{sx + 1046},{hy + 68} L{sx + 1022},{hy + 68}', C['ink3'], 1.5, None, True)
    s.arrow(sx + 175, Y + 68, sx + 205, Y + 68)
    s.arrow(sx + 380, Y + 68, sx + 410, Y + 68)
    s.arrow(sx + 585, Y + 68, sx + 615, Y + 68, 'MENUNGGU_PERSETUJUAN', lx=sx + 600, ly=Y + 16)
    s.arrow(sx + 497, Y + 114, sx + 497, sy + 22)
    s.arrow(sx + 702, Y + 114, sx + 702, ay + 22)
    s.arrow(sx + 702, ay + 114, sx + 702, hy + 22)
    s.arrow(sx + 790, hy + 68, sx + 820, hy + 68)
    s.arrow(sx + 100, sy + 22, sx + 100, Y + 114, 'notifikasi', dash='5 4', lx=sx + 100, ly=Y + 132)
    s.arrow(sx + 292, ay + 22, sx + 292, Y + 114, None, dash='5 4')
    s.text(32, 690, 'Status: DRAFT → MENUNGGU_PERSETUJUAN → DISETUJUI → diteruskan (beku) → TERKUNCI. Serah Kamis 17.00, kunci Jumat 17.00 WIB. Ringkasan ke Direktur terpisah dari capaian.', 11.5, C['ink3'])
    s.save('alur-laporan-mingguan.svg')


# ---------------------------------------------------------------- 3. ERD
ERD_COLS = [
    (40, 'Organisasi', [
        ('Entity', ['id', 'parentId → Entity', 'type HOLDING…PT·UNIT', 'code, name, path', 'logoData, alamat, kontak'], None),
        ('Division', ['id', 'entityId → Entity', 'divisionTypeId → DivisionType', 'name', 'headUserId → User'], None),
        ('DivisionType', ['id, code, name'], None),
        ('AdminAppointment', ['entityId → Entity', 'kind, skNumber', 'validFrom/Until, status'], None),
        ('WorkCalendar · Holiday', ['date, name, scope'], None),
        ('AspectCategory · Priority', ['data induk item mingguan'], None),
    ]),
    (360, 'Pengguna & akses', [
        ('User', ['id, username, email', 'name, title, phone', 'role (9 peran)', 'scopeEntityId', 'passwordHash (scrypt)', 'divisionId → Division', 'mustChangePassword', 'isActive, lastLoginAt'], '0015·0018'),
        ('Attendance', ['userId → User', 'date (tengah malam WIB)', 'status HADIR·TERLAMBAT', '  ·CUTI·SAKIT·IZIN (0023)', 'recordedById → User'], '0015'),
        ('AccessRequest', ['type AKUN_BARU · AKSES_SEMENTARA', '     · PINDAH_PERAN', 'payload JSON, entityId', 'requestedById, targetUserId → User', 'status, expiresAt, appliedData'], '0016'),
        ('ReminderRule', ['entityId, kind (4 jenis)', 'enabled, time, weekday', 'lastRunAt, updatedById → User'], '0016'),
    ]),
    (680, 'Proyek', [
        ('Project', ['id, code, name', 'entityId → Entity', 'lifecycle, phase', 'picUserId → User', 'targetEndDate', 'approvalChain[]', 'divisionId → Division'], '0015'),
        ('ProjectApproval', ['role (slot), decision, note'], None),
        ('ProjectEntity', ['entityId (PT terkait)'], None),
        ('Output', ['ownerId → User, reviewerId', 'status DIKERJAKAN', '  · MENUNGGU_REVIEW', '  · PERLU_REVISI · DITERIMA', 'dueDate, revisionNote'], '0013'),
        ('ProjectStage', ['name, position', 'startDate, dueDate, status'], '0014'),
        ('ProjectNote', ['authorId → User, body, readAt'], '0014'),
        ('DeadlineProposal', ['previousDate, proposedDate', 'reason, status', 'proposedById, decidedById'], '0014'),
    ]),
    (1000, 'Laporan harian & bukti', [
        ('DailyProjectReport', ['projectId, entityId', 'reportDate (WIB), unik/proyek', 'status, progressPct', 'achievementToday, obstacle', 'submittedAt, forwardedAt', 'isLocked, isLate'], None),
        ('Task', ['projectId, workDate', 'status, progressPct, urgency', 'picUserId, scope, sortOrder', 'escalationId → Escalation'], None),
        ('Subtask', ['taskId? | weeklyItemId?', 'title, isDone, position'], None),
        ('ProjectProgressReport', ['projectId, cadence', 'MINGGUAN · BULANAN, periodKey'], None),
        ('Evidence', ['targetType + targetId', '(polimorfik, tanpa FK)', 'storageKey | url, mime, size'], None),
    ]),
    (1320, 'Mingguan & kendali', [
        ('WeeklyDivisionReport', ['divisionId → Division', 'isoYear, isoWeek', 'statusHeader DRAFT → TERKUNCI', 'submittedAt, approvedAt', 'forwardedAt, isLocked'], None),
        ('WeeklyReportItem', ['weeklyReportId', 'workItem, status, progressPct', 'workDate?, position', 'priorityId, aspectCategoryId'], None),
        ('WeeklyReportRead', ['weeklyReportId, userId, readAt', 'tanpa FK (sengaja)'], '0017'),
        ('Escalation', ['sourceType, sourceId, entityId', 'status DIAJUKAN → DITUTUP', 'needed, slaDays (7)'], None),
        ('UnlockRequest', ['targetType, targetId', 'status, unlockUntil'], None),
        ('AuditLog · NotificationLog', ['actorId, action, before/after', 'userId, template, payload, readAt'], None),
    ]),
    (1640, 'Fitur F1–F2 (0019–0025)', [
        ('NoteRead', ['noteId → ProjectNote', 'userId, readAt (per akun)'], '0019'),
        ('OutputRevision', ['outputId → Output', 'note, reviewerId', 'undoneAt (riwayat revisi)'], '0019'),
        ('WeeklyDivisionSummary', ['divisionId, isoYear, isoWeek', 'status DRAF · TERKIRIM', 'points[] (1–3), angka potret', 'sentAt, sentById'], '0021'),
        ('DailyReportRead', ['dailyReportId, userId', 'readAt (tanda baca kadiv)'], '0021'),
        ('WeeklyReportComment', ['weeklyReportId, authorId', 'body, readAt'], '0023'),
        ('ProjectReview', ['projectId, reviewerId', 'note, reviewedAt'], '0023'),
        ('ApprovalRequest', ['type MATERI·ANGGARAN·CUTI', 'entityId, divisionId, projectId', 'amount, startDate, endDate', 'status DIAJUKAN → DISETUJUI', 'fileKey (Supabase Storage)'], '0023'),
        ('UndoToken', ['action, targetType, targetId', 'actorId, snapshot, stamp', 'expiresAt (15 mnt), usedAt'], '0025'),
    ]),
]
ERD_W = 260


def erd_h(fields):
    return 34 + len(fields) * 17 + 8


def erd():
    s = Svg(1960, 1070, 'Diagram relasi model data',
            'Model Prisma utama dikelompokkan per area, termasuk model baru dari migrasi 0013 sampai 0025.')
    s.text(40, 50, 'Model data (prisma/schema.prisma)', 24, weight=700)
    s.text(40, 76, 'Kolom kunci saja. Bingkai biru = model/kolom baru migrasi 0013–0025 (belum diterapkan). Relasi lain dibaca dari panah "→" di kolom; model F1–F2 tanpa panah sengaja tanpa FK.', 13, C['ink2'])
    box_at = {}
    late_labels = []
    for x, head, models in ERD_COLS:
        s.text(x, 108, head.upper(), 11, C['ink3'], 700)
        y = 122
        for name, fields, tag in models:
            h = erd_h(fields)
            box_at[name] = (x, y, ERD_W, h, fields, tag)
            y += h + (40 if name == 'Project' else 22)

    def R(n, frac=0.5):
        x, y, w, h, _, _ = box_at[n]
        return x + w, y + h * frac

    def L(n, frac=0.5):
        x, y, w, h, _, _ = box_at[n]
        return x, y + h * frac

    def T(n, frac=0.5):
        x, y, w, h, _, _ = box_at[n]
        return x + w * frac, y

    def B(n, frac=0.5):
        x, y, w, h, _, _ = box_at[n]
        return x + w * frac, y + h

    def label(lx, ly, t):
        w = int(len(t) * 6) + 12
        s.rect(lx - w / 2, ly - 11, w, 16, C['bg'], None, r=4)
        s.text(lx, ly + 1, t, 10.5, C['ink2'], 500, 'middle')

    def vert(a, b, t=None, fa=0.5):
        x1, y1 = B(a, fa)
        x2, y2 = T(b, fa)
        s.line(x1, y1, x2, y2, C['ink3'], 1.3)
        s.circle(x2, y2, 3.5, C['ink3'])
        if t:
            label(x1 + 26, (y1 + y2) / 2 + 4, t)

    def ortho(p1, p2, cx, t=None, ty=None):
        (x1, y1), (x2, y2) = p1, p2
        s.path(f'M{x1},{y1} L{cx},{y1} L{cx},{y2} L{x2},{y2}', C['ink3'], 1.3)
        s.circle(x2, y2, 3.5, C['ink3'])
        if t:
            label(cx, ty if ty is not None else (y1 + y2) / 2, t)

    vert('Entity', 'Division', '1—n')
    x1, y1 = T('DivisionType', 0.3)
    x2, y2 = B('Division', 0.3)
    s.line(x1, y1, x2, y2, C['ink3'], 1.3)
    s.circle(x2, y2, 3.5, C['ink3'])
    ortho(R('Division', 0.45), L('User', 0.78), 330, None)
    late_labels.append((330, (box_at['Division'][1] + box_at['Division'][3] * 0.45 + box_at['User'][1] + box_at['User'][3] * 0.78) / 2, 'anggota'))
    ortho(R('User', 0.55), L('Project', 0.55), 660, None)
    late_labels.append((660, box_at['User'][1] + box_at['User'][3] * 0.55 - 10, 'PIC'))
    vert('User', 'Attendance', '1—n', 0.3)
    ortho(R('Project', 0.25), L('DailyProjectReport', 0.25), 970, None)
    late_labels.append((970, box_at['Project'][1] + box_at['Project'][3] * 0.25 - 10, '1—n/hari'))
    ortho(R('Project', 0.7), L('Task', 0.3), 980, None)
    vert('Task', 'Subtask', '1—n', 0.4)
    vert('WeeklyDivisionReport', 'WeeklyReportItem', '1—n')
    ortho(L('WeeklyReportItem', 0.75), R('Subtask', 0.5), 1300, None)
    ortho(R('Task', 0.85), L('Escalation', 0.3), 1285, None)
    # bus anak Project
    px, py, pw, ph, _, _ = box_at['Project']
    bus_x = px + 16
    last = box_at['DeadlineProposal']
    s.path(f'M{bus_x},{py + ph} L{bus_x},{last[1] + 20}', C['ink3'], 1.3)
    for n in ('ProjectApproval', 'ProjectEntity', 'Output', 'ProjectStage', 'ProjectNote', 'DeadlineProposal'):
        yy = box_at[n][1] + 20
        s.path(f'M{bus_x},{yy} L{px + 30},{yy}', C['ink3'], 1.3)
    label(bus_x + 60, py + ph + 20, 'projectId → Project')

    for name, (x, y, w, h, fields, tag) in box_at.items():
        indent = 30 if name in ('ProjectApproval', 'ProjectEntity', 'Output', 'ProjectStage', 'ProjectNote', 'DeadlineProposal') else 0
        x2, w2 = x + indent, w - indent
        new = tag is not None and name not in ('User', 'Project')
        s.rect(x2, y, w2, h, C['panel'], C['info'] if new else C['line'], r=10, sw=1.6 if new else 1)
        s.rect(x2 + 1, y + 1, w2 - 2, 27, C['infoSoft'] if new else C['panel2'], None, r=9)
        s.text(x2 + 12, y + 19, name, 13, C['ink'], 700)
        if tag:
            pt = ('baru ' if new else 'kolom ') + tag
            s.pill(x2 + w2 - (int(len(pt) * 10 * 0.58) + 16) - 6, y + 5, pt, C['info'], C['panel'], 10)
        for i, fl in enumerate(fields):
            col = C['info'] if (name in ('User', 'Project') and ('divisionId' in fl or 'mustChange' in fl)) else C['ink2']
            s.text(x2 + 12, y + 46 + i * 17, fl, 11.5, col, mono=True)
    for lx, ly, t in late_labels:
        label(lx, ly, t)
    s.text(40, 1046, 'Evidence tidak memakai FK: targetType + targetId menunjuk laporan harian, item mingguan, tugas, laporan kemajuan, atau output. Akses dijaga src/lib/evidence-access.ts.', 11.5, C['ink3'])
    s.save('model-data.svg')


# ---------------------------------------------------------------- 4. peta navigasi per peran
ROLE_TABS = {
    'PIC proyek': ['dashboard', 'work-desk', 'daily-input', 'projects'],
    'Kepala divisi': ['dashboard', 'work-desk', 'weekly-input', 'divisions'],
    'Admin PT': ['dashboard', 'work-desk', 'inbox', 'daily-input', 'projects', 'divisions', 'escalations'],
    'Direktur entitas': ['dashboard', 'projects', 'divisions', 'escalations', 'approvals', 'entities'],
    'Direksi SDM & GA': ['dashboard', 'projects', 'divisions', 'escalations', 'entities', 'audit'],
    'Manajemen': ['dashboard', 'escalations', 'projects', 'divisions', 'approvals', 'entities', 'audit'],
    'Auditor': ['dashboard', 'projects', 'divisions', 'entities', 'audit'],
    'TI': ['dashboard', 'work-desk', 'inbox', 'daily-input', 'weekly-input', 'projects', 'divisions', 'escalations', 'entities', 'audit', 'system'],
    'Super Admin': ['dashboard', 'companies', 'projects', 'divisions', 'escalations', 'entities', 'work-desk', 'inbox', 'daily-input', 'weekly-input', 'audit', 'system'],
}
# Salinan ROLE_COMPACT_TABS (src/lib/rbac.ts): tab utama tablet & ponsel untuk peran ini.
COMPACT = {
    'Direktur entitas': ['dashboard', 'projects', 'escalations', 'divisions'],
    'Manajemen': ['dashboard', 'projects', 'approvals', 'divisions'],
}
TABS = [('dashboard', 'Ringkasan'), ('companies', 'Perusahaan & akun'), ('work-desk', 'Meja kerja'), ('daily-input', 'Laporan harian'),
        ('weekly-input', 'Capaian mingguan'), ('inbox', 'Penerimaan'), ('projects', 'Proyek'), ('divisions', 'Divisi'),
        ('approvals', 'Persetujuan'), ('escalations', 'Eskalasi'), ('entities', 'Entitas'), ('audit', 'Log aktivitas'), ('system', 'Sistem & akses')]


def navigasi():
    cw, rh, x0, y0 = 92, 46, 210, 190
    W = x0 + cw * len(TABS) + 40
    H = y0 + rh * len(ROLE_TABS) + 170
    s = Svg(W, H, 'Peta navigasi per peran', 'Tab yang terlihat untuk tiap peran menurut ROLE_TABS di src/lib/rbac.ts, diurutkan seperti NAV_TABS; tanda menunjukkan tab pembuka, tab bar ponsel, dan menu Lainnya.')
    s.text(32, 46, 'Peta navigasi per peran', 24, weight=700)
    s.text(32, 70, 'Siapa melihat tab apa: ROLE_TABS (src/lib/rbac.ts). Urutan tampil mengikuti NAV_TABS (src/lib/constants.ts); angka = posisi di sidebar.', 13, C['ink2'])
    order = [t for t, _ in TABS]
    for j, (tid, lab) in enumerate(TABS):
        cx = x0 + j * cw + cw / 2
        words = lab.split(' ')
        if len(words) > 1 and len(lab) > 10:
            s.text(cx, y0 - 34, ' '.join(words[:-1]), 11.5, C['ink2'], 650, 'middle')
            s.text(cx, y0 - 18, words[-1], 11.5, C['ink2'], 650, 'middle')
        else:
            s.text(cx, y0 - 18, lab, 11.5, C['ink2'], 650, 'middle')
        s.text(cx, y0 - 54, tid, 9.5, C['ink3'], 400, 'middle', mono=True)
    for i, (role, tabs) in enumerate(ROLE_TABS.items()):
        shown = [t for t in order if t in tabs]
        phone = COMPACT.get(role) or (shown if len(shown) <= 4 else shown[:3])
        y = y0 + i * rh
        s.rect(24, y, W - 48, rh - 6, C['panel'] if i % 2 == 0 else C['panel2'], C['line2'], r=8)
        s.text(40, y + 26, role, 13, C['ink'], 650)
        for j, (tid, _) in enumerate(TABS):
            cx = x0 + j * cw + cw / 2
            if tid in shown:
                k = shown.index(tid) + 1
                first = tid == tabs[0]
                in_phone = tid in phone
                s.circle(cx, y + 20, 13, C['acc'] if first else (C['accSoft'] if in_phone else C['panel']), C['acc'], 1.4)
                s.text(cx, y + 24.5, str(k), 12, C['panel'] if first else C['acc'], 700, 'middle')
            else:
                s.circle(cx, y + 20, 2.5, C['line'])
    ly = y0 + len(ROLE_TABS) * rh + 30
    s.circle(44, ly, 11, C['acc'], C['acc'])
    s.text(44, ly + 4, '1', 11, C['panel'], 700, 'middle')
    s.text(64, ly + 4, 'tab pembuka (ROLE_TABS[0])', 12, C['ink2'])
    s.circle(274, ly, 11, C['accSoft'], C['acc'])
    s.text(274, ly + 4, '2', 11, C['acc'], 700, 'middle')
    s.text(294, ly + 4, 'di tab bar ponsel', 12, C['ink2'])
    s.circle(444, ly, 11, C['panel'], C['acc'])
    s.text(444, ly + 4, '5', 11, C['acc'], 700, 'middle')
    s.text(464, ly + 4, 'di "Lainnya" pada ponsel · tetap di sidebar/Dock', 12, C['ink2'])
    s.text(32, ly + 40, 'Ponsel: ≤4 tab tampil semua (+ "Tampilan"); lebih dari 4 → 3 tab pertama + "Lainnya". Tablet: ≤5 tab tampil semua; lebih → 4 pertama + "Lainnya". Direktur & Manajemen: ROLE_COMPACT_TABS.', 11.5, C['ink3'])
    s.text(32, ly + 60, 'Label "Ringkasan" untuk PIC proyek tampil sebagai "Hari ini". Kerangka: src/components/shell.tsx (sidebar ≥1024, tab bar 600–1023, tab bar bawah <600) atau Dock.', 11.5, C['ink3'])
    s.text(32, ly + 80, 'Catatan: kepala divisi tanpa ROLE_TABS "projects"; auditor tanpa "escalations"; TI tanpa "companies". Tab = tampilan; API tetap memeriksa kapabilitas sendiri.', 11.5, C['ink3'])
    s.save('navigasi-peran.svg')


# ---------------------------------------------------------------- 5. wireframe
def wf_desktop(s, x, y, spec):
    W, H = 760, 560
    s.rect(x, y, W, H, C['panel'], C['line'], r=14)
    # sidebar
    s.rect(x, y, 170, H, C['panel2'], None, r=14)
    s.line(x + 170, y, x + 170, y + H, C['line2'], 1)
    s.rect(x + 14, y + 16, 26, 26, C['accSoft'], C['acc'], r=7)
    s.text(x + 48, y + 28, 'Monitor Karya', 11.5, weight=700)
    s.text(x + 48, y + 41, spec['role'], 9.5, C['ink3'])
    for i, it in enumerate(spec['side']):
        yy = y + 62 + i * 30
        active = i == spec.get('active', 0)
        if active:
            s.rect(x + 10, yy, 150, 24, C['accSoft'], C['acc'], r=7)
        s.rect(x + 20, yy + 7, 10, 10, None, C['acc'] if active else C['ink3'], r=3)
        label = it
        badge = None
        if '|' in it:
            label, badge = it.split('|')
        s.text(x + 38, yy + 16, label, 10.5, C['acc'] if active else C['ink2'], 600 if active else 400)
        if badge:
            s.circle(x + 148, yy + 12, 7, C['acc'])
            s.text(x + 148, yy + 15.5, badge, 9, C['panel'], 700, 'middle')
    s.rect(x + 10, y + H - 120, 150, 66, C['panel'], C['line2'], r=8)
    s.text(x + 18, y + H - 102, 'Tampilan', 9.5, C['ink3'])
    s.rect(x + 18, y + H - 94, 134, 16, C['panel2'], C['line2'], r=5)
    s.text(x + 85, y + H - 82.5, 'Terang · Gelap · Sistem', 8.5, C['ink3'], anchor='middle')
    for k in range(6):
        s.circle(x + 26 + k * 20, y + H - 64, 6, [C['acc'], C['d1'], C['d2'], C['d4'], C['d5'], C['line']][k])
    s.circle(x + 26, y + H - 28, 11, C['accSoft'], C['acc'])
    s.text(x + 44, y + H - 24, 'Profil · keluar', 10, C['ink2'])
    # main
    mx = x + 194
    mw = W - 194 - 22
    s.text(mx, y + 28, spec['context'], 9.5, C['ink3'])
    s.text(mx, y + 52, spec['title'], 19, weight=700)
    if spec.get('header_right'):
        s.rect(mx + mw - 170, y + 34, 130, 24, C['panel2'], C['line'], r=12)
        s.text(mx + mw - 105, y + 50, spec['header_right'], 9.5, C['ink2'], 600, 'middle')
    s.circle(mx + mw - 14, y + 46, 12, C['panel2'], C['line'])
    # hero
    hy = y + 72
    s.rect(mx, hy, mw, 236, C['accSoft'], C['acc'], r=14, sw=1)
    s.pill(mx + 14, hy + 12, spec['eyebrow'], C['acc'], C['panel'], 9.5)
    hl = spec['headline']
    s.lines(mx + 14, hy + 56, hl if isinstance(hl, list) else [hl], 16, C['ink'], gap=20, weight=700)
    import textwrap
    sup = [w for line in spec['support'] for w in textwrap.wrap(line, 78)]
    s.lines(mx + 14, hy + 56 + 20 * (len(hl) if isinstance(hl, list) else 1) + 2, sup, 9.5, C['ink2'], gap=13)
    by = hy + 118
    s.rect(mx + 14, by, 120, 24, C['acc'], None, r=12)
    s.text(mx + 74, by + 16, spec['primary'], 9.5, C['panel'], 700, 'middle')
    s.text(mx + 148, by + 16, spec['secondary'], 9.5, C['acc'], 600)
    # ring(s)
    rx, ry = mx + mw - 92, hy + 70
    s.circle(rx, ry, 46, None, C['line'], 9)
    s.path(f'M{rx},{ry - 46} A46,46 0 1,1 {rx - 40},{ry + 23}', C['acc'], 9)
    if spec.get('rings3'):
        s.circle(rx, ry, 32, None, C['ok'], 7)
        s.circle(rx, ry, 19, None, C['info'], 6)
    else:
        s.text(rx, ry + 5, spec.get('ring', ''), 13, C['ink'], 700, 'middle')
    # KPIs
    kw = (mw - 28 - 3 * 8) / 4
    for i, (lab, val, sub) in enumerate(spec['kpis']):
        kx = mx + 14 + i * (kw + 8)
        ky = hy + 156
        s.rect(kx, ky, kw, 68, C['acc'] if i == 0 else C['panel'], None if i == 0 else C['line2'], r=10)
        fg = C['panel'] if i == 0 else C['ink']
        s.text(kx + 10, ky + 16, lab, 8.5, fg if i == 0 else C['ink3'])
        s.text(kx + 10, ky + 40, val, 15, fg, 700)
        s.text(kx + 10, ky + 57, sub, 8.5, fg if i == 0 else C['ink2'])
    # lower cards
    cy = hy + 252
    lw = mw * 0.62
    for j, (cx, cw_, card) in enumerate([(mx, lw, spec['cards'][0]), (mx + lw + 12, mw - lw - 12, spec['cards'][1])]):
        s.rect(cx, cy, cw_, H - (cy - y) - 14, C['panel'], C['line'], r=12)
        s.text(cx + 12, cy + 22, card[0], 11.5, weight=700)
        s.text(cx + 12, cy + 37, card[1], 8.5, C['ink3'])
        for k, row in enumerate(card[2]):
            ry2 = cy + 52 + k * 30
            s.rect(cx + 12, ry2, cw_ - 24, 24, C['panel2'], C['line2'], r=6)
            s.text(cx + 20, ry2 + 15.5, row, 9, C['ink2'])
    s.text(x + W / 2, y + H + 22, 'Desktop ≥1024 px · sidebar 248', 11, C['ink3'], 600, 'middle')


def wf_phone(s, x, y, spec):
    W, H = 250, 540
    s.rect(x, y, W, H, C['panel'], C['line'], r=26)
    s.rect(x + 16, y + 16, 22, 22, C['accSoft'], C['acc'], r=6)
    s.circle(x + W - 52, y + 27, 11, C['panel2'], C['line'])
    s.circle(x + W - 26, y + 27, 11, C['accSoft'], C['acc'])
    ctx = spec['context'] if len(spec['context']) <= 44 else spec['context'][:43] + '…'
    s.text(x + 16, y + 58, ctx, 8, C['ink3'])
    s.text(x + 16, y + 80, spec['title'], 15, weight=700)
    hy = y + 96
    s.rect(x + 12, hy, W - 24, 236, C['accSoft'], C['acc'], r=14)
    s.pill(x + 22, hy + 10, spec['eyebrow'] if len(spec['eyebrow']) <= 32 else spec['eyebrow'][:31] + '…', C['acc'], C['panel'], 8.5)
    hl = spec.get('headline_phone') or spec['headline']
    hl = hl if isinstance(hl, list) else [hl]
    s.lines(x + 22, hy + 48, hl, 12.5, C['ink'], gap=16, weight=700)
    s.rect(x + 22, hy + 60 + 16 * len(hl), W - 44, 24, C['acc'], None, r=12)
    s.text(x + W / 2, hy + 76 + 16 * len(hl), spec['primary'], 9.5, C['panel'], 700, 'middle')
    s.text(x + W / 2, hy + 104 + 16 * len(hl), spec['secondary'], 9, C['acc'], 600, 'middle')
    rcx, rcy = x + 62, hy + 104 + 16 * len(hl) + 48
    s.circle(rcx, rcy, 34, None, C['line'], 8)
    s.path(f'M{rcx},{rcy - 34} A34,34 0 1,1 {rcx - 30},{rcy + 16}', C['acc'], 8)
    s.lines(x + 112, rcy - 4, ['cincin 96 px,', 'angka tertulis'], 8.5, C['ink3'])
    ky = hy + 246
    for i in range(2):
        lab, val, sub = spec['kpis'][i]
        kx = x + 12 + i * ((W - 32) / 2 + 8)
        kw = (W - 32) / 2
        s.rect(kx, ky, kw, 66, C['acc'] if i == 0 else C['panel2'], None if i == 0 else C['line2'], r=10)
        fg = C['panel'] if i == 0 else C['ink']
        s.text(kx + 8, ky + 16, lab if len(lab) <= 20 else lab[:19] + '…', 8, fg if i == 0 else C['ink3'])
        s.text(kx + 8, ky + 38, val, 13, fg, 700)
        s.text(kx + 8, ky + 55, sub if len(sub) <= 22 else sub[:21] + '…', 7.5, fg if i == 0 else C['ink2'])
    s.rect(x + 12, ky + 78, W - 24, 70, C['panel'], C['line'], r=10)
    s.text(x + 22, ky + 98, spec['cards'][0][0][:30], 10, weight=700)
    s.rect(x + 22, ky + 108, W - 44, 14, C['panel2'], None, r=4)
    s.rect(x + 22, ky + 126, W - 64, 14, C['panel2'], None, r=4)
    # tab bar
    ty = y + H - 60
    s.rect(x, ty, W, 60, C['panel2'], None, r=0)
    s.line(x, ty, x + W, ty, C['line2'], 1)
    tabs = spec['phone_tabs']
    tw = W / len(tabs)
    for i, t in enumerate(tabs):
        cx = x + tw * i + tw / 2
        act = i == spec.get('phone_active', 0)
        s.rect(cx - 7, ty + 12, 14, 14, None, C['acc'] if act else C['ink3'], r=4)
        s.text(cx, ty + 42, t, 8.5, C['acc'] if act else C['ink2'], 600 if act else 400, 'middle')
    s.text(x + W / 2, y + H + 22, 'Ponsel <600 px · tab bar bawah', 11, C['ink3'], 600, 'middle')


def wireframe(fname, spec):
    s = Svg(1120, 680, f'Wireframe {spec["screen"]} {spec["role"]}',
            f'Kerangka layar {spec["screen"]} untuk peran {spec["role"]} di desktop dan ponsel.')
    s.text(32, 44, f'{spec["role"]} · {spec["screen"]}', 22, weight=700)
    s.text(32, 66, spec['note'], 12, C['ink2'])
    wf_desktop(s, 32, 86, spec)
    wf_phone(s, 838, 86, spec)
    s.save(fname)


WF = {
    'wf-pic-ringkasan.svg': dict(
        role='PIC proyek', screen='Hari ini (Ringkasan)', note='PicDashboard di src/components/views/role-dashboards.tsx + src/components/pic/*. Satu kalimat jawaban, maks 4 KPI.',
        side=['Hari ini', 'Meja kerja', 'Laporan harian|1', 'Proyek'], context='Selasa, 6 Oktober 2026 · Minggu ke-41 · Aplikasi Absensi',
        title='Selamat pagi, Rina', header_right='Laporan hari ini · Belum dikirim', eyebrow='Perlu perhatian',
        headline='Aplikasi Absensi 64% selesai.', support=['Uji coba gelombang 2 tertahan. Tenggat 17.00 WIB · 2 jam 40 menit lagi.'],
        primary='Isi laporan harian', secondary='Lihat proyek', ring='64%',
        kpis=[('Output selesai', '4 dari 8', '50% output proyek'), ('Menunggu review', '1', 'oleh Andi'), ('Perlu revisi', '1', 'Panduan pengguna'), ('Menuju tenggat', '19 hari', '25 Okt · usul 1 Nov')],
        cards=[('Laporan harian · Selasa, 6 Okt', 'Tenggat 17.00 · dikirim ke Admin PT', ['Isi laporan · Terkirim ke Admin PT · Diteruskan', 'Dikerjakan hari ini (centang tugas)', 'Kendala | Rencana besok (selalu tampil)']),
               ('Tahapan proyek', '3 dari 6 tahap selesai', ['Perencanaan · Selesai', 'Pengembangan · Selesai', 'Uji coba 2 · Tertahan'])],
        phone_tabs=['Hari ini', 'Kerja', 'Laporan', 'Proyek', 'Tampilan']),
    'wf-kadiv-ringkasan.svg': dict(
        role='Kepala divisi', screen='Ringkasan', note='KadivDashboard + src/components/kadiv/* (review output, laporan harian tim, beban kerja, aktivitas tim).',
        side=['Ringkasan', 'Meja kerja', 'Capaian mingguan', 'Divisi'], context='Minggu ke-41 · Divisi Teknologi · 7 orang',
        title='Selamat pagi, Andi', header_right='Isi capaian M41', eyebrow='Minggu ke-41 · 4 proyek aktif',
        headline=['Divisi Teknologi menyelesaikan', '31 output minggu ini.'], headline_phone=['Divisi Teknologi', 'menyelesaikan 31 output', 'minggu ini.'],
        support=['5 output menunggu review Anda. 1 laporan harian belum masuk.'], primary='Review 5 output', secondary='Lihat laporan harian', rings3=True,
        kpis=[('Output selesai', '31', '31 dari 38'), ('Menunggu review', '5', 'Belum dihitung'), ('Rata-rata beban', '81%', '1 orang > 100%'), ('Tepat waktu 30 hari', '88%', 'Target 85%')],
        cards=[('Output menunggu review', '5 output · Terima semua (primer)', ['Laporan uji beban · Minta revisi | Terima', 'Runbook pemindahan · Minta revisi | Terima', 'Ringkasan M41 · Kirim ke Direktur']),
               ('Laporan harian tim', '4 dari 5 masuk · 1 cuti', ['Rina · Belum masuk · Ingatkan', 'Bagus · Terkirim 10.04', 'Atur anggota'])],
        phone_tabs=['Ringkasan', 'Kerja', 'Mingguan', 'Divisi', 'Tampilan']),
    'wf-admin-ringkasan.svg': dict(
        role='Admin PT', screen='Ringkasan', note='AdminDashboard + src/components/admin/* (permintaan akses, pengingat otomatis, data induk, kepatuhan per orang).',
        side=['Ringkasan', 'Meja kerja', 'Laporan harian', 'Penerimaan', 'Proyek', 'Divisi', 'Eskalasi'], context='Minggu ke-41 · PT Ratu Karya',
        title='Selamat pagi, Maya', eyebrow='Kepatuhan pelaporan · hari ini',
        headline='92% laporan harian sudah masuk hari ini.', headline_phone=['92% laporan harian', 'sudah masuk hari ini.'],
        support=['46 dari 50 orang sudah lapor. 5 laporan siap diteruskan. 3 permintaan akses menunggu Anda.'], primary='Kirim pengingat ke semua', secondary='Tinjau 3 permintaan akses', rings3=True,
        kpis=[('Laporan harian masuk', '46', 'Rata-rata 10 hari 93%'), ('Belum lapor', '4', 'dari 50 orang'), ('Permintaan akses', '3', 'menunggu Anda'), ('Akun tidak aktif', '2', 'dari 58 akun')],
        cards=[('Kepatuhan laporan', '46 dari 50 orang lapor · Harian | Mingguan', ['Divisi Teknologi 83% · 1 belum', 'Divisi Keuangan 100% · Lengkap', 'Divisi Media 75% · 2 belum']),
               ('Peta panas kepatuhan', '6 divisi × 10 hari kerja', ['Sheet divisi: Ingatkan per orang', 'Hubungi kepala divisi', 'Unduh log (CSV)'])],
        phone_tabs=['Ringkasan', 'Kerja', 'Laporan', 'Lainnya']),
    'wf-direktur-ringkasan.svg': dict(
        role='Direktur entitas', screen='Ringkasan', note='DirectorDashboard di src/components/oversight/ (saringan divisi, laporan mingguan divisi, usulan tenggat).',
        side=['Ringkasan', 'Proyek', 'Divisi|1', 'Persetujuan|4', 'Eskalasi|2', 'Entitas'], context='Minggu ke-41 · 3 divisi',
        title='Selamat pagi, Hadi', header_right='Semua · Teknologi · Media', eyebrow='3 divisi · 8 proyek di bawah Anda',
        headline='5 dari 8 proyek berjalan sesuai rencana.', headline_phone=['5 dari 8 proyek berjalan', 'sesuai rencana.'],
        support=['4 persetujuan dan 2 eskalasi menunggu keputusan Anda.'], primary='Tinjau 6 keputusan', secondary='Baca laporan mingguan', rings3=True,
        kpis=[('Output selesai minggu ini', '71', '+6 dari minggu lalu'), ('Laporan mingguan M40', '2 dari 3', '1 belum masuk'), ('Menunggu keputusan', '6', '4 persetujuan · 2 eskalasi'), ('Milestone 14 hari', '2', 'Terdekat 15 Okt')],
        cards=[('Laporan mingguan divisi · M40', '2 dari 3 masuk', ['Teknologi · Terkirim · Beri tanggapan', 'Operasional · Belum masuk · Hubungi | Ingatkan', 'Media · Terlambat masuk · Baca laporan']),
               ('Output yang sedang dikerjakan', 'Donat per divisi', ['21 output aktif', 'Teknologi 7 · 33%', 'Operasional 6 · 29%'])],
        phone_tabs=['Ringkasan', 'Proyek', 'Eskalasi', 'Divisi', 'Lainnya']),
    'wf-manajemen-ringkasan.svg': dict(
        role='Manajemen', screen='Ringkasan', note='ManagementDashboard di src/components/oversight/ (periode Minggu/Bulan/Kuartal, kinerja divisi, persetujuan, kehadiran).',
        side=['Ringkasan', 'Proyek', 'Divisi', 'Persetujuan|3', 'Eskalasi', 'Entitas', 'Log aktivitas'], context='Minggu ke-41 · seluruh grup',
        title='Selamat pagi, Ris', header_right='Minggu · Bulan · Kuartal', eyebrow='Status hari ini',
        headline='6 dari 9 proyek berjalan sesuai rencana.', headline_phone=['6 dari 9 proyek berjalan', 'sesuai rencana.'],
        support=['2 perlu perhatian, 1 terlambat. 3 persetujuan menunggu Anda.'], primary='Tinjau yang mendesak', secondary='Lihat semua proyek', rings3=True,
        kpis=[('Output selesai minggu ini', '173', '+6% dari periode lalu'), ('Rata-rata progres', '57%', '1 proyek selesai'), ('Persetujuan menunggu', '3', '1 lewat 24 jam'), ('Kehadiran', '92%', '46 dari 50 orang')],
        cards=[('Output selesai', '8 minggu terakhir', ['grafik batang M34–M41', 'minggu berjalan disorot', 'cadangan tabel tersedia']),
               ('Persetujuan menunggu', 'Materi, anggaran, cuti, pengajuan proyek', ['Anggaran uji beban · Setujui | Tolak', 'Cuti Fajar 13–15 Okt · Setujui | Tolak', 'Usulan tenggat Absensi · 1 Nov'])],
        phone_tabs=['Ringkasan', 'Proyek', 'Persetujuan', 'Divisi', 'Lainnya']),
    'wf-superadmin-perusahaan.svg': dict(
        role='Super Admin', screen='Perusahaan & akun', note='src/components/views/companies-view.tsx (Perusahaan · Akun · Struktur) + src/components/companies/*.',
        side=['Ringkasan', 'Perusahaan & akun', 'Meja kerja', 'Laporan harian', 'Capaian mingguan', 'Penerimaan', 'Proyek', 'Divisi', 'Eskalasi', 'Entitas', 'Log aktivitas', 'Sistem & akses'], active=1,
        context='Super Admin · seluruh grup', title='Perusahaan & akun', header_right='Tambah perusahaan', eyebrow='1 holding · 5 anak perusahaan',
        headline='5 perusahaan aktif dengan 14 akun.', headline_phone=['5 perusahaan aktif', 'dengan 14 akun.'],
        support=['3 akun belum pernah masuk. 5 divisi belum punya kepala.'], primary='Tinjau 11 hal', secondary='Lihat struktur grup', rings3=True,
        kpis=[('Perusahaan', '6', '5 aktif · 1 nonaktif'), ('Akun', '16', '1 tanpa kata sandi'), ('Divisi', '8', '5 tanpa kepala'), ('Proyek', '4', '2 tanpa manager')],
        cards=[('Perusahaan · Akun · Struktur', 'SegmentedControl + chip saring + cari', ['PT. BIKE Tbk · Holding · Kelola', 'PT Cipta · Anak perusahaan · Kelola', 'PT Fahreza · Anak perusahaan · Kelola']),
               ('Sheet perusahaan', 'dibuka dari "Kelola"', ['Identitas & logo', 'Akun & posisi', 'Divisi & proyek'])],
        phone_tabs=['Ringkasan', 'Perusahaan', 'Kerja', 'Lainnya'], phone_active=1),
    'wf-pic-meja-kerja.svg': dict(
        role='PIC proyek', screen='Meja kerja', note='src/components/work-desk/pic-desk.tsx — antrean laporan hari ini, agenda tugas (centang + "Urungkan"), lalu Output saya & Catatan kepala divisi.',
        side=['Hari ini', 'Meja kerja', 'Laporan harian|1', 'Proyek'], active=1, context='Selasa, 6 Oktober 2026 · Minggu ke-41 · 2 proyek',
        title='Selamat pagi, Rina', header_right='Laporan hari ini · Belum dikirim', eyebrow='Meja kerja · Selasa, 6 Oktober',
        headline='1 dari 2 laporan hari ini belum dikirim.', headline_phone=['1 dari 2 laporan hari ini', 'belum dikirim.'],
        support=['Tenggat 17.00 WIB, 6 jam 41 menit lagi. 4 dari 6 task selesai. Diingatkan Admin PT 15.10.'], primary='Isi laporan harian', secondary='Lihat proyek', ring='6 j 41 m',
        kpis=[('Laporan terkirim', '1 dari 2', '1 menunggu Anda'), ('Task selesai', '4 dari 6', '67% hari ini'), ('Tepat waktu 10 hari', '89%', 'Di atas target 85%'), ('Task terkendala', '1', 'Tulis kendala di laporan')],
        cards=[('Antrean laporan hari ini', 'Kirim sebelum 17.00 WIB · pilih proyek', ['Aplikasi Absensi · Draf belum dikirim', 'Diingatkan Admin PT pukul 15.10', 'Portal Pelanggan · Terkirim 11.20']),
               ('Agenda hari ini', '2 dari 4 task · Tambah task', ['08.30 Rapat harian · selesai', '— Sekarang 10.18 —', '13.00 Uji coba · Terkendala'])],
        phone_tabs=['Hari ini', 'Kerja', 'Laporan', 'Proyek', 'Tampilan'], phone_active=1),
    'wf-admin-meja-kerja.svg': dict(
        role='Admin PT', screen='Meja kerja', note='src/components/work-desk/admin-desk.tsx — laporan harian per proyek, Ingatkan PIC, alur hari ini, pengajuan & buka kunci yang menunggu.',
        side=['Ringkasan', 'Meja kerja', 'Laporan harian', 'Penerimaan', 'Proyek', 'Divisi', 'Eskalasi'], active=1, context='Selasa, 6 Oktober 2026 · Minggu ke-41 · PT Ratu Karya',
        title='Selamat pagi, Maya', header_right='3 belum lapor', eyebrow='Meja kerja · Selasa, 6 Oktober', headline='4 dari 7 proyek sudah lapor hari ini.', headline_phone=['4 dari 7 proyek', 'sudah lapor hari ini.'],
        support=['3 belum lapor, 1 sudah diingatkan. 3 laporan siap diteruskan ke holding. 2 hal menunggu Anda.'], primary='Ingatkan 1 PIC', secondary='Buka penerimaan', ring='6 j 39 m',
        kpis=[('Laporan masuk', '4 dari 7', '57% hari ini'), ('Belum lapor', '3', '1 sudah diingatkan'), ('Siap diteruskan', '3', '1 sudah diteruskan'), ('Menunggu Anda', '2', '1 pengajuan · 1 eskalasi')],
        cards=[('Laporan harian per proyek', 'Semua · Belum · Masuk · Diteruskan', ['Migrasi Server Data · Diteruskan', 'Aplikasi Absensi · Diingatkan 15.10', 'Portal Pelanggan · Belum masuk · Ingatkan']),
               ('Alur hari ini', 'PIC mengisi → Masuk ke Anda → Diteruskan', ['PIC mengisi · 4 dari 7 masuk', 'Masuk ke Anda · 3 menunggu', 'Diteruskan ke holding · 1 dari 7'])],
        phone_tabs=['Ringkasan', 'Kerja', 'Laporan', 'Lainnya'], phone_active=1),
}


def pola_sheet():
    s = Svg(1120, 520, 'Pola Sheet di tiga ukuran', 'Detail dibuka di Sheet: samping 440 di desktop, form sheet di tablet, layar didorong di ponsel.')
    s.text(32, 44, 'Pola detail: Sheet (src/components/mk/sheet.tsx)', 22, weight=700)
    s.text(32, 66, 'Detail tidak pindah halaman. Fokus masuk ke judul, Esc menutup, fokus kembali ke pembuka; di ponsel geser dari tepi kiri untuk menutup.', 12, C['ink2'])
    # desktop
    x, y = 32, 92
    s.rect(x, y, 480, 340, C['panel'], C['line'], r=12)
    s.rect(x + 10, y + 10, 220, 320, C['panel2'], C['line2'], r=8)
    s.rect(x, y, 480, 340, C['ink'], None, r=12, opacity=0.08)
    s.rect(x + 290, y + 6, 184, 328, C['panel'], C['line'], r=12)
    s.text(x + 302, y + 30, 'Judul detail', 12, weight=700)
    for k in range(5):
        s.rect(x + 302, y + 46 + k * 28, 160, 18, C['panel2'], None, r=4)
    s.rect(x + 302, y + 292, 70, 26, C['panel2'], C['line'], r=13)
    s.rect(x + 380, y + 292, 82, 26, C['acc'], None, r=13)
    s.text(x + 421, y + 309, 'Simpan', 10, C['panel'], 700, 'middle')
    s.text(x + 240, y + 362, 'Desktop: samping kanan 440 px (wide 640–680)', 11, C['ink3'], 600, 'middle')
    # tablet
    x = 548
    s.rect(x, y, 300, 340, C['panel'], C['line'], r=12)
    s.rect(x, y, 300, 340, C['ink'], None, r=12, opacity=0.08)
    s.rect(x + 30, y + 40, 240, 270, C['panel'], C['line'], r=16)
    s.text(x + 44, y + 64, 'Form sheet', 12, weight=700)
    for k in range(5):
        s.rect(x + 44, y + 80 + k * 28, 212, 18, C['panel2'], None, r=4)
    s.rect(x + 170, y + 272, 86, 26, C['acc'], None, r=13)
    s.text(x + 150, y + 362, 'Tablet 600–1023: form sheet di tengah', 11, C['ink3'], 600, 'middle')
    # phone
    x = 884
    s.rect(x, y, 200, 340, C['panel'], C['line'], r=22)
    s.text(x + 16, y + 30, '‹ Kembali', 11, C['acc'], 600)
    s.text(x + 16, y + 56, 'Judul detail', 13, weight=700)
    for k in range(6):
        s.rect(x + 16, y + 72 + k * 28, 168, 18, C['panel2'], None, r=4)
    s.rect(x + 16, y + 296, 168, 28, C['acc'], None, r=14)
    s.text(x + 100, y + 362, 'Ponsel <600: layar didorong', 11, C['ink3'], 600, 'middle')
    s.text(32, 490, 'Hapus selalu lewat useConfirm (src/components/companies/parts.tsx); tindakan yang bisa dibalik memakai toast "Urungkan" (sonner).', 11.5, C['ink3'])
    s.save('pola-sheet.svg')


def status_output():
    s = Svg(1120, 300, 'Siklus status output', 'Output: Dikerjakan, Menunggu review, Perlu revisi, Diterima, beserta siapa yang mengubah.')
    s.text(32, 44, 'Siklus status output (model Output, migrasi 0013)', 22, weight=700)
    nodes = [('Dikerjakan', 'DIKERJAKAN', C['ok'], C['okSoft'], 60), ('Menunggu review', 'MENUNGGU_REVIEW', C['info'], C['infoSoft'], 330),
             ('Diterima', 'DITERIMA', C['ink2'], C['panel2'], 640), ('Perlu revisi', 'PERLU_REVISI', C['warn'], C['warnSoft'], 330)]
    pos = {}
    for i, (lab, code, fg, bg, x) in enumerate(nodes):
        y = 90 if i < 3 else 200
        s.rect(x, y, 200, 62, bg, fg, r=12)
        s.text(x + 100, y + 27, lab, 14, fg, 700, 'middle')
        s.text(x + 100, y + 46, code, 10.5, C['ink3'], 400, 'middle', mono=True)
        pos[code] = (x, y)
    s.arrow(260, 112, 330, 112, 'PIC: submit (min. 1 bukti)', lx=295, ly=84)
    s.arrow(330, 132, 260, 132, 'withdraw / Urungkan', lx=295, ly=150, color=C['ink3'], dash='5 4')
    s.arrow(530, 121, 640, 121, 'Kadiv: accept', lx=585, ly=110)
    s.arrow(430, 152, 430, 200, 'Kadiv: revise + catatan', lx=355, ly=180)
    s.arrow(330, 231, 160, 152, 'PIC memperbaiki', curve=30, lx=210, ly=230)
    s.arrow(640, 141, 530, 141, 'undo ≤ 15 menit', dash='5 4', lx=585, ly=165)
    s.arrow(530, 220, 500, 152, None, dash='5 4')
    s.text(545, 245, 'undo dari Perlu revisi juga kembali ke Menunggu review', 10.5, C['ink3'])
    s.text(870, 110, 'Bukti dibekukan saat', 11.5, C['ink2'])
    s.text(870, 126, 'Menunggu review & Diterima.', 11.5, C['ink2'])
    s.text(870, 150, 'Hapus hanya bila belum', 11.5, C['ink2'])
    s.text(870, 166, 'ada bukti & belum diterima.', 11.5, C['ink2'])
    s.save('status-output.svg')


arsitektur()
alur_harian()
alur_mingguan()
erd()
navigasi()
for f, spec in WF.items():
    wireframe(f, spec)
pola_sheet()
status_output()
