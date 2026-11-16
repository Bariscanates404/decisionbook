// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// `debug telemetry`: the exact bytes that would leave and what stayed local. A local name reaches an agent, so it shows only as a short
// plain non-secret word.
const { text: { secrets }, debug: { render: { capped } } } = require('@atlasbound/kit');
const { shortOf } = require('../contracts/codes.cjs');
const { INGEST_URL } = require('../contracts/shapes.cjs');

const PLAIN_NAME = /^[\w.-]{1,48}$/;
const shown = (name) => (PLAIN_NAME.test(name) && secrets.find(name).length === 0 ? name : 'withheld');
const clean = (names) => names.map(shown);
const reasoned = (state) => ({ on: state.on, code: state.code, why: shortOf(state.code) });
const NO_ENDPOINT = `no-endpoint: ${shortOf('no-endpoint')}`;
const consentLine = (consent) => `telemetry: ${consent.on ? 'ON' : 'OFF'} (${consent.code}: ${consent.why})`;

// What all sends add up to and the state, in the words of the package that declares them; null where no installed package does.
const sumWords = ({ says: [, stated, none], scale }, sum) => (sum === null ? none : `${(sum / scale).toFixed(2)} ${stated}`);
const wholeSays = ({ WHOLE }, whole) => WHOLE && `all sends together: ${whole.taken} ${WHOLE.says[0]}, ${sumWords(WHOLE, whole.sum)}`;

function viewOf(state, found) {
  const { events, due, body, rules } = found;
  const local = { unruled: clean(found.unruled), dropped: clean(found.dropped), localOnly: found.localOnly, torn: clean(found.torn),
    waiting: found.waiting, unchanged: rules.STATE_SAYS && found.unchanged, state: rules.STATE_SAYS, wordsFrom: rules.from,
    wordsUnread: rules.unread };
  const whole = { ...found.whole, says: wholeSays(rules, found.whole) };
  return { schema: 'ab-debug/1', verb: 'telemetry', consent: reasoned(state), events, due, body, bytes: Buffer.byteLength(body, 'utf8'), whole, local };
}

function wholeLines({ whole, local }) {
  const taken = whole.rows - local.waiting;
  const bounded = `this send holds ${taken} of ${whole.rows} rows: one body is bounded, so the events above are a part; ${local.waiting} wait for later sends`;
  return [...(local.waiting ? [bounded] : []), ...(whole.says === null ? [] : [whole.says])];
}

function previewLines(view) {
  const { consent, local } = view;
  return [
    `${consentLine(consent)}; nothing was sent by this command`,
    `${view.due ? 'would leave' : 'held, no news to dial for'}: ${view.events.length} events, ${view.bytes} bytes, exactly:`,
    view.body,
    ...wholeLines(view),
    ...(INGEST_URL ? [] : [NO_ENDPOINT]),
    'stays on this machine:',
    `  local-only trace rows: ${local.localOnly}`,
    `  rows waiting for a later send: ${local.waiting}`,
    ...(local.state === null ? [] : [`  ${local.state}, unchanged since this repository's last send: ${local.unchanged} events`]),
    `  steps with no rule ${capped(local.unruled)}`,
    `  words in force: those the installed packages declare ${capped(local.wordsFrom)}; unreadable ${capped(local.wordsUnread)}`,
    `  fields dropped by name ${capped(local.dropped)}`,
    `  trace files with a torn line left out ${capped(local.torn)}`,
  ];
}

const consentLines = ({ consent, url }) => [consentLine(consent), ...(consent.on ? [shortOf('telemetry-what-leaves')] : []), url ? `counts would go to: ${url}` : NO_ENDPOINT, 'see exactly what would leave: atlasbound debug telemetry'];
const sentLines = ({ code }) => [`telemetry send: ${code}: ${shortOf(code) || 'failed'}`];

const stateView = ({ consent: state }, url = state.url) => ({ schema: 'ab-debug/1', verb: 'telemetry-status', consent: reasoned(state), url });
const renderView = (view) => (view.body !== undefined ? previewLines(view) : view.consent ? consentLines(view) : sentLines(view)).join('\n');

module.exports = { viewOf, stateView, render: renderView };
