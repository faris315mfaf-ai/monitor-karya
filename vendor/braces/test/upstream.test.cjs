'use strict';
// Execute the unmodified, synchronous upstream assertions with Node's test API.
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const rootRequire = createRequire(path.resolve(__dirname, '../package/index.js'));
const files = fs.readdirSync(path.join(__dirname, 'upstream')).filter(file => file.endsWith('.js')).map(file => file.slice(0, -3));
for (const name of files) {
  const source = fs.readFileSync(path.join(__dirname, 'upstream', name + '.js'), 'utf8');
  const localRequire = id => {
    if (id === 'mocha') return {};
    if (id === 'bash-path') return () => process.env.BASH_TEST_EXECUTABLE || '/bin/bash';
    if (id === '..') return rootRequire('./index.js');
    if (id.startsWith('../lib/')) return rootRequire('./' + id.slice(3));
    return rootRequire(id);
  };
  describe('upstream: ' + name, () => {
    new Function('require', 'describe', 'it', source)(localRequire, describe, it);
  });
}
