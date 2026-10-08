'use client'

/**
 * Catatan kepala divisi (05-pic-proyek.md): percakapan per proyek. Gelembung
 * kiri = pihak lain (fill-1), kanan = Anda (accent-fill); waktu di bawah;
 * kolom balas + tombol kirim. Membuka percakapan menandai catatan pihak lain
 * sebagai dibaca.
 */

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Textarea } from '@/components/mk/forms'
import { Card, EmptyNote, ErrorNote, IconButton, Skeleton, cx } from '@/components/mk'
import { useResource } from '@/hooks/use-resource'
import { firstName, formatDateShort, formatTime } from '@/lib/format'
import { ASK_HEAD_EVENT, NOTES_CHANGED_EVENT, call, type NotesData } from './api'
import { refreshNavBadges } from './nav-badges'

function when(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const same = d.toDateString() === today.toDateString()
  return same ? formatTime(d) : `${formatDateShort(d)} · ${formatTime(d)}`
}

export function NotesCard({ projectId, title = 'Catatan kepala divisi', className }: { projectId: string; title?: string; className?: string }) {
  const { data, loading, error, reload } = useResource<NotesData>(`/api/project-notes?projectId=${encodeURIComponent(projectId)}`)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const markedFor = useRef<string | null>(null)

  const items = data?.items ?? []
  const lastId = items[items.length - 1]?.id
  const head = data?.heads?.[0] ?? items.find((n) => !n.mine)?.authorName ?? null
  const unread = data?.unread ?? 0

  // Gulir ke catatan terbaru setiap ada catatan baru.
  useEffect(() => {
    const el = chatRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lastId])

  // Tandai dibaca sekali per muatan yang masih punya catatan belum dibaca.
  useEffect(() => {
    if (!data || data.unread === 0 || markedFor.current === lastId) return
    markedFor.current = lastId ?? null
    call('/api/project-notes', 'PATCH', { projectId })
      .then(() => refreshNavBadges())
      .catch(() => {})
  }, [data, lastId, projectId])

  // Catatan dikirim dari tempat lain (mis. "Tanya kepala divisi" di Sheet output).
  useEffect(() => {
    function onChanged(e: Event) {
      const d = (e as CustomEvent<{ projectId: string }>).detail
      if (d?.projectId === projectId) reload()
    }
    window.addEventListener(NOTES_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(NOTES_CHANGED_EVENT, onChanged)
  }, [projectId, reload])

  // "Tanya kepala divisi" dari Sheet output: isi awal kolom balas lalu fokus.
  useEffect(() => {
    function onAsk(e: Event) {
      const d = (e as CustomEvent<{ projectId: string; text: string }>).detail
      if (!d || d.projectId !== projectId) return
      setDraft((cur) => (cur ? cur : d.text))
      cardRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
      window.setTimeout(() => inputRef.current?.focus(), 50)
    }
    window.addEventListener(ASK_HEAD_EVENT, onAsk)
    return () => window.removeEventListener(ASK_HEAD_EVENT, onAsk)
  }, [projectId])

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      await call('/api/project-notes', 'POST', { projectId, body: text })
      setDraft('')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Catatan belum terkirim')
    } finally {
      setSending(false)
    }
  }

  const lastMine = [...items].reverse().find((n) => n.mine)

  return (
    <div ref={cardRef} className={cx('flex', className)}>
      <Card
        className="flex-1"
        title={title}
        subtitle={
          unread
            ? `${unread} catatan baru${head ? ` dari ${firstName(head)}` : ''}`
            : head
              ? `Percakapan dengan ${head}`
              : 'Percakapan dengan kepala divisi'
        }
      >
        {loading && !data ? (
          <div className="flex flex-col gap-3">
            <Skeleton h={48} w="70%" />
            <Skeleton h={40} w="60%" className="self-end" />
          </div>
        ) : error ? (
          <ErrorNote message={error} onRetry={reload} />
        ) : (
          <>
            {items.length === 0 ? (
              <EmptyNote icon="catatan">Belum ada catatan. Tulis pertanyaan atau kabar untuk kepala divisi.</EmptyNote>
            ) : (
              <div ref={chatRef} className="mk-pic-chat" role="log" aria-label={title} aria-live="polite">
                {items.map((n) => (
                  <div key={n.id} className={cx('mk-pic-bubble', n.mine ? 'is-mine' : 'is-theirs')}>
                    <div className="mk-pic-bubble__body">{n.body}</div>
                    <div className="mk-pic-bubble__meta">
                      {n.mine ? 'Anda' : n.authorName} · {when(n.createdAt)}
                      {n.mine && n.id === lastMine?.id && n.readAt ? ' · Dibaca' : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <form
              className="mk-pic-compose"
              onSubmit={(e) => {
                e.preventDefault()
                send()
              }}
            >
              <label htmlFor={`mk-pic-note-${projectId}`} className="mk-sr">
                Tulis balasan
              </label>
              <Textarea
                ref={inputRef}
                id={`mk-pic-note-${projectId}`}
                rows={1}
                maxLength={2000}
                value={draft}
                placeholder={head ? `Balas ${firstName(head)}…` : 'Tulis catatan…'}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    send()
                  }
                }}
              />
              <IconButton type="submit" icon="kirim" label="Kirim catatan" variant="filled" className="mk-pic-send" disabled={!draft.trim() || sending} />
            </form>
          </>
        )}
      </Card>
    </div>
  )
}
