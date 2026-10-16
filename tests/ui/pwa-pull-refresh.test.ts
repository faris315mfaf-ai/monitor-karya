import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

/**
 * Tarik-muat-ulang (KONTRAK-FASE1-PWA.md C.4): fisika karet, keputusan picu
 * (ambang 72px + proyeksi momentum ringan), histeresis arah, kecepatan lepas.
 */

import {
  PULL_HOLD, PULL_SLOP, PULL_THRESHOLD, PullToRefresh, RUBBER_C,
  projectPull, pullIntent, type PullToRefreshProps, pullVelocity, rubberband, rubberbandInverse, shouldTrigger,
} from '@/components/mk/pull-refresh'

describe('rubberband', () => {
  it('nol tetap nol; nilai tak sah → 0', () => {
    expect(rubberband(0, 800)).toBe(0)
    expect(rubberband(Number.NaN, 800)).toBe(0)
    expect(rubberband(50, 0)).toBe(0)
    expect(rubberband(50, Number.POSITIVE_INFINITY)).toBe(0)
    expect(rubberband(50, 800, 0)).toBe(0)
  })

  it('rumus (1 − 1/(x·c/d + 1))·d dengan c = 0,55', () => {
    expect(RUBBER_C).toBe(0.55)
    const x = 144
    const d = 800
    expect(rubberband(x, d)).toBeCloseTo((1 - 1 / ((x * 0.55) / d + 1)) * d, 10)
  })

  it('kira-kira 1:1·c di awal, naik monoton, tak pernah melampaui dimensi', () => {
    const d = 800
    expect(rubberband(1, d)).toBeCloseTo(0.55, 2)
    let prev = 0
    for (const x of [5, 20, 72, 150, 400, 2000, 100000]) {
      const y = rubberband(x, d)
      expect(y).toBeGreaterThan(prev)
      expect(y).toBeLessThan(d)
      expect(y).toBeLessThan(x)
      prev = y
    }
  })

  it('tanda dipertahankan (simetris)', () => {
    expect(rubberband(-100, 800)).toBeCloseTo(-rubberband(100, 800), 10)
  })

  it('kebalikannya mengembalikan jarak jari', () => {
    for (const x of [1, 30, 144, 600]) {
      expect(rubberbandInverse(rubberband(x, 800), 800)).toBeCloseTo(x, 6)
    }
    expect(rubberbandInverse(0, 800)).toBe(0)
    expect(Number.isFinite(rubberbandInverse(800, 800))).toBe(true)
  })

  it('ambang tampak 72px butuh tarikan jari ±144px di layar 800px', () => {
    const raw = rubberbandInverse(PULL_THRESHOLD, 800)
    expect(raw).toBeGreaterThan(130)
    expect(raw).toBeLessThan(160)
  })
})

describe('projectPull', () => {
  it('proyeksi ringan (laju 0,99) dan aman untuk nilai tak sah', () => {
    expect(projectPull(0)).toBe(0)
    expect(projectPull(1000)).toBeCloseTo(99, 6)
    expect(projectPull(-500)).toBeCloseTo(-49.5, 6)
    expect(projectPull(Number.NaN)).toBe(0)
    expect(projectPull(1000, 1)).toBe(0)
  })
})

describe('shouldTrigger', () => {
  it('melewati ambang → picu', () => {
    expect(shouldTrigger(PULL_THRESHOLD, 0)).toBe(true)
    expect(shouldTrigger(90, 0)).toBe(true)
  })

  it('di bawah ambang tanpa momentum → tidak', () => {
    expect(shouldTrigger(71, 0)).toBe(false)
    expect(shouldTrigger(0, 5000)).toBe(false)
    expect(shouldTrigger(-10, 5000)).toBe(false)
  })

  it('momentum ke bawah melengkapi tarikan setengah ambang', () => {
    expect(shouldTrigger(40, 400)).toBe(true) // 40 + 39,6 ≥ 72
    expect(shouldTrigger(40, 200)).toBe(false) // 40 + 19,8 < 72
  })

  it('kibasan pendek di bawah setengah ambang tidak memicu walau cepat', () => {
    expect(shouldTrigger(30, 3000)).toBe(false)
  })

  it('melepas sambil bergerak ke atas membatalkan, bahkan setelah ambang', () => {
    expect(shouldTrigger(100, -400)).toBe(false)
    expect(shouldTrigger(100, -50)).toBe(true)
  })

  it('nilai tak sah aman', () => {
    expect(shouldTrigger(Number.NaN, 0)).toBe(false)
    expect(shouldTrigger(100, Number.NaN)).toBe(true)
    expect(shouldTrigger(100, 0, 0)).toBe(false)
  })

  it('indikator memuat berhenti di bawah ambang', () => {
    expect(PULL_HOLD).toBe(48)
    expect(PULL_HOLD).toBeLessThan(PULL_THRESHOLD)
  })
})

describe('pullIntent', () => {
  it('belum melewati histeresis → pending', () => {
    expect(PULL_SLOP).toBe(10)
    expect(pullIntent(0, 0)).toBe('pending')
    expect(pullIntent(3, 6)).toBe('pending')
  })

  it('dominan vertikal ke bawah → pull', () => {
    expect(pullIntent(0, 12)).toBe('pull')
    expect(pullIntent(5, 11)).toBe('pull')
  })

  it('ke atas (gulir biasa) atau menyamping (karusel) → ignore', () => {
    expect(pullIntent(0, -12)).toBe('ignore')
    expect(pullIntent(12, 3)).toBe('ignore')
    expect(pullIntent(-12, 8)).toBe('ignore')
    expect(pullIntent(10, 10)).toBe('ignore') // diagonal sempurna tidak diklaim
    expect(pullIntent(Number.NaN, 20)).toBe('ignore')
  })
})

describe('pullVelocity', () => {
  it('kurang dari dua sampel → 0', () => {
    expect(pullVelocity([])).toBe(0)
    expect(pullVelocity([{ t: 0, y: 10 }])).toBe(0)
  })

  it('px/s dari jendela 100 ms terakhir', () => {
    const s = [
      { t: 0, y: 0 },
      { t: 200, y: 10 },
      { t: 250, y: 30 },
      { t: 300, y: 50 },
    ]
    // jendela: t=200..300 → (50−10)/0,1 dtk = 400 px/s
    expect(pullVelocity(s)).toBeCloseTo(400, 6)
  })

  it('sampel lama tetap dipakai bila hanya itu yang ada', () => {
    expect(pullVelocity([{ t: 0, y: 0 }, { t: 500, y: 50 }])).toBeCloseTo(100, 6)
  })

  it('waktu tidak maju → 0', () => {
    expect(pullVelocity([{ t: 5, y: 0 }, { t: 5, y: 50 }])).toBe(0)
  })
})

describe('PullToRefresh (render server)', () => {
  it('merender isi apa adanya, wilayah status aria-live, tanpa aria-busy saat diam', () => {
    const html = renderToStaticMarkup(
      createElement(PullToRefresh, { onRefresh: () => undefined } as PullToRefreshProps, createElement('p', null, 'Isi antrean'))
    )
    expect(html).toContain('<p>Isi antrean</p>')
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain('aria-busy')
    expect(html).not.toContain('Memuat ulang')
  })
})
