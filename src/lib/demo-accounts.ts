/**
 * Akun contoh yang ditawarkan halaman masuk lewat satu klik (10 Sep 2026):
 * empat jenjang pelaporan, ditampilkan dengan username-nya saja.
 *
 * Daftar ini statis dengan sengaja. Halaman masuk harus tetap bisa menampilkan
 * pilihannya walau database tidak terjangkau, jadi nama dan warnanya tidak
 * boleh berasal dari query. Database tetap menjadi penentu apakah akun itu
 * ada — /api/auth/demo mencarinya dulu sebelum membuka sesi — daftar ini hanya
 * menentukan akun mana yang boleh ditawarkan sama sekali.
 *
 * prisma/seed.sql dan scripts/demo-accounts.ts menanam persis akun-akun ini;
 * jaga ketiganya tetap seiring.
 */

export type DemoAccountSpec = {
  username: string
  label: string
  role: string
  avatarColor: string
}

export const DEMO_ACCOUNTS: DemoAccountSpec[] = [
  { username: 'adminptcontoh', label: 'Admin PT', role: 'ADMIN_PT', avatarColor: '#2563eb' },
  { username: 'kepaladivisi', label: 'Kepala Divisi / Manager', role: 'KEPALA_DIVISI', avatarColor: '#7c3aed' },
  { username: 'direkturentitas', label: 'Direktur Entitas', role: 'DIREKTUR_ENTITAS', avatarColor: '#ea580c' },
  { username: 'holding', label: 'Holding', role: 'DIREKTUR_SDM_GA', avatarColor: '#16a34a' },
]

/** Username yang boleh dibuka lewat satu klik. */
export const DEMO_USERNAMES: string[] = DEMO_ACCOUNTS.map((a) => a.username)

/**
 * Akun contoh lain yang ikut ditanam seed dan masuk lewat formulir biasa
 * (username + kata sandi), termasuk akun Super Admin pemilik.
 */
export const OTHER_DEMO_USERNAMES = ['manager', 'manajemen', 'owner', 'superadmin'] as const

/**
 * Kata sandi bersama seluruh akun contoh, ditampilkan terbuka di halaman masuk.
 * Ini kredensial demo yang memang dipublikasikan; jangan arahkan ke kata sandi
 * yang menjaga data sungguhan.
 */
export const DEMO_PASSWORD = process.env.SEED_PASSWORD || '1234'

/** Whether one-click demo sign-in is switched on for this server. */
export function demoLoginEnabled(): boolean {
  const flag = process.env.DEMO_LOGIN
  return flag === '1' || flag === 'true'
}
