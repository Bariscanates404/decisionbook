// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// May anything leave? Pure OPT-IN: only a `telemetry on` record opens it; env can only close it (a repository able to inject env must not
// turn it on).
const { INGEST_URL, SCHEMA } = require('../contracts/shapes.cjs');

const OFF_WORDS = ['0', 'off', 'false'];
const HARD_OFF = { DO_NOT_TRACK: ['', '0'], MCP_OBS_DISABLED: ['', ...OFF_WORDS] };
const PUMP = 'ATLASBOUND_PUMP';
const SWITCHES = [...Object.keys(HARD_OFF), PUMP];

const killed = (words) => Object.entries(HARD_OFF).some(([name, on]) => !on.includes(words[name])) || OFF_WORDS.includes(words[PUMP]);
const opensIt = (record) => Boolean(record) && record.schema === SCHEMA.consent && record.on === true;

function consent(words, record, refused = null) {
  if (killed(words)) return { on: false, code: 'telemetry-killed', url: null };
  if (refused) return { on: false, code: refused, url: null };
  if (!opensIt(record)) return { on: false, code: 'telemetry-off', url: null };
  return { on: true, code: 'telemetry-on', url: INGEST_URL };
}

module.exports = { consent, SWITCHES };
