/**
 * Alamat berkas PDF laporan subholding (GET /api/sh/pdf). Aman dipakai di
 * komponen klien: hanya membangun URL, tidak menyentuh server.
 *
 *  - { id }            satu laporan (status apa pun yang boleh dibaca akun itu)
 *  - { pt, date }      semua laporan DISETUJUI satu PT pada tanggal itu
 *  - { sub, date }     semua laporan DISETUJUI satu subholding pada tanggal itu
 */
export type ShPdfTarget = { id: string } | { pt: string; date: string } | { sub: string; date: string }

export function shPdfHref(target: ShPdfTarget): string {
  const q = new URLSearchParams()
  if ('id' in target) q.set('id', target.id)
  else {
    if ('pt' in target) q.set('pt', target.pt)
    else q.set('sub', target.sub)
    q.set('date', target.date)
  }
  return `/api/sh/pdf?${q.toString()}`
}
