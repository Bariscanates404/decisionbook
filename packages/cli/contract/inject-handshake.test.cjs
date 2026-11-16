// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// debug inject speaks to each MCP server in its package's own handshake, sent as that package exports it, never parsed as one JSON
// message. Through the real bin with a fake server package: a handshake of two messages (initialize, then the initialized notice) is
// measured; one that is no text is refused with its own code, not a misleading manifest-invalid.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorld, makeRepo, run, tmp, QUIET } = require('./support.cjs');

const MCP = { servers: [{ name: 'speaker-one', args: ['serve', '--zone', 'one'], tools: ['t'] }], free: ['t'] };
const SERVE = `async (io, { input, output }) => {
  let text = ''; for await (const chunk of input) text += chunk;
  for (const m of text.split('\\n').filter(Boolean).map((line) => JSON.parse(line)).filter((m) => m.id !== undefined)) {
    output.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: m.method === 'initialize' ? { instructions: 'I'.repeat(10) } : { tools: [{ name: 't' }] } }) + '\\n');
  }
  output.end();
}`;
const TWO = `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\\n${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\\n`;

function inject(handshake) {
  const world = makeWorld({ own: true, fakes: { ...QUIET, speaker: { manifest: { mcp: MCP }, body: `{ handshake: ${handshake}, serve: ${SERVE} }` } } });
  const repo = makeRepo();
  assert.equal(run(world.bin, ['setup', '--target', repo]).code, 0);
  const file = path.join(tmp('inject-shake-'), 'script.json');
  fs.writeFileSync(file, JSON.stringify([{ label: 'start', event: 'SessionStart', source: 'startup' }]));
  return run(world.bin, ['debug', 'inject', '--script', file, '--json', '--target', repo]);
}

test('a handshake of two messages is sent as its package exports it: the standing cost is measured', () => {
  const res = inject(`'${TWO}'`);
  assert.equal(res.code, 0, res.err);
  assert.deepEqual(JSON.parse(res.out).standing, [{ server: 'speaker-one', instructions: 10, tools: Buffer.byteLength('{"name":"t"}') }]);
});

test('a handshake that is no text is refused by its own code, not manifest-invalid', () => {
  const res = inject('{}');
  assert.equal(res.code, 1);
  assert.match(res.err, /^atlasbound: inject-handshake-unread[ :]/m);
});
