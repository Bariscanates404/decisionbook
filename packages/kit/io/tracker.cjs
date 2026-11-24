// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE issue tracker port: one issue or one comment at its address, as its host gives it, read through the person's own `gh` (their
// login, their access; no token passes through here) with one GET of that address. Nothing of the repository is sent. An address of
// no tracker it knows is null; one it could not read says so, never a guess.
const { jsonOrNull } = require('../contracts/validate.cjs');

const ADDRESS = /^https:\/\/([\w.-]+)\/([\w.-]+)\/([\w.-]+)\/(?:issues|pull)\/(\d+)(?:#issuecomment-(\d+))?$/;
const READ_MS = 15000;
const UNREACHABLE = Object.freeze({ unread: 'unreachable' });

/** createTracker({ proc, env, root }) -> read(address): { text } (the body) | { unread } | null. Each address is asked once per process. */
function createTracker({ proc, env, root }) {
  const asked = new Map();
  async function fetched(host, path, repository) {
    const res = await proc.run({ cmd: 'gh', args: ['api', '--hostname', host, path], env, cwd: root, timeoutMs: READ_MS });
    const row = res.code === 0 && !res.killedBy ? Object(jsonOrNull(res.stdout)) : {};
    if (typeof row.body !== 'string' || !String(row.html_url).startsWith(repository)) return UNREACHABLE; // what came is that address's
    return { text: row.body };
  }
  return { read(address) {
    const [whole, host, owner, repo, number, comment] = ADDRESS.exec(String(address).trim()) ?? [];
    if (!whole) return Promise.resolve(null);
    const path = `repos/${owner}/${repo}/issues/${comment ? `comments/${comment}` : number}`;
    if (!asked.has(whole)) asked.set(whole, fetched(host, path, `https://${host}/${owner}/${repo}/`));
    return asked.get(whole);
  } };
}

module.exports = { createTracker };
