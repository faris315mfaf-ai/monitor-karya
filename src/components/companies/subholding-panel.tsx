'use client'

/**
 * Tampilan "Subholding" di Perusahaan & akun (papan 10 mockup, kontrak
 * 16 Okt 2026): struktur PT BIKE Tbk → subholding → PT di kiri, akun model
 * laporan subholding (Admin subholding, Supervisor, Ketua Umum, Manajemen)
 * di kanan. Semua perubahan lewat Sheet.
 */

import { Button, Card, EmptyNote, Icon, StatusBadge, cx } from '@/components/mk'
import { roleLabel, type CompaniesData, type Company, type UserRow } from '@/lib/accounts'
import { UserRowButton } from './company-sheet'
import { CompanyLogo } from './parts'
import { SH_ROLES, SH_ROLE_OPTIONS, isSubholding, subholdingTree } from './subholding'

const SCOPE_LABEL: Record<string, string> = {
  SUPERVISOR: 'Semua subholding · Persetujuan',
  KETUA_UMUM: 'Seluruh PT BIKE Tbk · Dashboard',
  MANAJEMEN: 'Seluruh PT BIKE Tbk · Dashboard',
}

export function SubholdingPanel({
  data,
  q,
  onAddSubholding,
  onAddPt,
  onOpenCompany,
  onOpenUser,
  onAddAccount,
  onMovePt,
}: {
  data: CompaniesData
  q: string
  onAddSubholding: () => void
  onAddPt: (subholding: Company) => void
  /** Pindahkan PT ke subholding lain / dari holding (SH-PINDAH-PT). */
  onMovePt?: (pt: Company) => void
  onOpenCompany: (c: Company) => void
  onOpenUser: (u: UserRow, c: Company | null) => void
  onAddAccount: (company: Company | null) => void
}) {
  const tree = subholdingTree(data.companies)
  const needle = q.trim().toLowerCase()
  const match = (s: string | null | undefined) => !needle || (s ?? '').toLowerCase().includes(needle)
  const subCount = data.companies.filter(isSubholding).length

  const shAccounts = [
    ...data.holdingUsers.map((u) => ({ u, c: null as Company | null })),
    ...data.companies.flatMap((c) => c.users.map((u) => ({ u, c }))),
  ]
    .filter(({ u }) => SH_ROLES.includes(u.role))
    .filter(({ u, c }) => match(u.name) || match(u.username) || match(c?.name) || match(roleLabel(u.role)))
    .sort((a, b) => SH_ROLES.indexOf(b.u.role) - SH_ROLES.indexOf(a.u.role) || a.u.name.localeCompare(b.u.name))

  return (
    <div className="mk-row">
      <Card
        className="is-narrow"
        title="Struktur"
        subtitle={`${subCount} subholding`}
        action={
          <Button size="sm" variant="primary" icon="tambah" onClick={onAddSubholding}>
            Tambah subholding
          </Button>
        }
      >
        {tree.length === 0 ? (
          <EmptyNote icon="gedung">Belum ada holding. Buat holding PT BIKE Tbk dulu dari tampilan Perusahaan.</EmptyNote>
        ) : (
          <div className="flex flex-col gap-4">
            {tree.map(({ holding, subholdings, directPts }) => (
              <div key={holding.id} className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => onOpenCompany(holding)}
                  className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--grafit-fill)] px-3.5 py-3 text-left text-[var(--on-grafit)] cursor-pointer"
                >
                  <CompanyLogo company={holding} size={32} />
                  <span className="t-body-strong min-w-0 flex-1 truncate">{holding.name}</span>
                  <span className="t-caption opacity-80">Superholding</span>
                </button>
                <div className="ml-4 flex flex-col gap-3 border-l-2 border-[var(--line)] pl-3.5">
                  {subholdings.length === 0 ? (
                    <p className="t-footnote text-ink-2">Belum ada subholding di bawah {holding.name}.</p>
                  ) : null}
                  {subholdings
                    .filter(({ subholding: s, pts }) => match(s.name) || match(s.code) || pts.some((p) => match(p.name)))
                    .map(({ subholding: s, pts, admins }) => {
                      const admin = admins[0] ?? null
                      return (
                        <div key={s.id} className={cx('flex flex-col gap-2', !s.isActive && 'opacity-60')}>
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => onOpenCompany(s)} className="t-body-strong text-ink text-left cursor-pointer hover:underline">
                              {s.name}
                            </button>
                            <span className="t-caption text-ink-2">
                              <span className="font-mono">{s.code}</span> · {pts.length} PT
                            </span>
                            {!s.isActive ? (
                              <StatusBadge status="neutral" size="sm">
                                Nonaktif
                              </StatusBadge>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {pts.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => onOpenCompany(p)}
                                className={cx('mk-tag cursor-pointer hover:bg-fill-2', !p.isActive && 'line-through')}
                                title={p.isActive ? p.name : `${p.name} (nonaktif)`}
                              >
                                {p.name}
                              </button>
                            ))}
                            <Button size="sm" variant="plain" icon="tambah" onClick={() => onAddPt(s)}>
                              Tambah PT
                            </Button>
                          </div>
                          {admin ? (
                            <button
                              type="button"
                              onClick={() => onOpenUser(admin, s)}
                              className="flex items-center gap-2 t-footnote text-ink-2 text-left cursor-pointer hover:text-ink"
                            >
                              <Icon name="kunci" size={14} className="text-ink-3" />
                              <span className="font-mono">{admin.username ?? admin.name}</span>
                              <span>· {admin.lastLoginAt ? 'sudah pernah masuk' : 'belum pernah masuk'}</span>
                            </button>
                          ) : (
                            <Button size="sm" variant="plain" icon="pengguna" onClick={() => onAddAccount(s)}>
                              Buat akun Admin subholding
                            </Button>
                          )}
                        </div>
                      )
                    })}
                  {directPts.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="t-caption text-ink-2">PT langsung di bawah {holding.name}</span>
                      {onMovePt ? (
                        <p className="t-footnote text-ink-2">Pindahkan ke subholding agar PT ini bisa dilaporkan Admin subholding.</p>
                      ) : null}
                      <div className="flex flex-col">
                        {directPts.filter((p) => match(p.name)).map((p) => (
                          <div key={p.id} className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] py-1.5 last:border-b-0">
                            <button
                              type="button"
                              onClick={() => onOpenCompany(p)}
                              className={cx('min-w-0 flex-1 truncate text-left t-body text-ink cursor-pointer hover:underline', !p.isActive && 'line-through')}
                              title={p.isActive ? p.name : `${p.name} (nonaktif)`}
                            >
                              {p.name}
                            </button>
                            {onMovePt ? (
                              <Button size="sm" variant="plain" icon="alur" onClick={() => onMovePt(p)} aria-label={`Pindahkan ${p.name} ke subholding`}>
                                Pindahkan ke subholding
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        className="is-wide"
        title="Akun laporan subholding"
        subtitle={SH_ROLE_OPTIONS.map((o) => o.label).join(' · ')}
        action={
          <Button size="sm" icon="tambah" onClick={() => onAddAccount(null)}>
            Tambah akun
          </Button>
        }
      >
        <p className="mk-note-box mk-soft--risk mb-3">
          Membuat subholding otomatis membuat <strong>satu akun Admin subholding</strong>. Sandi awal ditampilkan sekali dan wajib diganti saat
          masuk pertama. Supervisor, Ketua Umum, dan Manajemen adalah akun pribadi tingkat grup.
        </p>
        {shAccounts.length === 0 ? (
          <EmptyNote icon="pengguna">Belum ada akun Supervisor, Ketua Umum, Manajemen, atau Admin subholding.</EmptyNote>
        ) : (
          <div className="mk-list">
            {shAccounts.map(({ u, c }) => (
              <UserRowButton
                key={u.id}
                u={u}
                me={data.me}
                onClick={() => onOpenUser(u, c)}
                sub={`${roleLabel(u.role)} · ${u.role === 'ADMIN_SUBHOLDING' ? `${c?.name ?? 'subholding'} · dipakai bersama` : (SCOPE_LABEL[u.role] ?? 'Tingkat grup')}`}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
