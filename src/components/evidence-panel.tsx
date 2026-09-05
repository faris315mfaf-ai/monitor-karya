'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertTriangle, ExternalLink, FileText, Image as ImageIcon, Link2, Loader2,
  Paperclip, Trash2, Upload,
} from 'lucide-react'

export type EvidenceItem = {
  id: string
  fileName: string
  url: string | null
  mime?: string | null
  size?: number | null
  createdAt: string
}

function humanSize(bytes?: number | null) {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Attaching and reviewing supporting evidence for one report line.
 *
 * Two ways in: upload a file (stored privately in Supabase Storage) or record
 * an external link for material that already lives somewhere else. Opening an
 * uploaded file asks the server for a short-lived signed URL rather than
 * holding a permanent one.
 */
export function EvidencePanel({
  targetType,
  targetId,
  items,
  required,
  disabled,
  onChanged,
  compact,
}: {
  targetType: 'DAILY_REPORT' | 'WEEKLY_ITEM' | 'PROJECT_CLOSING' | 'TASK'
  targetId: string | null
  items: EvidenceItem[]
  required?: boolean
  disabled?: boolean
  onChanged: () => void
  compact?: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showLink, setShowLink] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')

  const noTarget = !targetId

  async function upload(file: File) {
    if (!targetId) {
      setErr('Simpan draft dulu agar bukti bisa dilampirkan.')
      return
    }
    setBusy('upload')
    setErr(null)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('targetType', targetType)
      body.append('targetId', targetId)

      const res = await fetch('/api/evidence/upload', { method: 'POST', body })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Gagal mengunggah berkas')
      else onChanged()
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function attachLink() {
    if (!targetId) {
      setErr('Simpan draft dulu agar bukti bisa dilampirkan.')
      return
    }
    setBusy('link')
    setErr(null)
    try {
      const res = await fetch('/api/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, fileName: linkName, url: linkUrl }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Gagal melampirkan tautan')
      else {
        setLinkName('')
        setLinkUrl('')
        setShowLink(false)
        onChanged()
      }
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  async function open(id: string) {
    setBusy(id)
    setErr(null)
    try {
      const res = await fetch(`/api/evidence/${id}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.url) {
        setErr(json.error || 'Gagal membuka bukti')
        return
      }
      window.open(json.url, '_blank', 'noopener,noreferrer')
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    setBusy(id)
    setErr(null)
    try {
      const res = await fetch(`/api/evidence/${id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Gagal menghapus bukti')
      else onChanged()
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={compact ? 'space-y-1.5 pt-1' : 'rounded-xl border border-white/50 dark:border-white/10 bg-white/40 dark:bg-slate-900/30 p-3 space-y-2'}>
      {!compact && (
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Paperclip className="h-3.5 w-3.5" />
          Bukti pendukung {required && <span className="text-rose-500">*</span>}
          <span className="ml-auto text-xs font-normal text-slate-500 dark:text-slate-400">
            {items.length} lampiran
          </span>
        </div>
      )}

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-[13px] bg-white/60 dark:bg-slate-900/40 rounded-lg px-2 py-1.5">
              <span className="text-slate-400 dark:text-slate-500 shrink-0">
                {e.url ? (
                  <Link2 className="h-3.5 w-3.5" />
                ) : e.mime?.startsWith('image/') ? (
                  <ImageIcon className="h-3.5 w-3.5" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
              </span>
              <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{e.fileName}</span>
              {humanSize(e.size) && (
                <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0 tabular-nums">
                  {humanSize(e.size)}
                </span>
              )}
              <button
                onClick={() => open(e.id)}
                disabled={busy === e.id}
                className="text-blue-600 hover:text-blue-700 shrink-0 disabled:opacity-50"
                aria-label={`Buka ${e.fileName}`}
              >
                {busy === e.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
              </button>
              {!disabled && (
                <button
                  onClick={() => remove(e.id)}
                  disabled={busy === e.id}
                  className="text-slate-400 dark:text-slate-500 hover:text-rose-600 shrink-0 disabled:opacity-50"
                  aria-label={`Hapus ${e.fileName}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) upload(f)
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-sm"
              disabled={busy !== null || noTarget}
              onClick={() => fileRef.current?.click()}
            >
              {busy === 'upload' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Unggah berkas
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-sm"
              disabled={busy !== null || noTarget}
              onClick={() => setShowLink((v) => !v)}
            >
              <Link2 className="h-3.5 w-3.5" /> Tautan
            </Button>
            {items.length === 0 && required && (
              <span className="text-[13px] text-amber-700 dark:text-amber-300">Wajib minimal 1 bukti.</span>
            )}
          </div>

          {showLink && (
            <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
              <Input
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                placeholder="Keterangan"
                className="bg-white/80 dark:bg-slate-900/60 h-8 text-sm"
              />
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                inputMode="url"
                className="bg-white/80 dark:bg-slate-900/60 h-8 text-sm"
              />
              <Button size="sm" className="h-8 text-sm" onClick={attachLink} disabled={busy !== null}>
                {busy === 'link' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Simpan'}
              </Button>
            </div>
          )}

          {noTarget && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Simpan draft terlebih dahulu agar bukti dapat dilampirkan.
            </p>
          )}
        </>
      )}

      {err && (
        <p className="text-[13px] text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
          {err}
        </p>
      )}
    </div>
  )
}
