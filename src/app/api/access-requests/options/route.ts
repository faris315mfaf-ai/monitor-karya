import { NextResponse } from 'next/server'
import { refuseUnscoped, requireApiUser } from '@/lib/auth'
import { serverError } from '@/lib/api-error'
import { requesterOptions } from '@/lib/access-requesters'

/**
 * Pilihan formulir "Ajukan permintaan akses" untuk pengaju [F2-ADMIN]:
 * divisi dan akun yang boleh disasar, serta posisi yang boleh diminta.
 * Sengaja minimal — tanpa email, telepon, username, atau status kata sandi —
 * karena dibuka untuk Kepala divisi dan PIC proyek (bukan pemegang meja akun).
 *
 *   GET — Kepala divisi: timnya; PIC proyek: dirinya & anggota divisinya;
 *         peran lain berlingkup PT: akun di PT-nya.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const unscoped = refuseUnscoped(user)
  if (unscoped) return unscoped
  if (!user.scopeEntityId) return NextResponse.json({ error: 'Permintaan akses diajukan dari akun yang terikat pada satu PT.' }, { status: 403 })
  try {
    return NextResponse.json(await requesterOptions(user))
  } catch (err) {
    return serverError(err, 'Pilihan formulir belum termuat. Coba lagi.', 'access-requests/options GET')
  }
}
