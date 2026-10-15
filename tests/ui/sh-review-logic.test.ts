import { describe, expect, it } from 'vitest'

/**
 * Persetujuan Supervisor (kontrak subholding 16 Okt 2026, papan 5): gerbang
 * tombol keputusan (minta perbaikan wajib ≥5 huruf, setujui wajib ≥1 bukti,
 * hanya MENUNGGU), laporan berikutnya setelah memutuskan, dan 409 yang ramah.
 */

import {
  decisionGate, friendlyError, letterCount, nextAfterDecision, resolveSelected, shouldReload, totalWaiting,
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
