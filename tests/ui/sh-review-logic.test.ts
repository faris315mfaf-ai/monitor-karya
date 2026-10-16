import { describe, expect, it } from 'vitest'

/**
 * Persetujuan Supervisor (kontrak subholding 16 Okt 2026, papan 5): gerbang
 * tombol keputusan (minta perbaikan wajib ≥5 huruf, setujui wajib ≥1 bukti,
 * hanya MENUNGGU), laporan berikutnya setelah memutuskan, dan 409 yang ramah.
 */

import {
  HIGHLIGHT_NOTE_MAX, approveConsequence, approveLabel, decisionBody, decisionGate, friendlyError, highlightNoteCheck, isHighlighted,
  letterCount, nextAfterDecision, resolveSelected, shouldReload, totalWaiting,
} from '@/components/views/sh-review/logic'

const base = { status: 'MENUNGGU' as const, note: '', evidenceCount: 2, busy: false }

describe('decisionGate', () => {
  it('minta perbaikan butuh komentar minimal 5 huruf', () => {
    expect(decisionGate({ ...base, note: 'abcd' }).canRevise).toBe(false)
    expect(decisionGate({ ...base, note: 'abcd' }).reviseHint).toMatch(/minimal 5 huruf/)
    expect(decisionGate({ ...base, note: 'abcde' }).canRevise).toBe(true)
  })
  it('spasi dan tanda baca tidak dihitung sebagai huruf', () => {
    expect(letterCount(' a . b , c ! ')).toBe(3)
    expect(decisionGate({ ...base, note: '  ok . . . !!' }).canRevise).toBe(false)
  })
  it('setujui butuh minimal satu bukti; komentar opsional', () => {
    expect(decisionGate({ ...base, evidenceCount: 0 }).canApprove).toBe(false)
    expect(decisionGate({ ...base, evidenceCount: 0 }).approveHint).toMatch(/tanpa bukti/)
    expect(decisionGate({ ...base, evidenceCount: 1 }).canApprove).toBe(true)
  })
  it('komentar saja butuh isi dan boleh di status apa pun', () => {
    expect(decisionGate({ ...base }).canComment).toBe(false)
    expect(decisionGate({ ...base, note: 'catatan' }).canComment).toBe(true)
    expect(decisionGate({ ...base, status: 'DISETUJUI', note: 'catatan' }).canComment).toBe(true)
  })
  it('laporan yang sudah diputuskan tidak bisa disetujui atau diminta perbaikan lagi', () => {
    for (const status of ['DISETUJUI', 'PERLU_PERBAIKAN'] as const) {
      const g = decisionGate({ ...base, status, note: 'cukup panjang' })
      expect(g.decidable).toBe(false)
      expect(g.canApprove).toBe(false)
      expect(g.canRevise).toBe(false)
    }
  })
  it('semua tombol terkunci selama satu permintaan berjalan', () => {
    const g = decisionGate({ ...base, note: 'cukup panjang', busy: true })
    expect([g.canApprove, g.canRevise, g.canComment]).toEqual([false, false, false])
  })
})

describe('setelah keputusan', () => {
  const q = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  it('pindah ke laporan sesudahnya', () => {
    expect(nextAfterDecision(q, 'a')).toBe('b')
    expect(nextAfterDecision(q, 'b')).toBe('c')
  })
  it('di ujung antrean mundur ke sebelumnya', () => {
    expect(nextAfterDecision(q, 'c')).toBe('b')
  })
  it('antrean habis → tidak ada pilihan', () => {
    expect(nextAfterDecision([{ id: 'a' }], 'a')).toBeNull()
  })
  it('pilihan yang hilang dari daftar jatuh ke laporan pertama', () => {
    expect(resolveSelected(q, 'x')).toBe('a')
    expect(resolveSelected(q, 'b')).toBe('b')
    expect(resolveSelected([], 'b')).toBeNull()
  })
})

describe('galat ramah', () => {
  it('409 menjelaskan laporan sudah berubah dan meminta muat ulang', () => {
    expect(friendlyError(409, 'Konflik', 'revise')).toMatch(/sudah diputuskan atau diubah/)
    expect(shouldReload(409)).toBe(true)
    expect(shouldReload(404)).toBe(true)
    expect(shouldReload(422)).toBe(false)
  })
  it('409 setujui tanpa bukti memakai pesan server', () => {
    expect(friendlyError(409, 'Laporan belum punya bukti.', 'approve')).toBe('Laporan belum punya bukti.')
  })
  it('koneksi putus', () => {
    expect(friendlyError(0, undefined, 'comment')).toMatch(/koneksi/)
  })
  it('jumlah menunggu chip "Semua subholding"', () => {
    expect(totalWaiting([{ id: 'a', name: 'A', waiting: 2 }, { id: 'b', name: 'B', waiting: 3 }])).toBe(5)
  })
})

describe('sorotan untuk manajemen', () => {
  it('angka tidak dihitung sebagai huruf (sama dengan server)', () => {
    expect(letterCount('12345')).toBe(0)
    expect(letterCount('Ruas é 2')).toBe(5)
  })
  it('catatan sorotan wajib minimal 5 huruf', () => {
    expect(highlightNoteCheck('').ok).toBe(false)
    expect(highlightNoteCheck('abcd').hint).toMatch(/minimal 5 huruf/)
    expect(highlightNoteCheck('12345 !!').ok).toBe(false)
    expect(highlightNoteCheck('  abcde  ').ok).toBe(true)
  })
  it('maksimal 280 karakter setelah spasi tepi dibuang, dengan penghitung', () => {
    const pas = 'a'.repeat(HIGHLIGHT_NOTE_MAX)
    expect(highlightNoteCheck(`  ${pas}  `)).toMatchObject({ ok: true, length: 280, remaining: 0, counter: '280/280', tone: 'near' })
    const lebih = highlightNoteCheck('a'.repeat(283))
    expect(lebih).toMatchObject({ ok: false, remaining: -3, tone: 'over' })
    expect(lebih.hint).toMatch(/Persingkat 3 karakter/)
    expect(highlightNoteCheck('abcde').tone).toBe('normal')
    expect(highlightNoteCheck('abcde').counter).toBe('5/280')
  })
  it('sakelar aktif: setujui menunggu catatan sah; sakelar mati: catatan diabaikan', () => {
    expect(decisionGate({ ...base, highlight: true, highlightNote: 'ab' })).toMatchObject({ canApprove: false, approveHint: null })
    expect(decisionGate({ ...base, highlight: true, highlightNote: 'ab' }).highlightHint).toMatch(/minimal 5 huruf/)
    expect(decisionGate({ ...base, highlight: true, highlightNote: 'Risiko mundur seminggu' }).canApprove).toBe(true)
    expect(decisionGate({ ...base, highlight: false, highlightNote: '' })).toMatchObject({ canApprove: true, highlightHint: null })
  })
  it('sorotan tidak memengaruhi minta perbaikan dan tidak berlaku setelah diputuskan', () => {
    expect(decisionGate({ ...base, note: 'tolong lengkapi', highlight: true, highlightNote: '' }).canRevise).toBe(true)
    expect(decisionGate({ ...base, status: 'DISETUJUI', highlight: true, highlightNote: '' }).highlightHint).toBeNull()
  })
  it('bukti kosong tetap menjadi penjelas utama tombol setujui', () => {
    const g = decisionGate({ ...base, evidenceCount: 0, highlight: true, highlightNote: '' })
    expect(g.canApprove).toBe(false)
    expect(g.approveHint).toMatch(/tanpa bukti/)
  })
  it('label tombol dan teks akibat mengikuti sakelar', () => {
    expect(approveLabel(true)).toBe('Setujui & sorot')
    expect(approveLabel(false)).toBe('Setujui')
    expect(approveConsequence(true)).toMatch(/Sorotan manajemen/)
    expect(approveConsequence(false)).toMatch(/daftar biasa/)
  })
  it('isi permintaan setujui selalu menyebut highlight; catatan hanya bila aktif', () => {
    expect(decisionBody('approve', { note: '', highlight: false, highlightNote: 'abaikan' })).toEqual({ action: 'approve', highlight: false })
    expect(decisionBody('approve', { note: ' oke ', highlight: true, highlightNote: '  Risiko mundur  ' })).toEqual({
      action: 'approve',
      note: 'oke',
      highlight: true,
      highlightNote: 'Risiko mundur',
    })
  })
  it('minta perbaikan tidak pernah membawa sorotan', () => {
    expect(decisionBody('revise', { note: ' perbaiki foto ', highlight: true, highlightNote: 'abcde' })).toEqual({
      action: 'revise',
      note: 'perbaiki foto',
    })
  })
  it('lencana Sorotan hanya untuk laporan disetujui yang ditandai', () => {
    expect(isHighlighted({ status: 'DISETUJUI', highlight: true })).toBe(true)
    expect(isHighlighted({ status: 'DISETUJUI', highlight: false })).toBe(false)
    expect(isHighlighted({ status: 'DISETUJUI' })).toBe(false)
    expect(isHighlighted({ status: 'MENUNGGU', highlight: true })).toBe(false)
  })
})
