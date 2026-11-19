// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE network port, the only fetch: one POST, https or http on this machine, no redirect, a 3 s bound, the content type and Node fetch's
// fixed headers (user-agent node, accept, accept-language, sec-fetch-mode, accept-encoding). It answers the status, a 429's Retry-After
// (whole seconds, at most a week) and at most answerBytes of the body; a network failure is one code, never what the far side said.
const { errors: { fail } } = require('@atlasbound/kit');

const TIMEOUT_MS = 3000;
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
const WEEK_S = 7 * 24 * 3600;

function dialable(url) {
  if (!URL.canParse(url)) return false;
  const { protocol, hostname } = new URL(url);
  return protocol === 'https:' || (protocol === 'http:' && LOOPBACK.includes(hostname));
}

// At most maxBytes of the answer are read; a longer one is cut off unread (the attempt then reads no result).
async function bodyOf(res, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body ?? []) {
    size += chunk.length;
    if (size > maxBytes) return '';
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function createNet({ timeoutMs = TIMEOUT_MS, answerBytes }) {
  async function post(url, body) {
    if (!dialable(url)) throw fail('net-url-refused');
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw fail('net-failed', err.name);
    }
    const wait = Number.parseInt(res.headers.get('retry-after') ?? '', 10);
    return { status: res.status, retryAfterS: Number.isSafeInteger(wait) && wait >= 0 ? Math.min(wait, WEEK_S) : null,
      text: await bodyOf(res, answerBytes).catch((err) => `unread ${err.name}`) };
  }
  return { post };
}

module.exports = { createNet };
