// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// What a person reads: on or off per namespace and the rule that decided, where reports go (or that this build sends nothing), what waits
// here, the exact request the next attempt would post, every report kept here with its state, and each verb's answer in its code's words.
const { text: { lines: { dayOf } } } = require('@atlasbound/kit');
const { shortOf, TEXT, sentence } = require('../contracts/codes.cjs');
const { WIRE } = require('../contracts/shapes.cjs');

const spaceName = ({ space }) => (space.packages.length === 1 && space.packages[0] !== space.ns ? `${space.ns} (${space.packages[0]})` : space.ns);
const WHEN = { 'telemetry-on': (state) => `, ${dayOf(state.since)}`, 'telemetry-default': () => ` until ${WIRE.betaUntil}` };
const whyOf = (state, killed) => (state.code === 'telemetry-killed' ? `${killed} is set in this process`
  : `${shortOf(state.code)}${WHEN[state.code]?.(state) ?? ''}`);

/** One line per rule that holds: ON for the namespaces on, OFF for the rest, each with why. */
function stateLines({ states, killed }) {
  const groups = new Map();
  states.forEach((state) => {
    const key = `${state.on ? 'ON' : 'OFF'} for |(${whyOf(state, killed)})`;
    groups.set(key, [...(groups.get(key) ?? []), spaceName(state)]);
  });
  if (!states.length) return [TEXT.noModule];
  return [...groups.entries()].map(([key, names]) => `telemetry: ${key.replace('|', `${names.join(', ')} `)}`);
}

function hereLines({ here }) {
  const last = here.last ? `; last attempt ${dayOf(here.last.at)}: ${here.last.code}` : '';
  return [`here: ${here.waiting} reports wait, ${here.received} were received${last}`,
    ...(here.forget ? [sentence('forgetWaits', { n: here.forget })] : []),
    ...(here.expired ? [shortOf('forget-expired')] : [])];
}

const statusLines = (view) => [...stateLines(view), view.address ? sentence('goes', { url: WIRE.url }) : TEXT.noAddress, ...hereLines(view), TEXT.see];

const nextLines = (view) => [...statusLines(view), ...(view.body ? [sentence('wouldPost', { bytes: Buffer.byteLength(view.body, 'utf8') }), view.body]
  : [TEXT.noneWaits]), TEXT.staysHere];

const historyLines = ({ reports }) => (reports.length
  ? reports.flatMap((one) => [`${one.day} ${one.ns} ${one.state}, attempts ${one.attempts}:`, one.line]) : [TEXT.noHistory]);

const resetLines = ({ code, deleted, forget }) => [`${forget ? 'telemetry is off; ' : ''}${deleted} waiting reports deleted here; ${shortOf(code)}`];

/** The view of any telemetry verb, as lines. */
function renderTelemetry(view) {
  if (view.reports) return historyLines(view).join('\n');
  if (view.body !== undefined) return nextLines(view).join('\n');
  if (view.states) return statusLines(view).join('\n');
  if (view.deleted !== undefined) return resetLines(view).join('\n');
  return `telemetry: ${view.code}: ${shortOf(view.code) ?? 'failed'}`;
}

/** doctor's line: the state; a stored choice that cannot be read is a problem (the person chose, and it no longer holds). */
const doctorOf = (view) => ({ ok: !view.states.some((state) => state.code === 'telemetry-consent-unreadable'), says: stateLines(view).join('; ') });

module.exports = { renderTelemetry, doctorOf };
