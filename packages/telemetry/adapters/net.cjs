// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE network port, the only fetch: https (or local http), no redirect, no identifying header; a failure names the case only, never what
// the far side said.
const { errors: { fail } } = require('@atlasbound/kit');

const TIMEOUT_MS = 3000;
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

function dialable(url) {
  if (!URL.canParse(url)) return false;
  const { protocol, hostname } = new URL(url);
  return protocol === 'https:' || (protocol === 'http:' && LOOPBACK.includes(hostname));
}

function createNet({ timeoutMs = TIMEOUT_MS } = {}) {
  async function dial(url, init) {
    if (!dialable(url)) throw fail('net-url-refused');
    let res;
    try {
      res = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw fail('net-failed', err.name);
    }
    if (!res.ok) throw fail('net-failed', `status ${res.status}`);
    return res;
  }
  return { post: async (url, body) => ({ status: (await dial(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).status }) };
}

module.exports = { createNet };
