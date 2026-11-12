import { describe, expect, it } from 'vitest'

/**
 * Layar ponsel dashboard laporan disetujui (KONTRAK-MANAJEMEN-MOBILE.md D3):
 * fisika gestur (proyeksi momentum, ambang tutup lembar/geser-kembali), label
 * tanggal, nama pendek, dan galeri.
 */

import {
  DECELERATION, DISMISS_RATIO, REVERSE_SPEED,
  backLabel, counterLabel, dayHeading, monoOf, project, shouldDismiss, slideIndex,
} from '@/components/views/sh-overview/mobile/mobile-logic'

describe('proyeksi momentum', () => {
  it('memakai rumus (v/1000)·d/(1−d) dengan d = 0,998', () => {
    expect(DECELERATION).toBe(0.998)
    expect(project(1000)).toBeCloseTo(499, 5)
    expect(project(500)).toBeCloseTo(249.5, 5)
    expect(project(-1000)).toBeCloseTo(-499, 5)
    expect(project(0)).toBe(0)
    expect(project(1000, 0.99)).toBeCloseTo(99, 5)
  })

  it('kecepatan tidak sah → 0', () => {
    expect(project(Number.NaN)).toBe(0)
    expect(project(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('ambang tutup lembar & geser-kembali', () => {
  const H = 600

  it('seret pelan melewati separuh → tutup; kurang dari separuh → kembali', () => {
    expect(DISMISS_RATIO).toBe(0.5)
    expect(shouldDismiss(320, 0, H)).toBe(true)
    expect(shouldDismiss(280, 0, H)).toBe(false)
  })

  it('lemparan pendek tetap menutup karena titik proyeksi melewati ambang', () => {
    // 40 + project(800) ≈ 40 + 399 = 439 > 300
    expect(shouldDismiss(40, 800, H)).toBe(true)
    // 40 + project(400) ≈ 240 < 300
    expect(shouldDismiss(40, 400, H)).toBe(false)
  })

  it('jari bergerak balik dengan jelas → batal walau posisi sudah jauh', () => {
    expect(shouldDismiss(500, -(REVERSE_SPEED + 1), H)).toBe(false)
    // Gerak balik sangat pelan tidak dianggap pembatalan.
    expect(shouldDismiss(500, -50, H)).toBe(true)
  })

  it('ukuran tidak sah tidak pernah menutup', () => {
    expect(shouldDismiss(500, 2000, 0)).toBe(false)
    expect(shouldDismiss(500, 2000, Number.NaN)).toBe(false)
  })

  it('rasio bisa diatur', () => {
    expect(shouldDismiss(200, 0, H, 0.3)).toBe(true)
  })
})

describe('tanggal', () => {
  it('kepala hari', () => {
    expect(dayHeading('2026-10-15')).toBe('Kamis, 15 Oktober')
    expect(dayHeading('bukan-tanggal')).toBe('')
  })
})

describe('teks', () => {
  it('inisial subholding', () => {
    expect(monoOf('Sigma Internasional')).toBe('S')
  })

  it('label kembali', () => {
    expect(backLabel('Ringkasan')).toBe('Ringkasan')
    expect(backLabel('Sentra Multikarya Infrastruktur')).toBe('Kembali')
    expect(backLabel('')).toBe('Kembali')
  })
})

describe('galeri', () => {
  it('indeks slide dari posisi gulir, dijepit ke rentang', () => {
    expect(slideIndex(0, 390, 3)).toBe(0)
    expect(slideIndex(380, 390, 3)).toBe(1)
    expect(slideIndex(5000, 390, 3)).toBe(2)
    expect(slideIndex(-20, 390, 3)).toBe(0)
    expect(slideIndex(100, 0, 3)).toBe(0)
    expect(slideIndex(100, 390, 0)).toBe(0)
  })

  it('penanda n / N', () => {
    expect(counterLabel(0, 3)).toBe('1 / 3')
    expect(counterLabel(9, 3)).toBe('3 / 3')
    expect(counterLabel(0, 0)).toBe('')
  })
})

describe('label pendek subholding yang saling berbeda', () => {
  it('menambah kata hanya untuk yang kembar', async () => {
    const { subShorts } = await import('@/components/views/sh-overview/mobile/mobile-logic')
    expect(subShorts(['Karya Agro Lestari', 'Karya Energi Nusantara', 'Sigma Internasional Indonesia'])).toEqual(['Karya Agro', 'Karya Energi', 'Sigma'])
    expect(subShorts(['SUBHOLDING CIPTA NIAGA ALKESINDO', 'SUBHOLDING TUNAS BARU GROUP'])).toEqual(['Cipta', 'Tunas'])
    expect(subShorts(['Uji 1', 'Uji 2', 'Uji'])).toEqual(['Uji 1', 'Uji 2', 'Uji'])
    expect(subShorts([])).toEqual([])
  })
})
