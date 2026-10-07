'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const plugin = require('@next/eslint-plugin-next/dist/utils/get-root-dirs');
const pluginRequire = createRequire(require.resolve('@next/eslint-plugin-next'));
const globRequire = createRequire(pluginRequire.resolve('fast-glob'));
const matchRequire = createRequire(globRequire.resolve('micromatch'));

test('Next ESLint actually resolves the patched braces implementation', () => {
  assert.equal(matchRequire('braces/package.json').version, '3.0.3-mk.1');
  assert.throws(() => matchRequire('braces').expand('{'.repeat(4000) + 'a,b' + '}'.repeat(4000)), e => e.code === 'BRACES_MAX_DEPTH');
});
test('Next rootDir: default, literal, wildcard, braces, array, missing and backslashes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-glob-test-'));
  try {
    for (const name of ['admin', 'web', 'worker']) fs.mkdirSync(path.join(root, 'apps', name, 'pages'), { recursive: true });
    fs.writeFileSync(path.join(root, 'apps', 'ignored.txt'), 'fixture');
    const resolve = rootDir => plugin.getRootDirs({ cwd: root, settings: { next: { rootDir } } }).sort();
    const admin = path.join(root, 'apps/admin'); const web = path.join(root, 'apps/web'); const worker = path.join(root, 'apps/worker');
    assert.deepEqual(resolve(undefined), [root]);
    assert.deepEqual(resolve(admin), [admin]);
    assert.deepEqual(resolve(path.join(root, 'apps/*')), [admin, web, worker]);
    assert.deepEqual(resolve(path.join(root, 'apps/{web,admin}')), [admin, web]);
    assert.deepEqual(resolve([web, admin]), [admin, web]);
    assert.deepEqual(resolve(path.join(root, 'missing/*')), []);
    assert.deepEqual(resolve(admin.replaceAll('/', '\\')), [admin]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
