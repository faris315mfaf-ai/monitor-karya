'use client'

/**
 * Penampil dokumen bukti di dalam aplikasi (13 Nov 2026): PDF lewat pdf.js
 * (kanvas per halaman, dirender saat mendekati layar) dan Word .docx lewat
 * docx-preview. Keduanya dimuat malas — pustakanya baru diunduh saat dokumen
 * pertama dibuka.
 *
 * Isi berkas diambil dari GET /api/evidence/:id/isi (origin sendiri), jadi
 * tidak bergantung pada CORS penyimpanan dan CSP tidak dilonggarkan. Chrome
 * Android tidak bisa menampilkan PDF di dalam halaman, karena itu PDF
 * dirender sendiri, bukan lewat <iframe>.
 */

import { useEffect, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { Button, Icon, IconButton, Skeleton, cx } from '@/components/mk'
import { docKindLabel, type EvidenceDocKind } from '@/lib/evidence-doc'
import { DOC_ZOOMS, docContentHref, pdfRenderScale, stepZoom, type OverviewEvidence } from './logic'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'

/* ---------- pdf.js (dimuat sekali) ---------- */

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjsPromise: Promise<PdfJs> | null = null

function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs')
    .then((m) => {
      if (!m.GlobalWorkerOptions.workerPort) {
        m.GlobalWorkerOptions.workerPort = new Worker(new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url), {
          type: 'module',
        })
      }
      return m
    })
    .catch((err) => {
      pdfjsPromise = null
      throw err
    })
  return pdfjsPromise
}

/* ---------- Ambil isi berkas ---------- */

type Bytes = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: ArrayBuffer }

function useDocBytes(id: string, attempt: number): Bytes {
  const [res, setRes] = useState<{ key: string; value: Bytes } | null>(null)
  const key = `${id}:${attempt}`
  useEffect(() => {
    const ctrl = new AbortController()
    fetch(docContentHref(id), { cache: 'no-store', signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => null)) as { error?: string } | null
          return { state: 'error', message: body?.error ?? 'Dokumen belum bisa dimuat.' } as Bytes
        }
        return { state: 'ready', data: await r.arrayBuffer() } as Bytes
      })
      .catch((): Bytes => ({ state: 'error', message: 'Dokumen belum bisa dimuat. Periksa koneksi Anda.' }))
      .then((value) => {
        if (!ctrl.signal.aborted) setRes({ key, value })
      })
    return () => ctrl.abort()
  }, [id, key])
  return res && res.key === key ? res.value : { state: 'loading' }
}

/** Lebar isi wadah tanpa padding (px), diperbarui saat ukuran berubah ≥ 8px. */
function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const cs = getComputedStyle(el)
      const w = Math.floor(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight))
      setWidth((prev) => (Math.abs(prev - w) >= 8 ? w : prev))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/* ---------- Penampil ---------- */

/**
 * Penampil dokumen lengkap: bilah perbesaran + unduh, lalu halaman yang bisa
 * digulir. Mengisi tinggi wadahnya (pemanggil memberi tinggi).
 */
export function DocViewer({ item, kind, className }: { item: OverviewEvidence; kind: EvidenceDocKind; className?: string }) {
  const [zoom, setZoom] = useState<number>(1)
  const [attempt, setAttempt] = useState(0)
  const [pages, setPages] = useState<number | null>(null)
  const bytes = useDocBytes(item.id, attempt)
  const [renderError, setRenderError] = useState<string | null>(null)
  const retry = () => {
    setRenderError(null)
    setPages(null)
    setAttempt((a) => a + 1)
  }
  const error = bytes.state === 'error' ? bytes.message : renderError

  return (
    <div className={cx('flex min-h-0 flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="t-footnote text-ink-2 min-w-0 flex-1 truncate">
          {docKindLabel(kind)}
          {pages ? ` · ${pages} halaman` : ''}
        </span>
        <div className="flex items-center gap-1" role="group" aria-label="Perbesaran">
          <Button size="sm" variant="secondary" onClick={() => setZoom((z) => stepZoom(z, -1))} disabled={zoom <= DOC_ZOOMS[0]} aria-label="Perkecil">
            −
          </Button>
          <span className="t-footnote text-ink-2 w-12 text-center tabular-nums" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <Button size="sm" variant="secondary" onClick={() => setZoom((z) => stepZoom(z, 1))} disabled={zoom >= DOC_ZOOMS[DOC_ZOOMS.length - 1]} aria-label="Perbesar">
            +
          </Button>
        </div>
        <a href={docContentHref(item.id)} download={item.fileName} className={cx('mk-btn mk-btn--secondary mk-btn--sm no-underline', FOCUS)}>
          <Icon name="unduh" size={16} strokeWidth={2} />
          <span>Unduh</span>
        </a>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-md)] bg-fill-1">
      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="mk-empty__icon mk-soft--neutral" aria-hidden>
            <Icon name="dokumen" size={24} />
          </span>
          <span className="t-body text-ink">{error}</span>
          <Button variant="secondary" onClick={retry}>
            Coba lagi
          </Button>
        </div>
      ) : bytes.state !== 'ready' ? (
        <div className="flex-1 p-3" aria-busy="true" aria-label="Memuat dokumen">
          <Skeleton h="100%" r={10} />
        </div>
      ) : kind === 'pdf' ? (
        <PdfView key={attempt} data={bytes.data} zoom={zoom} onPages={setPages} onError={setRenderError} />
      ) : (
        <DocxView key={attempt} data={bytes.data} zoom={zoom} onError={setRenderError} />
      )}
      </div>
    </div>
  )
}

/* ---------- PDF ---------- */

function PdfView({
  data,
  zoom,
  onPages,
  onError,
}: {
  data: ArrayBuffer
  zoom: number
  onPages: (n: number) => void
  onError: (msg: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const width = useWidth(scroller)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)

  useEffect(() => {
    let alive = true
    let task: { destroy: () => Promise<void> } | null = null
    loadPdfJs()
      .then((pdfjs) => {
        if (!alive) return null
        const t = pdfjs.getDocument({
          // Salinan: pdf.js memindahkan buffer ke worker (terlepas), StrictMode memanggil efek dua kali.
          data: new Uint8Array(data.slice(0)),
          enableXfa: false,
          standardFontDataUrl: '/pdfjs/standard_fonts/',
          wasmUrl: '/pdfjs/wasm/',
          iccUrl: '/pdfjs/iccs/',
        })
        task = t
        return t.promise
      })
      .then((d) => {
        if (!alive || !d) return
        setDoc(d)
        onPages(d.numPages)
      })
      .catch((err: unknown) => {
        if (!alive) return
        const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : ''
        onError(name === 'PasswordException' ? 'PDF ini dilindungi kata sandi. Unduh untuk membukanya.' : 'PDF ini belum bisa ditampilkan. Unduh untuk membukanya.')
      })
    return () => {
      alive = false
      void task?.destroy()
    }
  }, [data, onPages, onError])

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-auto overscroll-contain p-2 sm:p-3" tabIndex={0} aria-label="Isi dokumen" data-doc-scroll>
      {!doc || !width ? (
        <Skeleton h="100%" r={10} />
      ) : (
        <div className="flex flex-col items-center gap-3" style={{ width: width * zoom }}>
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage key={i + 1} doc={doc} n={i + 1} total={doc.numPages} cssWidth={width * zoom} root={scroller} />
          ))}
        </div>
      )}
    </div>
  )
}

function PdfPage({
  doc,
  n,
  total,
  cssWidth,
  root,
}: {
  doc: PDFDocumentProxy
  n: number
  total: number
  cssWidth: number
  root: React.RefObject<HTMLDivElement | null>
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(n <= 2)
  const [ratio, setRatio] = useState(1.4142)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (near) return
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), {
      root: root.current,
      rootMargin: '800px 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [near, root])

  useEffect(() => {
    if (!near || !(cssWidth > 0)) return
    let alive = true
    let task: RenderTask | null = null
    doc
      .getPage(n)
      .then((page) => {
        if (!alive) return
        const base = page.getViewport({ scale: 1 })
        setRatio(base.height / base.width)
        const el = canvas.current
        if (!el) return
        const s = pdfRenderScale(cssWidth, base.width, base.height, window.devicePixelRatio)
        const viewport = page.getViewport({ scale: s.css * s.output })
        el.width = Math.floor(viewport.width)
        el.height = Math.floor(viewport.height)
        task = page.render({ canvas: el, viewport })
        return task.promise
      })
      .then(() => alive && setFailed(false))
      .catch((err: unknown) => {
        const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : ''
        if (alive && name !== 'RenderingCancelledException') setFailed(true)
      })
    return () => {
      alive = false
      task?.cancel()
    }
  }, [doc, n, near, cssWidth])

  return (
    <div
      ref={box}
      className="relative overflow-hidden bg-white shadow-[0_1px_3px_rgba(0,0,0,0.18)]"
      style={{ width: cssWidth, height: cssWidth * ratio }}
    >
      <canvas ref={canvas} role="img" aria-label={`Halaman ${n} dari ${total}`} className="block h-full w-full" />
      {failed ? (
        <span className="absolute inset-0 flex items-center justify-center t-footnote text-ink-2">Halaman {n} belum bisa ditampilkan</span>
      ) : null}
    </div>
  )
}

/* ---------- Word (.docx) ---------- */

/** Tautan di dokumen: hanya http(s)/mailto (tab baru); lainnya dilepas. Jangkar internal (#) dibiarkan. */
function tidyLinks(root: HTMLElement) {
  for (const a of Array.from(root.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href') ?? ''
    if (href.startsWith('#')) continue
    if (/^(https?:|mailto:)/i.test(href)) {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer')
    } else {
      a.removeAttribute('href')
    }
  }
}

function DocxView({ data, zoom, onError }: { data: ArrayBuffer; zoom: number; onError: (msg: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const styles = useRef<HTMLDivElement>(null)
  const width = useWidth(scroller)
  const [pageWidth, setPageWidth] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const host = body.current
    const style = styles.current
    if (!host || !style) return
    import('docx-preview')
      .then(({ renderAsync }) =>
        renderAsync(data.slice(0), host, style, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          useBase64URL: true,
          renderComments: false,
          experimental: false,
        })
      )
      .then(() => {
        if (!alive) return
        tidyLinks(host)
        const section = host.querySelector<HTMLElement>('section.docx')
        setPageWidth(section ? section.offsetWidth : null)
      })
      .catch(() => alive && onError('Dokumen Word ini belum bisa ditampilkan. Unduh untuk membukanya.'))
    return () => {
      alive = false
      host.replaceChildren()
      style.replaceChildren()
    }
  }, [data, onError])

  // Muat selebar wadah: halaman A4 (±794px) diperkecil di layar sempit, tidak diperbesar di layar lebar.
  const fit = pageWidth && width ? Math.min(1, width / (pageWidth + 24)) : 1

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-auto overscroll-contain" tabIndex={0} aria-label="Isi dokumen" data-doc-scroll>
      <div ref={styles} hidden />
      <div
        ref={body}
        style={{ zoom: fit * zoom }}
        className="[&_.docx-wrapper]:bg-transparent! [&_.docx-wrapper]:p-3! [&_.docx-wrapper>section.docx]:mb-3! [&_.docx-wrapper>section.docx]:shadow-[0_1px_3px_rgba(0,0,0,0.18)]!"
      />
    </div>
  )
}

/* ---------- Pop-up penampil ---------- */

/**
 * Pop-up penampil satu dokumen (dibuka dari baris dokumen). Radix Dialog:
 * fokus terkunci, Esc menutup, fokus kembali ke baris pemicu — termasuk saat
 * dibuka dari dalam pop-up rincian (dialog bersarang).
 */
export function DocViewerDialog({
  item,
  kind,
  open,
  onOpenChange,
}: {
  item: OverviewEvidence
  kind: EvidenceDocKind
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="mk-scrim" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[var(--z-sheet)] flex items-center justify-center p-2 outline-none sm:p-4"
        >
          <div className="flex h-full max-h-[1100px] w-full max-w-[1000px] flex-col gap-2 rounded-[var(--radius-xl)] bg-surface p-3 shadow-[var(--shadow-sheet)] sm:p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="t-headline text-ink break-words">{item.fileName}</DialogPrimitive.Title>
              </div>
              <DialogPrimitive.Close asChild>
                <IconButton icon="tutup" label="Tutup" variant="filled" />
              </DialogPrimitive.Close>
            </div>
            {open ? <DocViewer item={item} kind={kind} className="min-h-0 flex-1" /> : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
