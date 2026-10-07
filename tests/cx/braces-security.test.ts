import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync, spawnSync } from 'node:child_process'

const root = process.cwd()
const requireRoot = createRequire(join(root, 'package.json'))
const requirePlugin = createRequire(requireRoot.resolve('@next/eslint-plugin-next'))
const requireGlob = createRequire(requirePlugin.resolve('fast-glob'))
const requireMatch = createRequire(requireGlob.resolve('micromatch'))
const braces = requireMatch('braces')
const { getRootDirs } = requirePlugin('./utils/get-root-dirs')
const temporary = mkdtempSync(join(tmpdir(), 'mk-braces-regression-'))
execFileSync('tar', ['-xzf', join(root, 'vendor/braces/upstream/braces-3.0.3.tgz'), '-C', temporary])
symlinkSync(join(root, 'node_modules'), join(temporary, 'node_modules'), 'dir')
const originalPath = join(temporary, 'package')
const original = requireRoot(originalPath)
afterAll(() => rmSync(temporary, { recursive: true, force: true }))

function compileInSmallStack(modulePath: string) {
  const program = `
    const braces = require(${JSON.stringify(modulePath)});
    try {
      braces.compile('{'.repeat(4000) + 'a,b' + '}'.repeat(4000));
      console.log(JSON.stringify({ accepted: true }));
    } catch (error) {
      console.log(JSON.stringify({ name: error.name, code: error.code, message: error.message }));
    }
  `
  const result = spawnSync(process.execPath, ['--stack-size=512', '-e', program], { encoding: 'utf8', timeout: 5000 })
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  return JSON.parse(result.stdout.trim())
}

describe('CX19 braces — GHSA-vfj7-8cjw-p6xm', () => {
  it('membuktikan stack exhaustion pada sumber resmi dan guard pada dependensi yang dipakai ESLint', () => {
    const baseline = compileInSmallStack(originalPath)
    expect(baseline.name).toBe('RangeError')
    expect(baseline.message).toMatch(/call stack/i)
    expect(baseline.code).not.toBe('BRACES_MAX_DEPTH')

    const patched = compileInSmallStack(requireMatch.resolve('braces'))
    expect(patched.name).toBe('SyntaxError')
    expect(patched.code).toBe('BRACES_MAX_DEPTH')
    expect(patched.message).not.toMatch(/call stack/i)
    expect(requireMatch('braces/package.json').version).toBe('3.0.3-mk.1')
  })

  it.each(['parse', 'compile', 'expand', 'stringify'])('%s membatasi brace, parentheses, serta pola yang belum ditutup', (method) => {
    const patterns = [
      '{'.repeat(4000) + 'a,b' + '}'.repeat(4000),
      '('.repeat(4000) + 'x' + ')'.repeat(4000),
      '{('.repeat(2000) + 'x' + ')}'.repeat(2000),
      '{'.repeat(4000) + 'x',
    ]
    for (const pattern of patterns) {
      expect(() => braces[method](pattern)).toThrowError(expect.objectContaining({ name: 'SyntaxError', code: 'BRACES_MAX_DEPTH' }))
    }
  })

  it.each(['compile', 'expand', 'stringify'])('%s juga menjaga masukan AST yang melewati parser', (method) => {
    const ast = original.parse('{'.repeat(1000) + 'a,b' + '}'.repeat(1000))
    expect(() => braces[method](ast)).toThrowError(expect.objectContaining({ code: 'BRACES_MAX_DEPTH' }))
  })

  it('menjaga batas 127 tingkat dan perilaku pola biasa, escape, kutipan, serta rentang', () => {
    const patterns = [
      'src/**/{*.tsx,*.ts}', '{a,{b,c}}', '{01..05}', '{z..a..2}', '${foo,bar}',
      '{,a,a}', '{a', '(a|b)', '\\{'.repeat(500), '"' + '{'.repeat(500) + '"',
      '[' + '{'.repeat(500) + ']', '{'.repeat(127) + 'x' + '}'.repeat(127),
    ]
    for (const pattern of patterns) {
      for (const options of [{}, { escapeInvalid: true }, { keepEscaping: true }, { noempty: true, nodupes: true }]) {
        for (const method of ['compile', 'expand', 'stringify']) {
          expect(braces[method](pattern, options)).toEqual(original[method](pattern, options))
        }
      }
    }
    expect(() => braces.parse('{'.repeat(128) + 'x' + '}'.repeat(128))).toThrowError(expect.objectContaining({ code: 'BRACES_MAX_DEPTH' }))
    expect(() => braces.expand('{1..100000}')).toThrow(/range limit/)
    expect(() => braces.parse('x'.repeat(10001))).toThrow(/max characters/)
  })

  it('resolusi rootDir Next tetap mempertahankan direktori literal dan brace glob', () => {
    const src = resolve(root, 'src')
    const tests = resolve(root, 'tests')
    expect(getRootDirs({ cwd: root, settings: {} })).toEqual([root])
    expect(getRootDirs({ cwd: root, settings: { next: { rootDir: src } } })).toEqual([src])
    expect(getRootDirs({ cwd: root, settings: { next: { rootDir: join(root, '{src,tests}') } } }).sort()).toEqual([src, tests].sort())
  })
})
