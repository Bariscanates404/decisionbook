// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The wall suite: every place a hostile value could ride in (a field of an event the rules know, a field no rule names, an envelope key,
// an event no rule knows) has its case here. It only asks what leaves, so a later additive rule stays green while a loosened wall goes red.
const test = require('node:test');
const assert = require('node:assert/strict');
const { text: { secrets } } = require('@atlasbound/kit');
const telemetry = require('@atlasbound/telemetry');
const { declaredHere, rulesOver, redactUnder } = require('./declared.cjs');

const { PAYLOAD_BYTE_CAP } = telemetry;
// A package that declares an event of each form of its own (made-up words), beside every package's words here.
const TOY_EVENTS = { toy_run: { form: 'run', counts: ['ticks', 'bytesIn'], bands: ['seen'], owners: { ticks: 'tick' }, rowsOf: { looks: 'look' } },
  toy_state: { form: 'state', words: { thing: 'things' }, bands: ['held'] } };
const TOY = { name: 'toy', text: JSON.stringify({ steps: { tick: 'toy_run', look: 'toy_run', state: 'toy_state' }, codes: ['toy-said'],
  things: ['cup'], events: TOY_EVENTS }) };
const RULES = {}; // the rules a preview judges by over every package's words and the toy's, as the public preview returns them
test.before(async () => Object.assign(RULES, await rulesOver([...declaredHere(), TOY])));
const redact = redactUnder(RULES);
const AT = '2026-11-02T06:00:00.000Z';
// Names no rule holds, of the kinds a repository's facts usually travel under: a path, a name, a text, a list, an identity.
const UNRULED = ['file', 'path', 'rel', 'name', 'branch', 'git_sha', 'text', 'error', 'message', 'value', 'files', 'findings'];
const ENVELOPE = ['id', 'seq', 'ts', 'user', 'user_id', 'email', 'session', 'session_id', 'host', 'hostname', 'repo', 'repo_path', 'cwd', 'tier', 'level'];
const UNKNOWN_EVENTS = ['page_view', 'session_start', 'file_read', 'no_such_event'];

// One hostile value per carrier. Each string must never appear on the wire.
const HOSTILE = {
  relativePath: 'src/billing/charge.ts',
  homePath: '/Users/someone/work/customer/app.py',
  marketingPath: 'app/(marketing)/pricing/page.tsx',
  recordId: 'lib/router.js#handleRequest',
  sourceLine: 'function charge(card) { return card.number; }',
  openaiKey: ['sk', 'abcdefghijklmnopqrstuvwxyz012345'].join('-'),
  githubToken: ['ghp', 'abcdefghijklmnopqrstuvwxyz0123'].join('_'),
  awsKey: ['AKIA', 'ABCDEFGHIJKLMNOP'].join(''),
  bearer: 'bearer abcdefghijklmnopqrstuvwxyz',
  privateKey: ['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' '),
  digest16: '0123456789abcdef',
  digest64: 'a'.repeat(64),
  uuid: '0d6f6a3e-52a7-4f0e-9e1c-6a3f6c1d2b7a',
  longText: 'x'.repeat(20000),
};
const needles = Object.values(HOSTILE);
const carriers = [...needles, needles, { nested: needles[0] }];

function assertClean(wire, where) {
  const bytes = JSON.stringify(wire);
  needles.forEach((needle) => assert.ok(!bytes.includes(needle), `${where} leaked ${needle.slice(0, 40)}`));
  assert.deepEqual(secrets.find(bytes), [], where);
}
const fieldsOf = (rule) => [...rule.counts, ...Object.keys(rule.enums), ...UNRULED];

test('[I-1] every field of every event the rules know, and every name they do not: no hostile value leaves at either tier', () => {
  const known = Object.entries(RULES.EVENT_RULES);
  const own = ['step_summary', 'code_summary', 'decision_summary', 'toy_run', 'toy_state'];
  assert.ok(own.every((name) => RULES.EVENT_RULES[name]), 'the rules know their events');
  for (const [name, rule] of known) {
    for (const field of fieldsOf(rule)) {
      for (const value of carriers) {
        for (const tier of ['normal', 'debug']) {
          const { event } = redact({ event: name, at: AT, tier, payload: { [field]: value } });
          assertClean(event, `${name}.${field}`);
        }
      }
    }
  }
});

test('[I-1] a declaration that could loosen the wall does not read: its package is left out, telemetry\'s events stay', async () => {
    const said = (events) => ({ name: 'toy', text: JSON.stringify({ steps: { tick: 'toy_x' }, codes: [], events }) });
    const bad = [{ form: 'free' }, { form: 'run', counts: ['a/path'] }, { form: 'state', words: { kind: 7 } }, { form: 'run', fields: ['x'] },
      { form: 'state', totalOf: 'nothing' }, { form: 'run', whole: { step: 'tick', sum: 'n', scale: 0, says: ['a', 'b', 'c'] } }];
    for (const one of bad) {
      const rules = await rulesOver([said({ toy_x: one })]);
      assert.deepEqual([rules.unread, Object.hasOwn(rules.EVENT_RULES, 'toy_x')], [['toy'], false], JSON.stringify(one));
    }
    const taken = await rulesOver([said({ step_summary: { form: 'run', counts: ['x'] } }), ...declaredHere({ shipped: true })]);
    assert.deepEqual([taken.unread, taken.EVENT_RULES.step_summary.counts.includes('x')], [['toy'], false]);
  });

test('[I-1] an event no rule knows never leaves at all, whatever it carries', () => {
  for (const name of UNKNOWN_EVENTS) {
    assert.equal(Object.hasOwn(RULES.EVENT_RULES, name), false, name);
    assert.equal(redact({ event: name, at: AT, payload: { records: 1 } }).event, null);
    carriers.forEach((value) => assert.equal(redact({ event: name, at: AT, payload: { file: value } }).event, null));
  }
});

test('[I-1] a field no rule names leaves neither raw nor as a salted hash', () => {
  for (const name of Object.keys(RULES.EVENT_RULES)) {
    for (const field of UNRULED) {
      const { event } = redact({ event: name, at: AT, payload: { [field]: 'customer-value' } });
      const bytes = JSON.stringify(event);
      assert.ok(!bytes.includes('customer-value') && !bytes.includes(`${field}_hash`), `${name}.${field}`);
    }
  }
});

test('[I-1] a list never passes, not even as its length', () => {
  const name = 'toy_run';
  for (const field of UNRULED) {
    const { event } = redact({ event: name, at: AT, payload: { [field]: ['a/b.js', 'c/d.js'] } });
    assert.deepEqual(event.payload, {}, field);
    assert.equal(event.dropped, 1);
  }
});

test('[I-1] every envelope key on a known event: identity, session, host and repo never leave, in any form', () => {
  for (const key of ENVELOPE) {
    for (const value of carriers) {
      const { event } = redact({ event: 'toy_run', at: AT, [key]: value, payload: {} });
      assertClean(event, key);
      assert.deepEqual(Object.keys(event).sort(), ['at', 'dropped', 'event', 'payload', 'schema'], key);
    }
  }
});

test('[I-1] the count wall: hostile types drop by name, an integer passes', () => {
  const { counts } = RULES.EVENT_RULES.toy_run;
  for (const bad of ['3', -1, 1.5, NaN, Infinity, true, {}, [], HOSTILE.digest16]) {
    const { event, dropped } = redact({ event: 'toy_run', at: AT, payload: { [counts[0]]: bad } });
    assert.deepEqual(event.payload, {}, String(bad));
    assert.deepEqual(dropped, [`payload.${counts[0]}`]);
  }
  assert.deepEqual(redact({ event: 'toy_run', at: AT, payload: { [counts[0]]: 0 } }).event.payload, { [counts[0]]: 0 });
});

test('[I-1] the enum wall: an off-list word and a hostile string drop by name', () => {
  for (const bad of ['no-such-package', HOSTILE.relativePath, 1, null, ['telemetry']]) {
    const { event } = redact({ event: 'step_summary', at: AT, payload: { pkg: bad } });
    assert.equal(event.payload.pkg, undefined);
  }
  assert.equal(redact({ event: 'step_summary', at: AT, payload: { pkg: 'telemetry' } }).event.payload.pkg, 'telemetry');
});

test('[I-1] a client version passes only in its shape; the day replaces the exact time', () => {
  const shaped = redact({ event: 'toy_run', at: AT, cv: '1.2.3-beta.1', payload: {} });
  assert.equal(shaped.event.cv, '1.2.3-beta.1');
  assert.equal(shaped.event.at, '2026-11-02');
  const bad = redact({ event: 'toy_run', at: HOSTILE.homePath, cv: HOSTILE.homePath, payload: {} });
  assertClean(bad.event, 'envelope');
  assert.deepEqual(bad.dropped.sort(), ['at', 'cv']);
});

test('[I-1] malformed input never throws and never leaves; an inherited name is not an event', () => {
  for (const raw of [null, undefined, 7, 'x', [], {}, { event: '__proto__' }, { event: 'constructor' }, { event: 'toString', payload: {} }]) {
    assert.equal(redact(raw).event, null);
  }
  assert.deepEqual(redact({ event: 'toy_run', at: AT, payload: { __proto__: null, constructor: 1 } }).event.payload, {});
});

test('[I-1] a pathological event stays bounded: dropped is a number on the wire, the names stay local', () => {
  const payload = Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`src/customer/file-${i}.ts`, 1]));
  const { event, dropped } = redact({ event: 'toy_run', at: AT, payload });
  assert.equal(event.dropped, 5000);
  assert.equal(dropped.length, 5000);
  assert.ok(!JSON.stringify(event).includes('customer'));
});

test('[I-1] the whole-record byte wall holds: over the cap the payload goes, the record says so', () => {
  assert.equal(PAYLOAD_BYTE_CAP, 30000);
  const { counts } = RULES.EVENT_RULES.toy_run;
  const { event } = redact({ event: 'toy_run', at: AT, payload: { [counts[0]]: 1 } }, { cap: 10 });
  assert.deepEqual(event.payload, {});
  assert.equal(event.oversize, true);
  const everyField = Object.fromEntries(counts.map((name) => [name, Number.MAX_SAFE_INTEGER]));
  assert.equal(redact({ event: 'toy_run', at: AT, payload: everyField }).event.oversize, undefined);
});

test('[I-1] redact is deterministic: the same event gives the same bytes, whatever the key order', () => {
  const { counts } = RULES.EVENT_RULES.toy_run;
  const [a, b] = counts;
  const one = redact({ event: 'toy_run', at: AT, payload: { [a]: 1, [b]: 2 } }).event;
  const two = redact({ payload: { [b]: 2, [a]: 1 }, at: AT, event: 'toy_run' }).event;
  assert.equal(JSON.stringify(one), JSON.stringify(two));
});
