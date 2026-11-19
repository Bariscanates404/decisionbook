// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// What the handoff stores in the person's home and what an AI sends back, as shapes in kit's validator language. The bounds and the
// context windows are data beside this file. Unknown keys are ignored; a changed field needs a new schema word.
const { createValidate } = require('@atlasbound/kit');
const { isCode } = require('./codes.cjs');
const BOUNDS = require('./bounds.json');
const WINDOWS = require('./windows.json');

const SCHEMA = Object.freeze({ note: 'handoff-note/1', session: 'handoff-session/2' });
// every hook and every verb is one traced step of this name
const STEPS = ['start', 'prompt', 'touched', 'compact', 'stop', 'handoff', 'keep', 'show', 'drop', 'debug'];

// The one context notice: said once per session when the last assistant message's usage passes `percent` of the model's window; an unknown
// window: tokens alone, at `unknownTokens`; `tailBytes` of the transcript are read.
const CONTEXT = Object.freeze({
  percent: 55,
  unknownTokens: 110000,
  tailBytes: 4 * 1024 * 1024,
  reduced: WINDOWS.reduced,
  env: WINDOWS.env,
  windows: WINDOWS.windows.map((row) => ({ ...row, id: new RegExp(row.id) })),
});

const SHAPES = {
  // notes/<branch>.json: the one note of this worktree and branch, overwritten each time; the one before it is <branch>.before.json
  Note: { schema: 'noteSchema', at: 'str', session: 'str?', facts: 'Facts', now: 'str?', next: 'str[]', kept: 'Kept[]',
    dropped: 'Dropped[]', handed: 'str?', since: 'int', heard: 'Heard[]?' },
  Heard: { at: 'str', text: 'str', session: 'str?' }, // a head of the journal and the first 8 characters of the session that kept it
  // what was measured when the note was built; a fact that could not be measured is null and named in `unmeasured` with its code
  Facts: { branch: 'str?', head: 'str?', subject: 'str?', commits: 'Rows?', dirty: 'Rows?', touched: 'Touched?', plans: 'Plan[]?',
    unmeasured: 'Unmeasured[]' },
  Rows: { n: 'int', rows: 'str[]' },
  Touched: { n: 'int', rows: 'TouchedFile[]' },
  TouchedFile: { path: 'str', n: 'int' },
  // a plan with the person's decisions in it (their sentence beside each) and the blocking questions still asked of them
  Plan: { id: 'str', state: 'str', level: 'str?', unmet: 'int', decided: 'Decided[]?', open: 'str[]?' },
  Decided: { key: 'str', value: 'str', said: 'str?' },
  Unmeasured: { what: 'word', why: 'code' },
  // one decision, constraint or job of the person: `cites` the numbers of the messages of `session` it quotes, `head` the HEAD it was
  // kept at (only a later commit takes a job out), `typed` the person's own words through `handoff drop`, with no message behind them
  Kept: { text: 'str', cites: 'int[]', session: 'str', at: 'str', job: 'bool', head: 'str?', typed: 'bool?' },
  Dropped: { text: 'str', at: 'str', why: 'str' },
  // sessions/<session>.json: the heads of the person's messages in this session, numbered; `handed` how many there were at the last
  // handoff, `cited` the numbers a kept line names (never the first to go), `head` where the session began
  Session: { schema: 'sessionSchema', session: 'id', started: 'str', seen: 'str', head: 'str?', count: 'int', handed: 'int',
    cited: 'int[]', messages: 'Message[]', context: 'Context?' },
  Message: { n: 'int', at: 'str', text: 'str' },
  SessionId: { id: 'id' }, // a session's id names its files, so it is checked before any key is built
  // the last prompt's measure of the session's context, and when the one notice was said
  Context: { code: 'code', at: 'str', tokens: 'int?', window: 'int?', by: 'str?', model: 'str?', noticed: 'str?' },
  // what an AI sends back to the fill-in
  Reply: { now: 'str?', next: 'str[]?', kept: 'str[]?', drop: 'Drop[]?' },
  Drop: { k: 'int', why: 'str' },
};
const ENUMS = { noteSchema: [SCHEMA.note], sessionSchema: [SCHEMA.session] };
const bound = createValidate({ shapes: SHAPES, enums: ENUMS, refuse: { Reply: 'reply-invalid', Drop: 'reply-invalid' }, isCode });

/** Text a crash may tear or a person may edit: its value when it is `shape`, else null. */
function shapedOrNull(text, shape) {
  const value = text == null ? null : bound.jsonOrNull(text);
  return value && !bound.refusal(shape, value) ? value : null;
}
/** A step's result for kit's trace: its code in `out` and counted once; `n` are counts, never a person's words. */
const stepResult = (code, out = {}, n = {}) => ({ out: { code, ...out }, n, codes: { [code]: 1 } });

module.exports = { SCHEMA, STEPS, BOUNDS, CONTEXT, SHAPES, bound, shapedOrNull, stepResult };
