'use client'

/**
 * Detail satu perusahaan di Sheet lebar: Ringkasan · Akun · Divisi · Proyek ·
 * Pengaturan. Melihat dan mengubah tanpa pindah halaman (13 · Pola layar).
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  AttentionItem, Button, EmptyNote, Icon, ProgressBar, SegmentedControl, Sheet, StatTile, StatusBadge, cx,
} from '@/components/mk'
import { call, roleLabel, type Company, type UserRow } from '@/lib/accounts'
import { PROJECT_LIFECYCLE_LABELS } from '@/lib/constants'
import { formatNumber, formatRelative } from '@/lib/format'
import { CompanyLogo, Field, InfoLine, LogoPicker, SectionTitle, SwitchRow, UserAvatar, useConfirm } from './parts'

export type CompanyTab = 'ringkasan' | 'akun' | 'divisi' | 'proyek' | 'pengaturan'

/** Kelengkapan profil perusahaan: daftar periksa yang bisa langsung ditindaklanjuti. */
export function completeness(c: Company) {
  const items = [
    { key: 'logo', label: 'Logo perusahaan', done: Boolean(c.logoData), tab: 'pengaturan' as CompanyTab },
    { key: 'contact', label: 'Alamat, telepon, dan email', done: Boolean(c.address && c.phone && c.email), tab: 'pengaturan' as CompanyTab },
    { key: 'admin', label: 'Admin PT yang aktif', done: c.type === 'HOLDING' || c.users.some((u) => u.role === 'ADMIN_PT' && u.isActive), tab: 'akun' as CompanyTab },
    { key: 'director', label: 'Direktur perusahaan', done: c.type === 'HOLDING' || c.users.some((u) => u.role === 'DIREKTUR_ENTITAS'), tab: 'akun' as CompanyTab },
    { key: 'division', label: 'Minimal satu divisi', done: c.type === 'HOLDING' || c.divisions.length > 0, tab: 'divisi' as CompanyTab },
    { key: 'heads', label: 'Setiap divisi punya kepala', done: c.divisions.every((d) => d.headUserId), tab: 'divisi' as CompanyTab },
  ]
  const done = items.filter((i) => i.done).length
  return { items, done, total: items.length, pct: Math.round((done / items.length) * 100) }
}

export function CompanySheet({
  company,
  tab,
  onTab,
  me,
  canManage,
  onClose,
  onChanged,
  onOpenUser,
}: {
  company: Company | null
  tab: CompanyTab
  onTab: (t: CompanyTab) => void
  me: string
  /** Super Admin: boleh mengubah identitas, status, dan menghapus perusahaan. */
  canManage: boolean
  onClose: () => void
  onChanged: () => void
  onOpenUser: (user: UserRow | null, company: Company) => void
}) {
  const [last, setLast] = useState<Company | null>(company)
  if (company && company !== last) setLast(company)
  const c = company ?? last

  return (
    <Sheet
      open={!!company}
      onOpenChange={(o) => !o && onClose()}
      size="wide"
      backLabel="Perusahaan"
      title={c?.name ?? ''}
      subtitle={c ? `${c.code} · ${c.type === 'HOLDING' ? 'Holding' : `Anak perusahaan${c.parentName ? ` dari ${c.parentName}` : ''}`}` : undefined}
      eyebrow={
        c ? (
          <span className="flex items-center gap-2">
            <CompanyLogo company={c} size={40} />
            {c.isActive ? <StatusBadge status="on" size="sm">Aktif</StatusBadge> : <StatusBadge status="neutral" size="sm">Nonaktif</StatusBadge>}
          </span>
        ) : undefined
      }
    >
      {c ? (
        <>
          <SegmentedControl
            full
            size="sm"
            label="Bagian detail perusahaan"
            value={tab}
            onChange={(v) => onTab(v as CompanyTab)}
            options={[
              { value: 'ringkasan', label: 'Ringkasan' },
              { value: 'akun', label: `Akun ${c.users.length}` },
              { value: 'divisi', label: `Divisi ${c.divisions.length}` },
              { value: 'proyek', label: `Proyek ${c.projects.length}` },
              ...(canManage ? [{ value: 'pengaturan', label: 'Pengaturan' }] : []),
            ]}
          />
          <div key={tab} className="mk-tabpane">
            {tab === 'ringkasan' && <Overview c={c} onTab={onTab} onOpenUser={onOpenUser} />}
            {tab === 'akun' && <Accounts c={c} me={me} onOpenUser={onOpenUser} />}
            {tab === 'divisi' && <Divisions c={c} onOpenUser={onOpenUser} />}
            {tab === 'proyek' && <Projects c={c} onOpenUser={onOpenUser} />}
            {tab === 'pengaturan' && canManage && <Settings key={c.id} c={c} onChanged={onChanged} onDeleted={onClose} />}
          </div>
        </>
      ) : null}
    </Sheet>
  )
}

/* ---------- Ringkasan ---------- */

function Overview({ c, onTab, onOpenUser }: { c: Company; onTab: (t: CompanyTab) => void; onOpenUser: (u: UserRow | null, c: Company) => void }) {
  const comp = completeness(c)
  const neverLogged = c.users.filter((u) => u.isActive && !u.lastLoginAt)
  const noPassword = c.users.filter((u) => !u.hasPassword)
  const headless = c.divisions.filter((d) => !d.headUserId)
  const picless = c.projects.filter((p) => !p.picUserId)
  const activeUsers = c.users.filter((u) => u.isActive).length

  return (
    <div className="flex flex-col gap-6">
      <div className="mk-kv4">
        <StatTile label="Akun aktif" value={activeUsers} delta={`dari ${c.users.length} akun`} tone={activeUsers === c.users.length ? 'on' : 'neutral'} onClick={() => onTab('akun')} />
        <StatTile label="Divisi" value={c.divisions.length} delta={headless.length ? `${headless.length} tanpa kepala` : 'Semua berkepala'} tone={headless.length ? 'risk' : 'on'} onClick={() => onTab('divisi')} />
        <StatTile label="Proyek" value={c.projects.length} delta={picless.length ? `${picless.length} tanpa manager` : 'Semua bermanager'} tone={picless.length ? 'risk' : 'on'} onClick={() => onTab('proyek')} />
        <StatTile label="Laporan" value={formatNumber(c.counts.dailyReports + c.counts.weeklyReports)} delta={`${formatNumber(c.counts.dailyReports)} harian · ${formatNumber(c.counts.weeklyReports)} mingguan`} tone="neutral" />
      </div>

      <section className="mk-formsec">
        <SectionTitle icon="target" action={<span className="t-footnote text-ink-2">{comp.done} dari {comp.total}</span>}>
          Kelengkapan profil
        </SectionTitle>
        <ProgressBar value={comp.pct} status={comp.pct === 100 ? 'done' : comp.pct >= 60 ? 'accent' : 'risk'} label="Kelengkapan profil" />
        <ul className="mk-checklist">
          {comp.items.map((i) => (
            <li key={i.key}>
              <button type="button" className={cx('mk-checklist__item', i.done && 'is-done')} onClick={() => onTab(i.tab)} disabled={i.done}>
                <span className="mk-checklist__box" aria-hidden>
                  {i.done ? <Icon name="selesai" size={14} strokeWidth={2.6} /> : null}
                </span>
                <span className="flex-1">{i.label}</span>
                {!i.done ? <Icon name="kanan" size={16} className="text-ink-3" /> : null}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {(neverLogged.length > 0 || noPassword.length > 0 || headless.length > 0 || picless.length > 0) && (
        <section className="mk-formsec">
          <SectionTitle icon="peringatan">Perlu perhatian</SectionTitle>
          <div>
            {noPassword.slice(0, 3).map((u) => (
              <AttentionItem key={'p' + u.id} title={u.name} reason="Belum punya kata sandi, jadi belum bisa masuk" status="late" meta={roleLabel(u.role)} onClick={() => onOpenUser(u, c)} />
            ))}
            {neverLogged.slice(0, 3).map((u) => (
              <AttentionItem key={'n' + u.id} title={u.name} reason="Belum pernah masuk sejak akunnya dibuat" status="risk" meta={roleLabel(u.role)} onClick={() => onOpenUser(u, c)} />
            ))}
            {headless.slice(0, 3).map((d) => (
              <AttentionItem key={'d' + d.id} title={`Divisi ${d.name}`} reason="Belum ada kepala divisi yang menyerahkan capaian mingguan" status="risk" onClick={() => onTab('divisi')} />
            ))}
            {picless.slice(0, 3).map((p) => (
              <AttentionItem key={'j' + p.id} title={p.name} reason="Belum ada manager proyek yang melapor harian" status="risk" onClick={() => onTab('proyek')} />
            ))}
          </div>
        </section>
      )}

      <section className="mk-formsec">
        <SectionTitle icon="gedung">Identitas</SectionTitle>
        <div className="mk-inset flex flex-col gap-2">
          <InfoLine icon="titik">
            <span className="font-mono">{c.code}</span> · {c.type === 'HOLDING' ? 'Holding' : 'Anak perusahaan'}
            {c.parentName ? ` dari ${c.parentName}` : ''}
          </InfoLine>
          <InfoLine icon="gedung">{c.address || <span className="text-ink-2">Alamat belum diisi</span>}</InfoLine>
          <InfoLine icon="notifikasi">{c.phone || <span className="text-ink-2">Telepon belum diisi</span>}</InfoLine>
          <InfoLine icon="kirim">{c.email || <span className="text-ink-2">Email belum diisi</span>}</InfoLine>
          <InfoLine icon="alur">
            {c.website ? (
              <a href={c.website} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                {c.website.replace(/^https?:\/\//, '')}
              </a>
            ) : (
              <span className="text-ink-2">Situs web belum diisi</span>
            )}
          </InfoLine>
        </div>
      </section>
    </div>
  )
}

/* ---------- Akun ---------- */

function Accounts({ c, me, onOpenUser }: { c: Company; me: string; onOpenUser: (u: UserRow | null, c: Company) => void }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const users = c.users.filter((u) => !needle || [u.name, u.username, u.email, u.title, roleLabel(u.role)].some((v) => (v ?? '').toLowerCase().includes(needle)))
  const groups = Array.from(new Set(users.map((u) => u.role)))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="mk-search flex-1 min-w-[200px]">
          <Icon name="cari" size={18} />
          <label htmlFor="co-acc-q" className="mk-sr">Cari akun</label>
          <input id="co-acc-q" type="search" placeholder="Cari nama, username, jabatan" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="primary" size="sm" icon="tambah" onClick={() => onOpenUser(null, c)}>
          Tambah akun
        </Button>
      </div>
      {users.length === 0 ? (
        <EmptyNote icon="pengguna">{c.users.length === 0 ? 'Belum ada akun di perusahaan ini.' : 'Tidak ada akun yang cocok.'}</EmptyNote>
      ) : (
        groups.map((role) => (
          <div key={role}>
            <div className="mk-grouplabel">{roleLabel(role)}</div>
            <div className="mk-list">
              {users
                .filter((u) => u.role === role)
                .map((u) => (
                  <UserRowButton key={u.id} u={u} me={me} onClick={() => onOpenUser(u, c)} />
                ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export function UserRowButton({ u, me, onClick, sub }: { u: UserRow; me: string; onClick: () => void; sub?: React.ReactNode }) {
  return (
    <button type="button" className={cx('mk-userrow', !u.isActive && 'is-off')} onClick={onClick}>
      <UserAvatar user={u} size={40} />
      <span className="min-w-0 flex-1">
        <span className="mk-userrow__name">
          {u.name}
          {u.id === me ? <span className="mk-tag">Anda</span> : null}
        </span>
        <span className="mk-userrow__meta">
          <span className="font-mono">{u.username ?? '—'}</span>
          {' · '}
          {sub ?? u.title ?? roleLabel(u.role)}
          {u.divisionName ? ` · ${u.divisionName}` : ''}
          {u.projectName ? ` · ${u.projectName}` : ''}
        </span>
      </span>
      <span className="mk-userrow__status">
        {!u.isActive ? (
          <StatusBadge status="neutral" size="sm">Nonaktif</StatusBadge>
        ) : !u.hasPassword ? (
          <StatusBadge status="late" size="sm">Tanpa sandi</StatusBadge>
        ) : u.lastLoginAt ? (
          <span className="t-footnote text-ink-2">{formatRelative(u.lastLoginAt)}</span>
        ) : (
          <StatusBadge status="risk" size="sm">Belum masuk</StatusBadge>
        )}
      </span>
      <Icon name="kanan" size={18} className="text-ink-3 shrink-0" />
    </button>
  )
}

/* ---------- Divisi & proyek ---------- */

function Divisions({ c, onOpenUser }: { c: Company; onOpenUser: (u: UserRow | null, c: Company) => void }) {
  const byId = new Map(c.users.map((u) => [u.id, u]))
  return (
    <div className="flex flex-col gap-4">
      <p className="t-footnote text-ink-2">Divisi dibuat bersama kepala divisinya. Tambah akun kepala divisi lalu pilih &quot;Divisi baru&quot; untuk menambah divisi.</p>
      {c.divisions.length === 0 ? (
        <EmptyNote icon="tim" action={<Button size="sm" icon="tambah" onClick={() => onOpenUser(null, c)}>Tambah kepala divisi</Button>}>
          Belum ada divisi.
        </EmptyNote>
      ) : (
        <div className="mk-list">
          {c.divisions.map((d, i) => {
            const head = d.headUserId ? byId.get(d.headUserId) : undefined
            return (
              <div key={d.id} className="mk-listrow">
                <span className={`mk-dot mk-tone--data-${(i % 6) + 1}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="t-body-strong truncate">Divisi {d.name}</div>
                  <div className="t-footnote text-ink-2 truncate">{d.headName ? `Kepala: ${d.headName}` : 'Belum ada kepala divisi'}</div>
                </div>
                {head ? (
                  <Button size="sm" variant="plain" onClick={() => onOpenUser(head, c)}>
                    Lihat kepala
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => onOpenUser(null, c)}>
                    Tetapkan kepala
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Projects({ c, onOpenUser }: { c: Company; onOpenUser: (u: UserRow | null, c: Company) => void }) {
  const byId = new Map(c.users.map((u) => [u.id, u]))
  return (
    <div className="flex flex-col gap-4">
      <p className="t-footnote text-ink-2">Proyek aktif dan yang masih diusulkan. Pengajuan & persetujuan proyek ada di modul Proyek.</p>
      {c.projects.length === 0 ? (
        <EmptyNote icon="proyek">Belum ada proyek.</EmptyNote>
      ) : (
        <div className="mk-list">
          {c.projects.map((p) => {
            const pic = p.picUserId ? byId.get(p.picUserId) : undefined
            return (
              <div key={p.id} className="mk-listrow">
                <div className="min-w-0 flex-1">
                  <div className="t-body-strong truncate">{p.name}</div>
                  <div className="t-footnote text-ink-2 truncate">
                    <span className="font-mono">{p.code}</span> · {p.picName ? `Manager: ${p.picName}` : 'Belum ada manager proyek'}
                  </div>
                </div>
                <StatusBadge status={p.lifecycle === 'AKTIF' ? 'on' : 'info'} size="sm">
                  {PROJECT_LIFECYCLE_LABELS[p.lifecycle] ?? p.lifecycle}
                </StatusBadge>
                {pic ? (
                  <Button size="sm" variant="plain" onClick={() => onOpenUser(pic, c)}>
                    Lihat manager
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => onOpenUser(null, c)}>
                    Tetapkan manager
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ---------- Pengaturan ---------- */

function Settings({ c, onChanged, onDeleted }: { c: Company; onChanged: () => void; onDeleted: () => void }) {
  const [name, setName] = useState(c.name)
  const [address, setAddress] = useState(c.address ?? '')
  const [phone, setPhone] = useState(c.phone ?? '')
  const [email, setEmail] = useState(c.email ?? '')
  const [website, setWebsite] = useState(c.website ?? '')
  const [logo, setLogo] = useState<string | null>(c.logoData)
  const [busy, setBusy] = useState<'save' | 'active' | 'delete' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [confirmEl, confirm] = useConfirm()

  const dirty =
    name !== c.name ||
    address !== (c.address ?? '') ||
    phone !== (c.phone ?? '') ||
    email !== (c.email ?? '') ||
    website !== (c.website ?? '') ||
    logo !== c.logoData
  const emailErr = email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Format email belum benar.' : null

  async function save() {
    setBusy('save')
    setErr(null)
    const r = await call('/api/companies', 'PATCH', { id: c.id, name, address, phone, email, website, logoData: logo })
    setBusy(null)
    if (!r.ok) return setErr(r.error ?? 'Perubahan belum tersimpan.')
    toast.success('Identitas perusahaan tersimpan.')
    onChanged()
  }

  async function setActive(next: boolean) {
    setBusy('active')
    const r = await call('/api/companies', 'PATCH', { id: c.id, isActive: next })
    setBusy(null)
    if (!r.ok) return toast.error(r.error ?? 'Status belum berubah.')
    onChanged()
    toast(next ? `${c.name} diaktifkan kembali.` : `${c.name} dinonaktifkan.`, {
      action: {
        label: 'Urungkan',
        onClick: async () => {
          await call('/api/companies', 'PATCH', { id: c.id, isActive: !next })
          onChanged()
        },
      },
    })
  }

  async function remove() {
    const ok = await confirm({
      title: `Hapus ${c.name}?`,
      description: `Perusahaan beserta ${c.counts.users} akun, ${c.counts.divisions} divisi, dan ${c.counts.projects} proyeknya akan dihapus. Perusahaan yang sudah punya laporan tidak bisa dihapus, hanya dinonaktifkan. Tindakan ini tidak bisa dibatalkan.`,
      confirmLabel: 'Hapus perusahaan',
      destructive: true,
    })
    if (!ok) return
    setBusy('delete')
    const r = await call(`/api/companies?id=${c.id}`, 'DELETE')
    setBusy(null)
    if (!r.ok) return setErr(r.error ?? 'Perusahaan belum terhapus.')
    toast.success(`${c.name} dihapus.`)
    onChanged()
    onDeleted()
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="mk-formsec">
        <SectionTitle icon="gedung">Identitas & logo</SectionTitle>
        <LogoPicker value={logo} name={name} type={c.type} onChange={setLogo} disabled={busy !== null} />
        <div className="mk-formgrid">
          <Field label="Nama perusahaan" htmlFor="cs-name" required className="is-full" error={name.trim().length < 2 ? 'Nama minimal 2 huruf.' : null}>
            <Input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Alamat" htmlFor="cs-addr" className="is-full">
            <Textarea id="cs-addr" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Jalan, kota" />
          </Field>
          <Field label="Telepon" htmlFor="cs-phone">
            <Input id="cs-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62…" />
          </Field>
          <Field label="Email" htmlFor="cs-email" error={emailErr}>
            <Input id="cs-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Situs web" htmlFor="cs-web" className="is-full">
            <Input id="cs-web" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
          </Field>
        </div>
        {err ? <p className="mk-note-box mk-soft--late">{err}</p> : null}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            disabled={!dirty || busy !== null}
            onClick={() => {
              setName(c.name)
              setAddress(c.address ?? '')
              setPhone(c.phone ?? '')
              setEmail(c.email ?? '')
              setWebsite(c.website ?? '')
              setLogo(c.logoData)
            }}
          >
            Kembalikan
          </Button>
          <Button variant="primary" disabled={!dirty || busy !== null || name.trim().length < 2 || !!emailErr} onClick={save}>
            {busy === 'save' ? 'Menyimpan…' : 'Simpan identitas'}
          </Button>
        </div>
      </section>

      <section className="mk-formsec">
        <SectionTitle icon="pengaturan">Status</SectionTitle>
        <SwitchRow
          id="cs-active"
          title="Perusahaan aktif"
          description="Perusahaan nonaktif disembunyikan dari daftar aktif. Akun dan riwayatnya tetap ada."
          checked={c.isActive}
          onChange={setActive}
          disabled={busy !== null}
        />
        <div className="mk-danger">
          <div className="min-w-0">
            <div className="t-body-strong">Hapus perusahaan</div>
            <p className="t-footnote text-ink-2">Hanya untuk perusahaan yang belum punya laporan. Tidak bisa dibatalkan.</p>
          </div>
          <Button variant="destructive" size="sm" disabled={busy !== null} onClick={remove}>
            {busy === 'delete' ? 'Menghapus…' : 'Hapus perusahaan'}
          </Button>
        </div>
      </section>
      {confirmEl}
    </div>
  )
}
