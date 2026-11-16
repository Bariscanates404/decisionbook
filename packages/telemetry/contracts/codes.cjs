// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Telemetry's reasons, on top of kit's table: nobody else types them. A row is [code, short].
const { codes: { createCodes } } = require('@atlasbound/kit');

const WHAT_LEAVES = 'what leaves: counts of how AtlasBound is used and words AtlasBound publishes; never code, a path, a name or a value. '
  + 'Exact: what AtlasBound did (its steps, gate decisions, failures, times). Only as a band (0, 1-9, 10-49, 50-199, 200-999, 1000+): a count that '
  + 'grows with your repository.';
const SHOWS = '`atlasbound debug telemetry` shows the exact bytes.';

module.exports = createCodes([
  ['telemetry-on', 'the stored choice in your home says on (atlasbound telemetry on writes it, off undoes it)'],
  ['telemetry-what-leaves', WHAT_LEAVES],
  ['telemetry-hint', `Usage counts (no code, no names) can help us improve AtlasBound: \`atlasbound telemetry on\`; ${SHOWS}`],
  ['telemetry-off', 'not opted in; atlasbound telemetry on opts in, no environment variable can'],
  ['telemetry-killed', 'a hard-off switch is set (DO_NOT_TRACK, MCP_OBS_DISABLED or ATLASBOUND_PUMP); it beats an opt-in'],
  ['telemetry-no-home', 'this machine has no home directory for your user, so a choice cannot be stored; telemetry stays off'],
  ['telemetry-consent-unreadable', 'the stored choice could not be read; telemetry stays off until atlasbound telemetry on or off writes it again'],
  ['telemetry-nothing', 'nothing new to send'],
  ['no-endpoint', 'no address is built in yet, so nothing was dialled and the counts wait here'],
  ['telemetry-sent', 'the body left, once'],
  ['telemetry-sent-unmirrored', 'the body left, but the local record of it could not be written, so the same counts may leave again'],
  ['field-dropped', 'a field outside the allowlist dropped by name'],
  ['event-unknown', 'an event with no rule never leaves'],
  ['record-oversize', 'over the byte cap: the payload dropped, the record says so'],
  ['step-unruled', 'a trace step with no rule stays local (its package declares its steps in its contracts/telemetry.json)'],
  ['words-unread', 'a package\'s telemetry words (its contracts/telemetry.json) do not read: its rows stay local'],
  ['trace-line-refused', 'a trace line that does not read as ab-trace/1 (a crash can tear the last one) was left out; the rest of its file counts'],
  ['sent-line-refused', 'a line of the local record of sends does not read; only that send\'s rows may leave again'],
  ['net-failed', 'the network call failed; nothing is recorded as sent'],
  ['net-url-refused', 'only https, or http on this machine, may be dialled'],
]);
