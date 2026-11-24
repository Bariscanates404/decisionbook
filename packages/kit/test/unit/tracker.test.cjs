// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The tracker port: one GET of an issue's or a comment's address through the person's gh; anything else is null or says it could not
// be read, never a guess.
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: { createTracker } } = require('@atlasbound/kit');

const COMMENT = 'https://tracker.invalid/shop/web/issues/12#issuecomment-3';
/** A tracker over a scripted gh: `answers` by the path asked; every call is kept. */
function ghScripted(answers) {
  const calls = [];
  const proc = { run: async ({ cmd, args }) => {
    calls.push([cmd, ...args]);
    const said = answers[args.at(-1)];
    return said === undefined ? { code: 1, stdout: '' } : { code: 0, stdout: typeof said === 'string' ? said : JSON.stringify(said) };
  } };
  return { tracker: createTracker({ proc, env: {}, root: '/repo' }), calls };
}

test('a comment and an issue are read at their own path of the host the address names, once each', async () => {
  const { tracker, calls } = ghScripted({
    'repos/shop/web/issues/comments/3': { body: 'Round down.', html_url: COMMENT },
    'repos/shop/web/issues/12': { body: 'The fee.', html_url: 'https://tracker.invalid/shop/web/issues/12' } });
  assert.deepEqual(await tracker.read(COMMENT), { text: 'Round down.' });
  assert.deepEqual(await tracker.read(COMMENT), { text: 'Round down.' });
  assert.deepEqual(await tracker.read('https://tracker.invalid/shop/web/issues/12'), { text: 'The fee.' });
  assert.deepEqual(calls, [['gh', 'api', '--hostname', 'tracker.invalid', 'repos/shop/web/issues/comments/3'],
    ['gh', 'api', '--hostname', 'tracker.invalid', 'repos/shop/web/issues/12']]);
});

test('what is no address of a tracker is null; an address gh does not give, or that answers for another repository, is unread', async () => {
  const { tracker, calls } = ghScripted({ 'repos/shop/web/issues/comments/4': { body: 'x', html_url: 'https://tracker.invalid/other/repo/issues/1#issuecomment-4' },
    'repos/shop/web/issues/comments/5': 'not json' });
  for (const source of ['Slack', 'a call with Emma', 'http://tracker.invalid/shop/web/issues/12', 'docs/a.txt:3']) assert.equal(await tracker.read(source), null, source);
  assert.equal(calls.length, 0, 'nothing is asked for what is no address');
  for (const n of [3, 4, 5]) assert.deepEqual(await tracker.read(`https://tracker.invalid/shop/web/issues/12#issuecomment-${n}`), { unread: 'unreachable' }, `comment ${n}`);
});
