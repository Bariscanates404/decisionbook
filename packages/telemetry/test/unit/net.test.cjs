// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The one network port against a real server on this machine (loopback only, nothing leaves): the bytes that arrive, what it refuses, how it fails.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createNet } = require('../../adapters/net.cjs');
const { limits } = require('../../contracts/wire.json');

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
    const body = JSON.stringify({ protocol: 'ab-report/1', reports: [] });
    assert.deepEqual(await createNet(limits).post(`${url}/ingest`, body), { status: 200, retryAfterS: null, text: 'ok' });
    assert.equal(seen.body, body);
    assert.equal(seen.method, 'POST');
    assert.ok(!Object.keys(seen.headers).some((name) => /atlasbound|authorization|cookie|api-?key/i.test(name)));
  });
});

test('an answer is its status, a 429\'s Retry-After in seconds (at most a week), and at most answerBytes of its body', async () => {
  await withServer((req, res) => {
    res.statusCode = req.url === '/slow' ? 429 : 500;
    if (req.url === '/slow') res.setHeader('retry-after', '99999999');
    res.end(req.url === '/long' ? 'x'.repeat(40) : 'short');
  }, async (url) => {
    assert.deepEqual(await createNet(limits).post(`${url}/slow`, '{}'), { status: 429, retryAfterS: 7 * 24 * 3600, text: 'short' });
    assert.deepEqual(await createNet({ answerBytes: 16 }).post(`${url}/long`, '{}'), { status: 500, retryAfterS: null, text: '' });
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
    await assert.rejects(createNet(limits).post(url, '{}'), { code: 'net-failed' });
  });
  assert.equal(followed, 0);
});

test('a dead or too slow far side is net-failed, not a hang', async () => {
  await withServer(() => { /* never answers */ }, async (url) => {
    await assert.rejects(createNet({ ...limits, timeoutMs: 50 }).post(url, '{}'), { code: 'net-failed' });
  });
});

test('only https, or http on this machine, is dialled; nothing else reaches fetch', async () => {
  const real = globalThis.fetch;
  let dialled = 0;
  globalThis.fetch = async () => { dialled += 1; return new Response('', { status: 200 }); };
  try {
    for (const url of ['http://example.test/ingest', 'ftp://example.test/x', 'file:///etc/passwd', 'not a url', '']) {
      await assert.rejects(createNet(limits).post(url, '{}'), { code: 'net-url-refused' }, url);
    }
    assert.equal(dialled, 0);
    await createNet(limits).post('https://example.test/ingest', '{}');
    assert.equal(dialled, 1);
  } finally {
    globalThis.fetch = real;
  }
});

test('the headers that go out are the content type and Node fetch\'s fixed defaults, nothing of the machine or person', async () => {
  const seen = {};
  await withServer((req, res) => { seen.headers = req.headers; res.end('ok'); }, (url) => createNet(limits).post(url, '{}'));
  const { host, connection, 'content-length': length, 'accept-encoding': encoding, ...sent } = seen.headers;
  assert.ok(host && connection && length && encoding);
  assert.deepEqual(sent, { 'content-type': 'application/json', accept: '*/*', 'accept-language': '*', 'sec-fetch-mode': 'cors',
    'user-agent': 'node' });
});

