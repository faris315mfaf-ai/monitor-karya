'use client'

/**
 * Pindahkan PT ke subholding (SH-PINDAH-PT, 16 Okt 2026). PT lama di
 * produksi berada langsung di bawah PT BIKE Tbk; Super Admin memindahkannya
 * ke subholding (atau kembali ke holding) lewat PATCH /api/companies
 * { id, parentId }. Server menulis ulang struktur PT beserta bagian di
 * bawahnya dalam satu transaksi. Sukses → struktur dimuat ulang.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Icon, Sheet } from '@/components/mk'
import { call, type Company } from '@/lib/accounts'
import { Field, SectionTitle, selectCls } from './parts'
import { moveSuccessText, moveTargets } from './subholding'

export function MoveCompanySheet({
  company,
  companies,
  onClose,
  onSaved,
}: {
  /** PT yang dipindah; null = sheet tertutup. */
  company: Company | null
  companies: Company[]
  onClose: () => void
  onSaved: () => void
}) {
  const [last, setLast] = useState<Company | null>(company)
  if (company && company !== last) setLast(company)
  const c = company ?? last
  return (
    <Sheet
      open={Boolean(company)}
      onOpenChange={(o) => !o && onClose()}
      backLabel="Perusahaan"
      title="Pindahkan ke subholding"
      subtitle={c ? `${c.name}${c.parentName ? ` · sekarang di bawah ${c.parentName}` : ''}` : undefined}
    >
      {company ? <MoveForm key={company.id} company={company} companies={companies} onClose={onClose} onSaved={onSaved} /> : null}
    </Sheet>
  )
}

function MoveForm({
  company,
  companies,
  onClose,
  onSaved,
}: {
  company: Company
  companies: Company[]
  onClose: () => void
  onSaved: () => void
}) {
  const targets = moveTargets(companies, company)
  const subs = targets.filter((t) => t.kind === 'subholding')
  const holds = targets.filter((t) => t.kind === 'holding')
  const [parentId, setParentId] = useState(targets[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!parentId) return
    setBusy(true)
    setErr(null)
    const r = await call('/api/companies', 'PATCH', { id: company.id, parentId })
    setBusy(false)
    if (!r.ok) {
      setErr(r.error ?? 'PT belum dipindah. Coba lagi.')
      return
    }
    const to = targets.find((t) => t.id === parentId)?.name ?? 'induk baru'
    const open = (r.json.subholdingReports as { open?: number } | undefined)?.open ?? 0
    toast.success(moveSuccessText({ pt: company.name, to, open }))
    onSaved()
    onClose()
  }

  return (
    <>
      <section className="mk-formsec">
        <SectionTitle icon="gedung">Induk baru</SectionTitle>
        {targets.length === 0 ? (
          <p className="mk-note-box mk-soft--info">Belum ada subholding aktif lain. Tambah subholding dulu dari tampilan Subholding.</p>
        ) : (
          <Field label="Pindahkan ke" htmlFor="mv-parent" required>
            <select id="mv-parent" className={selectCls} value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={busy}>
              {subs.length ? (
                <optgroup label="Subholding">
                  {subs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {holds.length ? (
                <optgroup label="Langsung di bawah holding">
                  {holds.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </Field>
        )}
        <ul className="flex flex-col gap-2 t-footnote text-ink-2">
          <li className="flex gap-2">
            <Icon name="info" size={14} className="mt-[3px] shrink-0 text-ink-3" />
            <span>Akun, divisi, dan proyek PT ini ikut pindah. Admin subholding tujuan bisa langsung memilih PT ini sebagai PT pelaksana.</span>
          </li>
          <li className="flex gap-2">
            <Icon name="info" size={14} className="mt-[3px] shrink-0 text-ink-3" />
            <span>Laporan subholding yang sudah ada tetap milik subholding asalnya dan tidak ikut pindah.</span>
          </li>
        </ul>
      </section>
      {err ? (
        <p className="mk-note-box mk-soft--late" role="alert">
          {err}
        </p>
      ) : null}
      <div className="mk-sheetactions">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Batal
        </Button>
        <Button variant="primary" onClick={() => void submit()} disabled={busy || !parentId}>
          {busy ? 'Memindahkan…' : 'Pindahkan'}
        </Button>
      </div>
    </>
  )
}
