// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Telemetry's published data: what it may do (contracts/wire.json), its store in the repository and its two files in the user's home, the
// shapes of those records, and the validator bound to them. `TraceRow` is the part of ab-trace/1 telemetry reads, on purpose: of `ref`
// only its `event` and `self`, of `err` only its `code`, never its message.
const { createValidate } = require('@atlasbound/kit');
const { isCode } = require('./codes.cjs');
const WIRE = require('./wire.json');

const PKG = 'telemetry';
const SCHEMA = { consent: 'ab-consent/2', consentOld: 'ab-consent/1', period: 'ab-period/1' };
const UNSENT = ['prepared', 'attempted']; // a report waits in these; it ends received or rejected
const ENUMS = { step: Object.keys(require('./telemetry.json').steps), report: [...UNSENT, 'received', 'rejected'] };
const STORE = '.atlasbound/telemetry';
// The queue and the local copy of what was made and sent are per repository (the trace is); the choice and the period are the user's.
const PATHS = { store: STORE, reports: `${STORE}/reports`, closed: `${STORE}/closed.json`, attempt: `${STORE}/attempt.json`,
  health: `${STORE}/health.json`, lock: `${STORE}/send.lock`, hinted: `${STORE}/hinted`,
  consent: '.atlasbound/telemetry-consent.json', period: '.atlasbound/telemetry-period.json' };

const SHAPES = {
  TraceRow: { pkg: 'str', run: 'id', step: 'str', at: 'str', ok: 'bool', ms: 'num?', n: 'counts', codes: 'counts?', err: 'RowError?',
    ref: 'obj?' },
  RowError: { code: 'str' },
  Consent: { schema: 'str', at: 'str', all: 'str?', modules: 'Choice{}', noticed: 'Noticed?' },
  Choice: { on: 'bool', core: 'int', policy: 'int', at: 'str' },
  Noticed: { core: 'int', at: 'str', policies: 'counts?' },
  Period: { schema: 'str', id: 'msg', token: 'msg', at: 'msg', sent: 'bool', past: 'PastPeriod[]', forget: 'Forget[]', expired: 'int' },
  PastPeriod: { id: 'str', token: 'str', until: 'str', sent: 'bool' },
  Forget: { id: 'str', token: 'str', tries: 'int' },
  ReportState: { state: 'report', attempts: 'int', at: 'str' },
  Attempt: { at: 'str', nextAt: 'int', fails: 'int', code: 'str' },
};

const validate = createValidate({ shapes: SHAPES, enums: ENUMS, refuse: { TraceRow: 'trace-invalid' }, isCode });

module.exports = { PKG, SCHEMA, ENUMS, UNSENT, PATHS, WIRE, validate };
