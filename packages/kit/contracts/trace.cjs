// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The published trace contract, ab-trace/1: where a run's records live and the shape of one record.
// A record's `v` is the major of this schema. `step` is an enum the package names through trace.forPackage.
const { dayOf } = require('../base/text.cjs');
const SCHEMA = 'ab-trace/1';
const SHAPES = {
  TraceRecord: { v: 'int', pkg: 'str', run: 'id', seq: 'int', step: 'step', at: 'str', ms: 'num?', ok: 'bool', in: 'digest?', out: 'digest?',
    n: 'counts', codes: 'codeCounts', ref: 'obj?', err: 'TraceError?' },
  TraceError: { code: 'code', msg: 'msg' },
  StepResult: { out: 'any', n: 'counts', codes: 'codeCounts', ref: 'obj?', err: 'StepError?' }, // a handled failure: its record is not ok
  StepError: { code: 'code', msg: 'any' }, // whole: the writer scrubs it, then cuts it to `msg`
};
const REFUSE = { TraceRecord: 'trace-invalid' };
const VERDICTS = ['allow', 'ask', 'deny']; // the host's: a step whose out states one decided it, and its record counts `decision_<verdict>`
const TRACE_DIR = '.atlasbound/trace';
/** The one place a run's records live. The caller's run id is checked (shape `id`) before anything is written. */
const tracePath = (run) => `${TRACE_DIR}/${run}.ndjson`;
/** Hook runs share one file per UTC day (`run` still separates them), so one file per hook call never piles up. */
const dailyPath = (at) => `${TRACE_DIR}/hooks-${dayOf(at)}.ndjson`;

module.exports = { SCHEMA, SHAPES, REFUSE, VERDICTS, TRACE_DIR, tracePath, dailyPath };
