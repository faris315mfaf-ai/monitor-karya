'use client'

/**
 * Atur anggota divisi: siapa anggota (User.divisionId) dan proyek mana milik
 * divisi (Project.divisionId). Perubahan bisa dibalik, jadi tanpa konfirmasi —
 * toast "Urungkan" mengembalikan nilai sebelumnya.
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { EmptyNote, ErrorNote, Sheet, Skeleton } from '@/components/mk'
import { SectionTitle, SwitchRow } from '@/components/companies/parts'
import { ROLE_LABELS } from '@/lib/constants'
import { postJson } from './use-kadiv'

type Person = { id: string; name: string; title: string | null; role: string; divisionId: string | null; divisionName: string | null; isMember: boolean }
type Proj = { id: string; code: string; name: string; picName: string | null; divisionId: string | null; divisionName: string | null }
type Data = { division: { id: string; name: string }; people: Person[]; projects: Proj[] }

export function MembersSheet({
  open,
  divisionId,
  onClose,
  onChanged,
}: {
  open: boolean
  divisionId: string
  onClose: () => void
  onChanged: () => void | Promise<void>
}) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/kadiv/members?divisionId=${encodeURIComponent(divisionId)}`, { cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Anggota belum termuat')
      setData(j as Data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anggota belum termuat')
    }
  }, [divisionId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) void load()
  }, [open, load])

  async function put(key: string, body: Record<string, unknown>, undoBody: Record<string, unknown> | null, msg: string) {
    setBusy(key)
    try {
      await postJson('/api/kadiv/members', { divisionId, ...body }, 'PUT')
      toast.success(msg, undoBody ? {
        action: {
          label: 'Urungkan',
          onClick: async () => {
            try {
              await postJson('/api/kadiv/members', undoBody, 'PUT')
              await Promise.all([load(), onChanged()])
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Belum berhasil diurungkan')
            }
          },
        },
      } : undefined)
      await Promise.all([load(), onChanged()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Perubahan belum tersimpan')
    } finally {
      setBusy(null)
    }
  }

  const divName = data?.division.name ?? 'divisi ini'

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} eyebrow="Tim" title="Atur anggota" subtitle={`Divisi ${divName}`} backLabel="Tim" size="wide">
      {error && !data ? (
        <ErrorNote message={error} onRetry={() => void load()} />
      ) : !data ? (
        <div className="flex flex-col gap-3" aria-busy>
          <Skeleton h={48} />
          <Skeleton h={48} />
          <Skeleton h={48} />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <SectionTitle icon="tim">Anggota</SectionTitle>
            <p className="t-footnote text-ink-2">Anggota dihitung di laporan harian tim, beban kerja, dan output harian.</p>
            {data.people.length === 0 ? (
              <EmptyNote icon="pengguna">Belum ada akun aktif di PT ini.</EmptyNote>
            ) : (
              data.people.map((p) => (
                <SwitchRow
                  key={p.id}
                  id={`mem-${p.id}`}
                  title={p.name}
                  description={[p.title || ROLE_LABELS[p.role] || p.role, p.divisionName && !p.isMember ? `kini di ${p.divisionName}` : null].filter(Boolean).join(' · ')}
                  checked={p.isMember}
                  disabled={busy !== null}
                  onChange={(v) =>
                    void put(
                      `u-${p.id}`,
                      { userId: p.id, member: v },
                      // Urungkan: kembali ke divisi sebelumnya bila ada, selain itu lepas dari divisi ini.
                      p.divisionId && p.divisionId !== divisionId
                        ? { divisionId: p.divisionId, userId: p.id, member: true }
                        : { divisionId, userId: p.id, member: !v },
                      v ? `${p.name} masuk divisi ${divName}.` : `${p.name} keluar dari divisi ${divName}.`,
                    )
                  }
                />
              ))
            )}
          </section>
          <section className="flex flex-col gap-2">
            <SectionTitle icon="proyek">Proyek divisi</SectionTitle>
            <p className="t-footnote text-ink-2">Output proyek yang ditautkan masuk ke antrean review Anda. Proyek tanpa divisi mengikuti divisi PIC-nya.</p>
            {data.projects.length === 0 ? (
              <EmptyNote icon="proyek">Belum ada proyek aktif di PT ini.</EmptyNote>
            ) : (
              data.projects.map((p) => {
                const mine = p.divisionId === divisionId
                return (
                  <SwitchRow
                    key={p.id}
                    id={`prj-${p.id}`}
                    title={`${p.code} · ${p.name}`}
                    description={[p.picName ? `PIC ${p.picName}` : 'Tanpa PIC', p.divisionName && !mine ? `kini di ${p.divisionName}` : null].filter(Boolean).join(' · ')}
                    checked={mine}
                    disabled={busy !== null}
                    onChange={(v) =>
                      void put(
                        `p-${p.id}`,
                        { projectId: p.id, assign: v },
                        p.divisionId && p.divisionId !== divisionId
                          ? { divisionId: p.divisionId, projectId: p.id, assign: true }
                          : { divisionId, projectId: p.id, assign: !v },
                        v ? `${p.name} ditautkan ke divisi ${divName}.` : `${p.name} dilepas dari divisi ${divName}.`,
                      )
                    }
                  />
                )
              })
            )}
          </section>
        </div>
      )}
    </Sheet>
  )
}
