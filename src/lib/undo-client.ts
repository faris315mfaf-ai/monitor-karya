import { toast } from 'sonner'

/**
 * [F2-URUNGKAN] Toast sukses dengan tombol "Urungkan" untuk tindakan yang
 * diurungkan di server (POST /api/undo). Route tindakan asal mengembalikan
 * `undoToken`; bila tiket tidak ada (mis. migrasi 0025 belum diterapkan),
 * toast tampil tanpa tombol.
 *
 * Toast tampil 10 detik; server menerima urungkan sampai 15 menit, jadi klik
 * yang terlambat beberapa detik tetap berhasil.
 */

export const UNDO_TOAST_MS = 10_000

export async function requestUndo(token: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
    return res.ok
      ? { ok: true, message: json.message || 'Tindakan diurungkan.' }
      : { ok: false, message: json.error || 'Tindakan belum bisa diurungkan. Coba lagi.' }
  } catch {
    return { ok: false, message: 'Tidak dapat menghubungi server.' }
  }
}

export function toastWithUndo(
  message: string,
  token: unknown,
  onUndone: () => void,
  opts?: { description?: string }
): void {
  if (typeof token !== 'string' || !token) {
    toast.success(message, opts?.description ? { description: opts.description } : undefined)
    return
  }
  toast.success(message, {
    description: opts?.description,
    duration: UNDO_TOAST_MS,
    action: {
      label: 'Urungkan',
      onClick: async () => {
        const r = await requestUndo(token)
        if (r.ok) {
          toast.success(r.message)
          onUndone()
        } else toast.error(r.message)
      },
    },
  })
}
