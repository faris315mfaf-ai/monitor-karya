import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { guardNoteAccess } from '@/lib/oversight' // [F2-DIREKTUR] + pengawas (Kirim catatan ke PIC)
import {
  auditPic,
  noteParticipants,
  projectHeads,
  notifyInApp,
  projectScopeWhere,
  readJson,
  str,
} from '@/lib/pic-access'

/**
 * Catatan kepala divisi (6 Okt 2026) — percakapan PIC ↔ kepala divisi per
 * proyek (05-pic-proyek.md, 03-kepala-divisi.md). Hanya PIC proyek, kepala
 * divisi pelaksana proyek itu (src/lib/pic-access.ts → projectDivisionIds), dan
 * Admin PT dari PT-nya yang ikut.
 *
 * Status baca per akun [F1-D, migrasi 0019]: tabel NoteRead. Catatan dianggap
 * belum dibaca oleh akun A bila penulisnya bukan A, A belum punya NoteRead
 * untuknya, dan kolom lama `ProjectNote.readAt` kosong (kolom itu hanya terisi
 * pada catatan sebelum 0019 dan berarti dibaca semua pihak).
 *
 * Bentuk `readAt` di respons tetap: untuk catatan pihak lain = kapan Anda
 * membacanya; untuk catatan Anda = kapan pertama kali dibaca pihak lain.
 *
 *   GET   ?projectId=   — percakapan (lama → baru, 100 terakhir) + jumlah belum dibaca
 *   GET   ?unread=1     — jumlah catatan belum dibaca di semua proyek akun ini
 *   POST                — kirim catatan/balasan { projectId, body }
 *   PATCH               — tandai dibaca { projectId }: semua catatan pihak lain
 */

const NOTE_LIMIT = 100

/** Saringan catatan pihak lain yang belum dibaca akun ini. */
function unreadFor(userId: string) {
  return { authorId: { not: userId }, readAt: null, reads: { none: { userId } } }
}

/** Tandai semua catatan pihak lain di proyek ini sudah dibaca oleh akun ini. */
async function markProjectRead(projectId: string, userId: string): Promise<number> {
  const unread = await db.projectNote.findMany({
    where: { projectId, ...unreadFor(userId) },
    select: { id: true },
    take: 500,
  })
  if (unread.length === 0) return 0
  const res = await db.noteRead.createMany({
    data: unread.map((n) => ({ noteId: n.id, userId })),
    skipDuplicates: true,
  })
  return res.count
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const sp = req.nextUrl.searchParams

  if (sp.get('unread') === '1') {
    if (!['PIC_PROYEK', 'KEPALA_DIVISI', 'ADMIN_PT'].includes(user.role)) return NextResponse.json({ unread: 0 })
    const unread = await db.projectNote.count({
      where: { ...unreadFor(user.id), project: await projectScopeWhere(user) },
    })
    return NextResponse.json({ unread })
  }

  const guard = await guardNoteAccess(user, sp.get('projectId'))
  if (!guard.ok) return guard.res

  const [rows, unread] = await Promise.all([
    db.projectNote.findMany({
      where: { projectId: guard.project.id },
      orderBy: { createdAt: 'desc' },
      take: NOTE_LIMIT,
      select: {
        id: true,
        body: true,
        createdAt: true,
        readAt: true,
        authorId: true,
        author: { select: { name: true, role: true } },
        reads: { select: { userId: true, readAt: true }, orderBy: { readAt: 'asc' } },
      },
    }),
    db.projectNote.count({ where: { projectId: guard.project.id, ...unreadFor(user.id) } }),
  ])
  // Nama kepala divisi pelaksana proyek, untuk "Balas Andi…" sebelum ada percakapan.
  const heads = await projectHeads(guard.project)

  /** readAt per akun: lihat penjelasan di kepala berkas. */
  const readAtFor = (n: (typeof rows)[number]): Date | null => {
    if (n.readAt) return n.readAt
    if (n.authorId === user.id) return n.reads.find((r) => r.userId !== user.id)?.readAt ?? null
    return n.reads.find((r) => r.userId === user.id)?.readAt ?? null
  }

  return NextResponse.json({
    projectId: guard.project.id,
    projectName: guard.project.name,
    unread,
    heads: [...new Set(heads.map((h) => h.name))],
    items: rows.reverse().map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.createdAt,
      readAt: readAtFor(n),
      readCount: n.reads.filter((r) => r.userId !== n.authorId).length,
      authorId: n.authorId,
      authorName: n.author.name,
      authorRole: n.author.role,
      mine: n.authorId === user.id,
    })),
  })
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })

  const guard = await guardNoteAccess(user, body.projectId)
  if (!guard.ok) return guard.res

  const text = str(body, 'body', 2000)
  if (!text) return NextResponse.json({ error: 'Catatan tidak boleh kosong' }, { status: 422 })

  const note = await db.projectNote.create({
    data: { projectId: guard.project.id, authorId: user.id, body: text },
    select: { id: true, body: true, createdAt: true, readAt: true, authorId: true },
  })

  // Membalas berarti sudah membaca catatan pihak lain.
  await markProjectRead(guard.project.id, user.id)

  await auditPic(req, user, 'CREATE_PROJECT_NOTE', 'PROJECT_NOTE', note.id, { projectId: guard.project.id })
  const to = await noteParticipants(guard.project, user.id)
  await notifyInApp(to, 'PROJECT_NOTE', {
    title: `Catatan baru · ${guard.project.name}`,
    body: `${user.name}: ${text.length > 140 ? text.slice(0, 137) + '…' : text}`,
    tab: 'work-desk',
    projectId: guard.project.id,
    actorName: user.name,
  })

  return NextResponse.json(
    { ok: true, note: { ...note, authorName: user.name, authorRole: user.role, mine: true } },
    { status: 201 }
  )
}

export async function PATCH(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })

  const guard = await guardNoteAccess(user, body.projectId)
  if (!guard.ok) return guard.res

  const marked = await markProjectRead(guard.project.id, user.id)
  return NextResponse.json({ ok: true, marked })
}
