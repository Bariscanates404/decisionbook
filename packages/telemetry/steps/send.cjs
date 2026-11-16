// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The one send: no consent, no port. The mirror keeps the exact bytes only after the endpoint took them; if it cannot, the answer says the
// counts may leave again.
const { errors: { isFail } } = require('@atlasbound/kit');
const { SENT_PATH } = require('../contracts/shapes.cjs');

const notSent = (code) => ({ out: { sent: false, code }, n: {}, codes: { [code]: 1 } });

function mirrored(io, view) {
  try {
    io.fs.append(SENT_PATH, `${JSON.stringify({ offsets: view.offsets, body: view.body })}\n`);
    return 'telemetry-sent';
  } catch (err) {
    if (!isFail(err)) throw err;
    return 'telemetry-sent-unmirrored';
  }
}

async function post({ state, view }, io, ctx) {
  if (!state.on) return notSent(state.code);
  if (!state.url) return notSent('no-endpoint');
  if (!view.due) return notSent('telemetry-nothing');
  await ctx.net.post(state.url, view.body);
  const code = mirrored(io, view);
  const n = { events: view.events.length, bytes: Buffer.byteLength(view.body, 'utf8'), first_send: view.first ? 1 : 0 }; // first_send: this store's first body
  return { out: { sent: true, code }, n, codes: { [code]: 1 } };
}

module.exports = { post };
