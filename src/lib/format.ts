// Indonesian-friendly formatting helpers

const WIB_TZ = 'Asia/Jakarta'

const idDateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: WIB_TZ,
})

const idDateLongFormatter = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: '2-digit',
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
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: WIB_TZ,
})

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
  return `${n.toFixed(digits)}%`
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

export function ageDays(date: Date | string | null | undefined): number {
  if (!date) return 0
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return 0
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}
