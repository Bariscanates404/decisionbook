// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The one network port against a real server on this machine (loopback only, nothing leaves): the bytes that arrive, what it refuses, how it fails.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createNet } = require('../../adapters/net.cjs');

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('post delivers the exact bytes with no header of ours that identifies anything', async () => {
  const seen = {};
  await withServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => { seen.body = Buffer.concat(chunks).toString('utf8'); seen.method = req.method; seen.headers = req.headers; res.end('ok'); });
  }, async (url) => {
    const body = JSON.stringify({ schema: 'ab-event/1', events: [] });
    assert.deepEqual(await createNet().post(`${url}/ingest`, body), { status: 200 });
    assert.equal(seen.body, body);
    assert.equal(seen.method, 'POST');
    assert.ok(!Object.keys(seen.headers).some((name) => /atlasbound|authorization|cookie|api-?key/i.test(name)));
  });
});

test('a non-2xx answer is a coded net-failed naming the status, never the far side\'s words', async () => {
  await withServer((_req, res) => { res.statusCode = 500; res.end('/Users/someone/secret'); }, async (url) => {
    await assert.rejects(createNet().post(url, '{}'), (err) => {
      assert.equal(err.code, 'net-failed');
      assert.match(err.message, /500/);
      assert.ok(!err.message.includes('secret'));
      return true;
    });
  });
});

test('a redirect is refused: a body never follows an answer somewhere else', async () => {
  let followed = 0;
  await withServer((req, res) => {
    if (req.url === '/elsewhere') { followed += 1; res.end('ok'); return; }
    res.statusCode = 307;
    res.setHeader('location', '/elsewhere');
    res.end();
  }, async (url) => {
    await assert.rejects(createNet().post(url, '{}'), { code: 'net-failed' });
  });
  assert.equal(followed, 0);
});

test('a dead or too slow far side is net-failed, not a hang', async () => {
  await withServer(() => { /* never answers */ }, async (url) => {
    await assert.rejects(createNet({ timeoutMs: 50 }).post(url, '{}'), { code: 'net-failed' });
  });
});

test('only https, or http on this machine, is dialled; nothing else reaches fetch', async () => {
  const real = globalThis.fetch;
  let dialled = 0;
  globalThis.fetch = async () => { dialled += 1; return { ok: true, status: 200 }; };
  try {
    for (const url of ['http://example.test/ingest', 'ftp://example.test/x', 'file:///etc/passwd', 'not a url', '']) {
      await assert.rejects(createNet().post(url, '{}'), { code: 'net-url-refused' }, url);
    }
    assert.equal(dialled, 0);
    await createNet().post('https://example.test/ingest', '{}');
    assert.equal(dialled, 1);
  } finally {
    globalThis.fetch = real;
  }
});
