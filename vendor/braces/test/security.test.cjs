'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const patched = require('../package');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-braces-test-'));
execFileSync('tar', ['-xzf', path.resolve(__dirname, '../upstream/braces-3.0.3.tgz'), '-C', temp]);
fs.symlinkSync(path.resolve(__dirname, '../../../node_modules'), path.join(temp, 'node_modules'), 'dir');
const original = require(path.join(temp, 'package'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const isGuard = error => error instanceof SyntaxError && error.code === 'BRACES_MAX_DEPTH';

for (const [label, pattern] of [
  ['braces', '{'.repeat(4000) + 'a,b' + '}'.repeat(4000)],
  ['parentheses', '('.repeat(4000) + 'x' + ')'.repeat(4000)],
  ['mixed', '{('.repeat(2000) + 'x' + ')}'.repeat(2000)],
  ['unclosed', '{'.repeat(4000) + 'x'],
  ['dollar', '${' + '{'.repeat(3999) + 'x' + '}'.repeat(4000)],
]) {
  for (const method of ['parse', 'compile', 'expand', 'stringify']) {
    test(label + ' rejects safely via ' + method, () => {
      assert.throws(() => patched[method](pattern), isGuard);
    });
  }
}
test('original compile reproduces stack exhaustion below MAX_LENGTH', () => {
  const script = `const b=require(${JSON.stringify(path.join(temp, 'package'))}); try { b.compile('{'.repeat(4000)+'a,b'+'}'.repeat(4000)); process.exit(2); } catch(e) { if (!(e instanceof RangeError) || !/call stack/.test(e.message)) throw e; }`;
  const result = spawnSync(process.execPath, [ '--stack-size=512', '-e', script ], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
});
for (const method of ['compile', 'expand', 'stringify']) {
  test(method + ' guards AST input that bypasses parser', () => {
    const ast = original.parse('{'.repeat(1000) + 'a,b' + '}'.repeat(1000));
    assert.throws(() => patched[method](ast), isGuard);
  });
}
test('nesting boundary: 127 blocks accepted, 128 rejected', () => {
  for (const [open, close] of [['{', '}'], ['(', ')']]) {
    const accepted = open.repeat(127) + 'x' + close.repeat(127);
    for (const method of ['compile', 'expand', 'stringify']) {
      assert.deepEqual(patched[method](accepted), original[method](accepted));
      assert.throws(() => patched[method](open.repeat(128) + 'x' + close.repeat(128)), isGuard);
    }
  }
});
test('literal/escaped/quoted/bracket contents do not consume nesting budget', () => {
  for (const pattern of ['\\{'.repeat(500), '"' + '{'.repeat(500) + '"', '[' + '{'.repeat(500) + ']']) {
    for (const method of ['compile', 'expand', 'stringify']) assert.deepEqual(patched[method](pattern), original[method](pattern));
  }
});
test('ordinary patterns and option combinations match upstream', () => {
  const patterns = ['{a,b}', '{01..05}', '{z..a..2}', '${foo,bar}', '{a,{b,c}}', 'src/**/{*.tsx,*.ts}', '{,a,a}', '{a', '(a|b)', '{a..z}', '{3..1}', 'foo\\{bar,baz}', '[{a,b}]'];
  for (let n = 0; n < 200; n++) patterns.push(`root${n}/{a,b${n}}/{01..03}/${n % 2 ? '{x,{y,z}}' : 'literal'}`);
  for (const pattern of patterns) {
    for (const options of [{}, { escapeInvalid: true }, { keepEscaping: true }, { keepQuotes: true }, { noempty: true, nodupes: true }, { expand: true }]) {
      for (const method of ['compile', 'expand', 'stringify']) assert.deepEqual(patched[method](pattern, options), original[method](pattern, options), pattern + ':' + method);
      assert.deepEqual(patched(pattern, options), original(pattern, options));
    }
  }
});
test('range and length safety checks remain effective', () => {
  assert.throws(() => patched.expand('{1..100000}'), /range limit/);
  assert.throws(() => patched.parse('x'.repeat(10001)), /max characters/);
  assert.throws(() => patched.parse(null), TypeError);
});
