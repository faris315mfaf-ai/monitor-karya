// Indonesian-friendly formatting helpers

const WIB_TZ = 'Asia/Jakarta'

const idDateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: WIB_TZ,
})

const idDateLongFormatter = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: WIB_TZ,
})

const idTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: WIB_TZ,
})

const idDateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: WIB_TZ,
})

const wibDayFormatter = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: WIB_TZ })

/** Apakah dua instan jatuh pada hari kalender WIB yang sama (bukan zona waktu peramban). */
export function isSameWibDay(a: Date | string, b: Date | string = new Date()): boolean {
  const da = typeof a === 'string' ? new Date(a) : a
  const db = typeof b === 'string' ? new Date(b) : b
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return false
  return wibDayFormatter.format(da) === wibDayFormatter.format(db)
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  return idDateFormatter.format(d)
}

export function formatDateLong(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  return idDateLongFormatter.format(d)
}

export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  return idTimeFormatter.format(d)
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  return idDateTimeFormatter.format(d)
}

export function formatRelative(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  const diff = Date.now() - d.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 7) return formatDate(d)
  if (days === 1) return 'Kemarin'
  if (days > 0) return `${days} hari lalu`
  if (hours > 0) return `${hours} jam lalu`
  if (minutes > 0) return `${minutes} menit lalu`
  return 'Baru saja'
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '0'
  return new Intl.NumberFormat('id-ID').format(n)
}

export function formatPercent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || isNaN(n)) return '0%'
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(n) + '%'
}

export function formatRp(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

/** 512 B · 48 KB · 1,5 MB — ukuran berkas dengan koma desimal Indonesia. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`
}

export function ageDays(date: Date | string | null | undefined): number {
  if (!date) return 0
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return 0
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

// ------------------------------------------------------------------
// Format dari panduan desain (01 · Prinsip & bahasa, 14 · Implementasi)
// ------------------------------------------------------------------

const idShortDayFormatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: WIB_TZ })

/** 18 Okt — tanggal ringkas tanpa tahun. */
export function formatDateShort(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  return idShortDayFormatter.format(d).replace('.', '')
}

/** Rp 48,5 jt · Rp 1,2 M */
export function formatRpShort(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return 'Rp 0'
  const dec = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(v)
  if (n >= 1e9) return `Rp ${dec(n / 1e9)} M`
  if (n >= 1e6) return `Rp ${dec(n / 1e6)} jt`
  return `Rp ${new Intl.NumberFormat('id-ID').format(n)}`
}

/** Sapaan menurut jam WIB. */
export function greeting(date: Date = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('id-ID', { hour: 'numeric', hourCycle: 'h23', timeZone: WIB_TZ }).format(date))
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam'
}

/** Nomor minggu ISO (M41), menurut kalender WIB — bukan zona waktu peramban/server. */
export function isoWeekNumber(date: Date = new Date()): number {
  const wib = new Date(date.getTime() + 7 * 3600000)
  const d = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/** Nama depan untuk kalimat ("Ingatkan Rina"); gelar Bpk./Ibu dibuang. */
export function firstName(name: string): string {
  return name.replace(/^(Bpk\.?|Bapak|Ibu|Sdr\.?|Sdri\.?)\s+/i, '').split(/\s+/)[0] ?? name
}

/** Inisial dua huruf. */
export function initials(name: string): string {
  return name
    .replace(/^(Bpk\.?|Bapak|Ibu|Sdr\.?|Sdri\.?)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}
