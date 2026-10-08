import { describe, expect, it } from 'vitest'
import { short3 } from '@/components/admin/compliance'

/**
 * Regresi label 3 huruf peta panas Admin di ponsel (04-admin-pt.md §Ponsel,
 * perubahan Tahap 1, commit c9a1c6c): dua kata atau lebih menjadi inisial,
 * satu kata memakai tiga huruf pertamanya. Nama lengkap tetap dibawa caption
 * kartu — itu diuji di compliance-responsive.test.ts.
 */
describe('short3 — label divisi 3 huruf', () => {
  describe('dua kata atau lebih memakai inisial', () => {
    it('tiga kata → tiga inisial (Sumber Daya Manusia → SDM)', () => {
      expect(short3('Sumber Daya Manusia')).toBe('SDM')
    })

    it('dua kata → dua inisial (Teknologi Informasi → TI)', () => {
      expect(short3('Teknologi Informasi')).toBe('TI')
    })

    it('tepat tiga kata → tiga inisial penuh', () => {
      expect(short3('Riset Dan Pengembangan')).toBe('RDP')
    })

    it('lebih dari tiga kata hanya memakai tiga inisial pertama', () => {
      expect(short3('Kemitraan Dan Pengembangan Usaha')).toBe('KDP')
      expect(short3('A B C D E')).toBe('ABC')
    })
  })

  describe('satu kata memakai tiga huruf pertama', () => {
    it('Teknologi → Tek', () => {
      expect(short3('Teknologi')).toBe('Tek')
    })

    it('Operasional → Ope', () => {
      expect(short3('Operasional')).toBe('Ope')
    })

    it('Hukum → Huk', () => {
      expect(short3('Hukum')).toBe('Huk')
    })
  })

  describe('kata tunggal pendek tidak diregangkan', () => {
    it('dua huruf tetap dua huruf', () => {
      expect(short3('IT')).toBe('IT')
      expect(short3('SD')).toBe('SD')
    })

    it('satu huruf tetap satu huruf', () => {
      expect(short3('A')).toBe('A')
    })
  })

  describe('string kosong dan spasi', () => {
    it('string kosong menghasilkan label kosong tanpa galat', () => {
      expect(short3('')).toBe('')
    })

    it('hanya spasi menghasilkan label tanpa karakter terlihat', () => {
      // Perilaku saat ini: tanpa kata, nama asli dipotong tiga karakter —
      // untuk(spasi) hasilnya spasi, yang di peta panas tampil kosong.
      const hasil = short3('   ')
      expect(hasil.length).toBeLessThanOrEqual(3)
      expect(hasil.trim()).toBe('')
    })
  })

  describe('kapital campuran dan spasi tak beraturan', () => {
    it('inisial selalu kapital meski kata sumber kecil', () => {
      expect(short3('sumber daya manusia')).toBe('SDM')
      expect(short3('teKnologi inFormasi')).toBe('TI')
    })

    it('satu kata mempertahankan kapital aslinya (data divisi Title Case)', () => {
      expect(short3('keuangan')).toBe('keu')
      expect(short3('Keuangan')).toBe('Keu')
    })

    it('spasi di tepi dan spasi ganda di antara kata diabaikan', () => {
      expect(short3('  Teknologi  ')).toBe('Tek')
      expect(short3('Sumber   Daya')).toBe('SD')
      expect(short3('  Sumber  Daya  Manusia  ')).toBe('SDM')
    })
  })
})
