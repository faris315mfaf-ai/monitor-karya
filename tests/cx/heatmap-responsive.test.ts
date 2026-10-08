import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Heatmap } from '@/components/mk/data'

const days = ['Rab 23', 'Kam 24', 'Jum 25', 'Sen 28', 'Sel 29', 'Rab 30', 'Kam 1', 'Jum 2', 'Sen 5', 'Sel 6']

describe('Heatmap dalam Sheet sempit', () => {
  it('menyediakan daerah gulir bernama yang bisa dicapai keyboard untuk seluruh hari', () => {
    const html = renderToStaticMarkup(createElement(Heatmap, {
      data: [[100, 100, 100, 75, 75, 100, 100, 100, 75, 50]],
      rowLabels: ['Teknologi'], colLabels: days, cell: 26, max: 100,
      label: 'Kepatuhan harian Divisi Teknologi', formatCell: (v) => `${v}%`,
    }))
    expect(html).toMatch(/<div[^>]*role="region"[^>]*aria-label="Kepatuhan harian Divisi Teknologi[^>]*tabindex="0"/)
    expect(html.match(/class="mk-heat__cell"/g)).toHaveLength(10)
    expect(html).toContain('title="Teknologi Sel 6: 50%"')
  })

  it('mempertahankan tabel lengkap dan membedakan nol dari libur tanpa memotong label', () => {
    const row = 'Teknologi dan pengembangan produk perusahaan'
    const html = renderToStaticMarkup(createElement(Heatmap, {
      data: [[0, null, 50]], rowLabels: [row], colLabels: days.slice(0, 3),
      label: 'Kepatuhan harian', max: 100, formatCell: (v) => `${v}%`,
    }))
    expect(html).toContain('<caption>Kepatuhan harian</caption>')
    expect(html).toContain(`<th scope="row">${row}</th><td>0%</td><td>libur</td><td>50%</td>`)
    expect(html.match(/scope="col"/g)).toHaveLength(3)
    expect(html).toContain(`title="${row} Rab 23: 0%"`)
    expect(html).toContain(`title="${row} Kam 24: libur"`)
  })
})
