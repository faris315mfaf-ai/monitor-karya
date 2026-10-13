import { describe, expect, it } from 'vitest'
import { formatFileSize, formatRpShort } from '@/lib/format'

describe('formatFileSize', () => {
  it('memakai koma desimal Indonesia untuk MB', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(48 * 1024)).toBe('48 KB')
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1,5 MB')
  })
})

describe('formatRpShort', () => {
  it('selalu memberi spasi setelah Rp', () => {
    expect(formatRpShort(5000)).toBe('Rp 5.000')
    expect(formatRpShort(null)).toBe('Rp 0')
    expect(formatRpShort(1.2e9)).toBe('Rp 1,2 M')
  })
})
