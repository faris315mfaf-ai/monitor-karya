import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

vi.mock('@/components/mk', async (original) => ({
  ...await original<typeof import('@/components/mk')>(),
  Sheet: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}))
vi.mock('@/components/evidence-panel', () => ({ EvidencePanel: () => null }))
import { TaskDialog } from '@/components/task-dialog'

function radios(locked: boolean) {
  const html = renderToStaticMarkup(createElement(TaskDialog, { open: true, onOpenChange: vi.fn(), projectId: 'p1', projectName: 'Absensi', task: null, locked, onSaved: vi.fn() }))
  expect(html).toContain('role="radiogroup"'); expect(html).toContain('aria-label="Urgensi"')
  return html.match(/<button[^>]*role="radio"[^>]*>/g) ?? []
}

it('formulir urgensi memakai satu tab stop pada pilihan aktif', () => {
  const items = radios(false)
  expect(items).toHaveLength(4)
  expect(items.filter((item) => item.includes('tabindex="0"'))).toHaveLength(1)
  expect(items.filter((item) => item.includes('tabindex="-1"'))).toHaveLength(3)
  expect(items.find((item) => item.includes('tabindex="0"'))).toContain('aria-checked="true"')
})

it('urgensi laporan terkunci tidak menyisakan radio yang dapat diaktifkan', () => {
  const items = radios(true)
  expect(items).toHaveLength(4)
  for (const item of items) {
    expect(item).toContain('disabled=""')
  }
})
