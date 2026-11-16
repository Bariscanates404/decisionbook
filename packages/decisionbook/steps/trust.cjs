// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// What this person said on this machine (base/here): yes.jsonl the yeses and READY plans they opened, asked.jsonl the gate's open asks,
// seen.json the last policy seen.
const { readyKey, confirmKey } = require('../core/policy.cjs');
const { hereRows, hereHas, hereAdd, hereValue, hereKeep } = require('./here.cjs');

const YES = 'yes.jsonl';
const ASKED = 'asked.jsonl';

const isTrusted = (io, view) => hereHas(io, YES, (row) => row.kind === 'ready' && row.key === readyKey(view));
const keepConfirm = (io, view) => hereAdd(io, YES, { kind: 'confirm', id: view.id, key: confirmKey(view) });
const confirmedHere = (io, view) => Boolean(view.confirm) && hereHas(io, YES, (row) => row.kind === 'confirm' && row.key === confirmKey(view));
const keepReady = (io, view, how) => hereAdd(io, YES, { kind: 'ready', id: view.id, key: readyKey(view), how });

const noteAsked = (io, event, { view, file }) => hereAdd(io, ASKED, // the gate asked the person about this plan for this write
  { session: event.session_id ?? null, use: event.tool_use_id ?? null, file, id: view.id, key: readyKey(view) });

// the write the gate asked about ran, so the person said yes: its plan is used here from now on
function answered(io, event, file) {
  const sameUse = (row) => row.use === null || event.tool_use_id == null || row.use === event.tool_use_id;
  const same = (row) => row.session === (event.session_id ?? null) && row.file === file && sameUse(row);
  const ask = hereRows(io, ASKED).filter(same).at(-1) || null;
  if (ask) hereAdd(io, YES, { kind: 'ready', id: ask.id, key: ask.key, how: 'yes-to-ask' });
  return ask;
}

const policySeen = (io) => (hereValue(io, 'seen.json') || { policy: null }).policy;
const see = (io, policy) => hereKeep(io, 'seen.json', { policy });

module.exports = { isTrusted, keepConfirm, confirmedHere, keepReady, noteAsked, answered, policySeen, see };
