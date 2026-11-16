// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The published ab-event/1 shape, this package's store, and the validator bound to them. `TraceRow` is the part of ab-trace/1 telemetry
// reads, on purpose: `ref`, `in` and `out` are not fields here, and of `err` only its `code`, never its message.
const { createValidate } = require('@atlasbound/kit');
const { isCode } = require('./codes.cjs');

const PKG = 'telemetry';
const SCHEMA = { event: 'ab-event/1', consent: 'ab-consent/1' };
const ENUMS = { step: ['collect', 'redact', 'send', 'consent-on', 'consent-off', 'consent-status', 'hint'] };
const STORE = '.atlasbound/telemetry';
const SENT_PATH = `${STORE}/sent.ndjson`;
// Under the user's home; a `.atlasbound/telemetry.json` in a repository is not read, whatever it says.
const CONSENT_PATH = '.atlasbound/telemetry-consent.json';
// The day setup or doctor last said the hint here: in the repository's store, so no one's home holds a file they never chose.
const HINT_PATH = `${STORE}/hinted`;
// The one place a body may go: built in, no env var, flag, config key or argument changes it. Empty in this release: `telemetry
// send` dials nothing and answers no-endpoint.
const INGEST_URL = null;

const SHAPES = {
  WireEvent: { schema: 'str', event: 'str', at: 'str?', cv: 'str?', payload: 'obj', dropped: 'int', oversize: 'bool?' },
  TraceRow: { pkg: 'str', run: 'id', step: 'str', at: 'str', ok: 'bool', ms: 'num?', n: 'counts', codes: 'counts?', err: 'RowError?' },
  RowError: { code: 'str' },
  SentLine: { offsets: 'counts', body: 'str' },
};

const validate = createValidate({ shapes: SHAPES, enums: ENUMS, refuse: { TraceRow: 'trace-invalid' }, isCode });

module.exports = { PKG, SCHEMA, ENUMS, STORE, SENT_PATH, CONSENT_PATH, HINT_PATH, INGEST_URL, SHAPES, validate };
