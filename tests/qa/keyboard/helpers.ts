/**
 * Utilitas bersama tes keyboard/fokus QA (T2-B2, backlog D).
 *
 * Vitest berjalan di environment "node" tanpa DOM (vitest.config.mts) dan
 * proyek melarang dependensi npm baru, jadi pengujian memakai dua lapis:
 *  (a) statis — membaca sumber komponen dan memverifikasi pola aksesibilitas;
 *  (b) perilaku — memanggil komponen sebagai fungsi (hook React dimock ala
 *      tests/cx/mk-accessibility.test.ts) lalu memeriksa pohon elemen dan
 *      menjalankan handler keyboard/fokus dengan objek tiruan.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)))

/** Baca berkas sumber; menerima path relatif akar repo maupun absolut. */
export function src(rel: string): string {
  return readFileSync(path.isAbsolute(rel) ? rel : path.join(ROOT, rel), 'utf8')
}

/** Semua berkas di bawah dir (relatif akar) dengan akhiran yang cocok. */
export function listFiles(dir: string, ext = /\.(tsx|ts|css)$/): string[] {
  const out: string[] = []
  const walk = (abs: string) => {
    for (const name of readdirSync(abs).sort()) {
      if (name === 'node_modules' || name === '.next') continue
      const p = path.join(abs, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (ext.test(name)) out.push(p)
    }
  }
  walk(path.join(ROOT, dir))
  return out
}

/** Jalankan pohon elemen React dan kumpulkan node yang lolos predikat.
 *  Selain children, slot `action` dan `footer` (Card/Sheet) ikut ditelusuri. */
export function nodes(tree: any, accept: (n: any) => boolean): any[] {
  if (!tree || typeof tree !== 'object') return []
  const out = accept(tree) ? [tree] : []
  for (const c of [tree.props?.children, tree.props?.action, tree.props?.footer].flat(Infinity)) {
    out.push(...nodes(c, accept))
  }
  return out
}

/**
 * Potongan atribut tiap kemunculan tag pembuka `<Tag …>` pada sumber JSX.
 * Menelusuri kurung/kutip berpasangan supaya `>` di dalam `=>` atau `{a > b}`
 * tidak menghentikan pemindaian. Dipakai tes statis untuk memastikan tiap
 * pemakaian komponen membawa prop yang diwajibkan (onOpenChange, title, …).
 */
export function tagAttrSpans(source: string, tag: string): string[] {
  const out: string[] = []
  const needle = '<' + tag
  let i = 0
  while ((i = source.indexOf(needle, i)) !== -1) {
    const after = i + needle.length
    const next = source[after] ?? ''
    if (/[A-Za-z0-9_.-]/.test(next)) {
      i = after
      continue
    }
    let depth = 0
    let quote: string | null = null
    let j = after
    for (; j < source.length; j++) {
      const ch = source[j]
      if (quote) {
        if (ch === quote) quote = null
        continue
      }
      if (ch === '"' || ch === "'") {
        quote = ch
        continue
      }
      if (ch === '{' || ch === '(' || ch === '[') depth++
      else if (ch === '}' || ch === ')' || ch === ']') depth--
      else if (ch === '>' && depth <= 0 && source[j - 1] !== '=') break
    }
    out.push(source.slice(after, j))
    i = j + 1
  }
  return out
}

/** Isi lengkap tiap pemanggilan `name({ … })` (kurung kurawal berpasangan). */
export function callBlocks(source: string, name: string): string[] {
  const out: string[] = []
  let i = 0
  while ((i = source.indexOf(name + '({', i)) !== -1) {
    const before = source[i - 1] ?? ''
    if (/[A-Za-z0-9_$]/.test(before)) {
      i += 1
      continue
    }
    let depth = 0
    let quote: string | null = null
    let j = i + name.length
    for (; j < source.length; j++) {
      const ch = source[j]
      if (quote) {
        if (ch === quote) quote = null
        continue
      }
      if (ch === '"' || ch === "'") {
        quote = ch
        continue
      }
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) break
      }
    }
    out.push(source.slice(i, j + 1))
    i = j + 1
  }
  return out
}

/** Tunggu mikro-tugas/timer pendek selesai (flush async handler komponen). */
export async function flush(times = 4): Promise<void> {
  for (let k = 0; k < times; k++) await new Promise((r) => setTimeout(r, 0))
}
