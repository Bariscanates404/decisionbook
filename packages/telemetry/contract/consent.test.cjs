// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The choice through the public verbs: its order, what each command writes (the transition table), setup's question and notice
// under both values of the default, the old record, the env names that cannot open it (I-13) and the records that read as off (I-14).
const test = require('node:test');
const assert = require('node:assert/strict');
const { errors: { fail } } = require('@atlasbound/kit');
const telemetry = require('@atlasbound/telemetry');
const { internals, declaredDescriptors, telemetryWorld, addressFilled } = require('./world.cjs');

const { PATHS, WIRE, SCHEMA } = internals;
const URL_SET = 'https://telemetry.example/v1/reports';
const typed = { ask: async () => true };
const AT = '2026-11-18T10:00:00.000Z';
const pair = (ns) => ({ cli: 1, db: 1, handoff: 1 })[ns];
const entry = (on, ns, core = WIRE.policy) => ({ on, core, policy: pair(ns) ?? 1, at: AT });
const v2 = (over) => JSON.stringify({ schema: SCHEMA.consent, at: AT, all: null, modules: {}, noticed: null, ...over });
const homeOf = (text) => ({ [PATHS.consent]: text });
const codesByNs = async (io) => Object.fromEntries((await telemetry.status(io, {})).states.map((s) => [s.space.ns, s.code]));
const storedChoice = (io) => JSON.parse(io.home.store.get(PATHS.consent));
const withWire = async (over, fn) => {
  const was = { ...WIRE };
  Object.assign(WIRE, over);
  try {
    await fn();
  } finally {
    Object.assign(WIRE, was);
  }
};

test('[I-3] order: an environment switch beats your on, and each switch alone closes', async () => {
  const on = homeOf(v2({ modules: { cli: entry(true, 'cli'), db: entry(true, 'db'), handoff: entry(true, 'handoff') } }));
  assert.deepEqual(await codesByNs(telemetryWorld({ home: on })), { cli: 'telemetry-on', db: 'telemetry-on', handoff: 'telemetry-on' });
  for (const env of [{ DO_NOT_TRACK: '1' }, { ATLASBOUND_TELEMETRY: '0' }, { ATLASBOUND_TELEMETRY: 'off' }, { CI: 'true' }, { MCP_OBS_DISABLED: '1' },
    { ATLASBOUND_PUMP: 'false' }]) {
    const view = await telemetry.status(telemetryWorld({ home: on, env }), {});
    assert.deepEqual([view.killed, view.states.every((s) => s.code === 'telemetry-killed')], [Object.keys(env)[0], true], JSON.stringify(env));
  }
});

test('[I-13] no env var opens it or moves the address: every plausible name, and the switches set to their open words', async () => {
  const plausible = { ATLASBOUND_TELEMETRY: '1', TELEMETRY: '1', ATLASBOUND_OPT_IN: '1', ATLASBOUND_TELEMETRY_URL: 'https://attacker.example',
    DO_NOT_TRACK: '0', CI: '' };
  assert.deepEqual(Object.values(await codesByNs(telemetryWorld({ env: plausible }))), ['telemetry-not-chosen', 'telemetry-not-chosen', 'telemetry-not-chosen']);
  assert.equal(WIRE.url, '', 'the address is data only');
});

test('[I-3] order: a record that does not read beats any choice; your off beats a module on; a module off beats the default', async () => {
  for (const text of ['{not json', v2({ schema: 'ab-consent/9' }), JSON.stringify({ schema: SCHEMA.consent, all: 'off' })]) {
    assert.deepEqual(new Set(Object.values(await codesByNs(telemetryWorld({ home: homeOf(text) })))), new Set(['telemetry-consent-unreadable']), text);
  }
  const allOff = homeOf(v2({ all: 'off', modules: { db: entry(true, 'db') } }));
  assert.equal((await codesByNs(telemetryWorld({ home: allOff }))).db, 'telemetry-off');
  addressFilled(URL_SET, '');
  await withWire({ unchosen: 'on' }, async () => {
    const noticed = { core: WIRE.policy, at: AT, policies: { cli: 1, db: 1, handoff: 1 } };
    const moduleOff = homeOf(v2({ noticed, modules: { db: entry(false, 'db') } }));
    assert.deepEqual(await codesByNs(telemetryWorld({ home: moduleOff })), { cli: 'telemetry-default', db: 'telemetry-off', handoff: 'telemetry-default' });
  });
  addressFilled('', '');
});

test('[I-3] order: an on counts only under the current (core, namespace) pair; an off of any pair holds', async () => {
  const old = homeOf(v2({ modules: { cli: entry(true, 'cli', WIRE.policy - 1), db: { ...entry(true, 'db'), policy: 0 }, handoff: entry(false, 'handoff', 0) } }));
  assert.deepEqual(await codesByNs(telemetryWorld({ home: old })), { cli: 'telemetry-not-chosen', db: 'telemetry-not-chosen', handoff: 'telemetry-off' });
});

test('[I-3] order: nobody chose: on only as the beta default, with an address, after the notice, until betaUntil', async () => {
  const noticed = homeOf(v2({ noticed: { core: WIRE.policy, at: AT, policies: { cli: 1, db: 1, handoff: 1 } } }));
  assert.equal((await codesByNs(telemetryWorld({ home: noticed }))).db, 'telemetry-not-chosen', 'unchosen ask: no default');
  await withWire({ unchosen: 'on' }, async () => {
    assert.equal((await codesByNs(telemetryWorld({ home: noticed }))).db, 'telemetry-not-chosen', 'no address: no default');
    await withWire({ url: URL_SET }, async () => {
      assert.equal((await codesByNs(telemetryWorld({ home: noticed }))).db, 'telemetry-default');
      assert.equal((await codesByNs(telemetryWorld({ home: homeOf(v2({})) }))).db, 'telemetry-not-chosen', 'no notice seen: no default');
      assert.equal((await codesByNs(telemetryWorld({ home: noticed, at: '2027-04-01T00:00:00.000Z' }))).db, 'telemetry-not-chosen', 'after betaUntil');
      await withWire({ betaModules: ['cli'] }, async () => assert.equal((await codesByNs(telemetryWorld({ home: noticed }))).db, 'telemetry-not-chosen'));
    });
  });
});

test('[I-3] transitions: a bare off closes every entry the record holds, another install\'s too; on m after it turns on m alone', async () => {
  const io = telemetryWorld({ home: homeOf(v2({ modules: { bound: { on: true, core: 1, policy: 3, at: AT }, db: entry(true, 'db') } })) });
  await telemetry.optOut(io, {});
  assert.equal(storedChoice(io).all, 'off');
  assert.deepEqual(Object.entries(storedChoice(io).modules).map(([ns, one]) => [ns, one.on]).sort(),
    [['bound', false], ['cli', false], ['db', false], ['handoff', false]]);
  await telemetry.optIn(io, { rest: ['db'], ...typed });
  assert.equal(storedChoice(io).all, null);
  assert.deepEqual(await codesByNs(io), { cli: 'telemetry-off', db: 'telemetry-on', handoff: 'telemetry-off' });
  assert.equal(storedChoice(io).modules.bound.on, false, 'an entry of a namespace not here never comes back by itself');
});

test('[I-3] transitions: off m closes m alone; a bare on lists and opens what is here; a package name is a module word', async () => {
  const io = telemetryWorld();
  const said = [];
  await telemetry.optIn(io, { rest: [], ask: async (info) => said.push(info) > 0 });
  assert.match(said[0], /For: cli \(the command line and its hooks\), db \(DecisionBook: plans, answers and gate decisions\), handoff \(Handoff: notes\)/);
  assert.match(said[0], /This build has no address to send to/);
  assert.deepEqual(await codesByNs(io), { cli: 'telemetry-on', db: 'telemetry-on', handoff: 'telemetry-on' });
  await telemetry.optOut(io, { rest: ['decisionbook'] });
  assert.deepEqual(await codesByNs(io), { cli: 'telemetry-on', db: 'telemetry-off', handoff: 'telemetry-on' });
  assert.equal(storedChoice(io).all, null);
  await assert.rejects(telemetry.optOut(io, { rest: ['nowhere'] }), { code: 'telemetry-module-unknown' });
  await assert.rejects(telemetry.optIn(io, { rest: [], ask: async () => false }), { code: 'telemetry-phrase-not-typed' });
});

test('[I-3] transitions: 0.25.1\'s off reads as your off; then on db under the default turns on db alone', async () => {
  const io = telemetryWorld({ home: homeOf(JSON.stringify({ schema: SCHEMA.consentOld, on: false, at: AT })) });
  assert.deepEqual(new Set(Object.values(await codesByNs(io))), new Set(['telemetry-off']));
  await withWire({ unchosen: 'on', url: URL_SET }, async () => {
    await telemetry.optIn(io, { rest: ['db'], ...typed });
    io.home.store.set(PATHS.consent, v2({ ...storedChoice(io), noticed: { core: WIRE.policy, at: AT, policies: { cli: 1, db: 1, handoff: 1 } } })); // the notice seen: the default holds
    assert.deepEqual(await codesByNs(io), { cli: 'telemetry-off', db: 'telemetry-on', handoff: 'telemetry-off' });
  });
  const on = telemetryWorld({ home: homeOf(JSON.stringify({ schema: SCHEMA.consentOld, on: true, at: AT })) });
  assert.deepEqual(new Set(Object.values(await codesByNs(on))), new Set(['telemetry-not-chosen']), '0.25.1\'s on was for another collection');
});

test('[I-4] address set, a person at a plain terminal: Enter or y on; n off; another word asked again, then no choice said', async () => {
  addressFilled(URL_SET, '');
  for (const [answers, code] of [[[''], 'telemetry-on'], [['y'], 'telemetry-on'], [['n'], 'telemetry-off'], [['1', 'y'], 'telemetry-on'],
    [['later', '1'], 'telemetry-not-chosen'], [[null], 'telemetry-not-chosen']]) {
    const io = telemetryWorld();
    const asked = [];
    const said = await telemetry.hint(io, { ask: async (question) => asked.push(question) && answers[asked.length - 1] });
    assert.equal(asked.length, answers.length);
    if (answers.length > 1) assert.match(asked[1], /^Please answer y or n \[Y\/n\]/);
    assert.equal(/no choice was recorded/.test(JSON.stringify(said)), answers.length > 1 && code === 'telemetry-not-chosen', JSON.stringify(said));
    assert.match(asked[0], /^Send a daily usage report during the beta\? It goes to telemetry\.atlasbound\.dev/);
    assert.match(asked[0], /For: cli \(.*\), db \(.*\), handoff \(.*\)/);
    assert.match(asked[0], /\[Y\/n\] \(Enter = yes\) $/);
    assert.deepEqual(new Set(Object.values(await codesByNs(io))), new Set([code]), JSON.stringify(answers));
    if (code !== 'telemetry-not-chosen') assert.equal(storedChoice(io).all, null);
  }
  addressFilled('', '');
});

test('[I-4] a no is never asked again; an on under an older pair is; an answered namespace is not', async () => {
  addressFilled(URL_SET, '');
  const io = telemetryWorld({ home: homeOf(v2({ modules: { cli: entry(false, 'cli', 0), db: entry(true, 'db', 0), handoff: entry(true, 'handoff') } })) });
  const asked = [];
  await telemetry.hint(io, { ask: async (question) => asked.push(question) && 'n' });
  assert.match(asked[0], /For: db \(DecisionBook[^)]*\)\n/);
  addressFilled('', '');
});

test('[I-4] nothing asked or written for an AI, a pipe, a wrapped terminal, a switch, your off, or an empty address', async () => {
  const cases = [{ actor: { who: 'ai' } }, { ask: null }, { actor: { who: 'terminal', wrapped: 'expect' } }, { env: { DO_NOT_TRACK: '1' } },
    { env: { CI: '1' } }, { env: { ATLASBOUND_TELEMETRY: 'no' } }, { home: homeOf(v2({ all: 'off' })) }];
  for (const unchosen of ['ask', 'on']) {
    await withWire({ unchosen, url: URL_SET }, async () => {
      for (const one of cases) {
        const io = telemetryWorld(one);
        const before = io.home.store.get(PATHS.consent);
        const said = await telemetry.hint(io, { ask: one.ask === null ? null : async () => assert.fail('asked') });
        assert.equal(io.home.store.get(PATHS.consent), before, `${unchosen} ${JSON.stringify(one)}: nothing written, noticed neither`);
        if (one.env || one.home) assert.equal(said.line, null);
      }
    });
    await withWire({ unchosen }, async () => {
      const io = telemetryWorld();
      assert.deepEqual(await telemetry.hint(io, { ask: async () => assert.fail('asked') }), { line: null }, 'no address: nothing at all');
      assert.equal(io.fs.store.size, 1, 'only its own trace row');
    });
  }
});

test('[I-4] unchosen on: the notice once per core policy to a person, then the default; elsewhere the hint once a day', async () => {
  await withWire({ unchosen: 'on', url: URL_SET }, async () => {
    const io = telemetryWorld();
    const first = await telemetry.hint(io, { ask: async () => assert.fail('the notice asks nothing') });
    assert.match(first.line, /^Telemetry is on during the beta \(until 2027-03-31\): a daily usage report goes to telemetry\.atlasbound\.dev/);
    assert.deepEqual(storedChoice(io).noticed.core, WIRE.policy);
    assert.equal((await codesByNs(io)).db, 'telemetry-default');
    assert.equal((await telemetry.hint(io, { ask: async () => assert.fail('asked') })).line, null, 'once');
    const ai = telemetryWorld({ actor: { who: 'ai' } });
    assert.match((await telemetry.hint(ai, {})).line, /^Telemetry is not on\. A person can turn it on: atlasbound telemetry on/);
    assert.equal((await telemetry.hint(ai, {})).line, null, 'once a day here');
  });
});

test('[I-14] a linked record reads as off, not a crash; no home is off and on is refused by its code', async () => {
  const io = telemetryWorld({ home: homeOf(v2({ modules: { db: entry(true, 'db') } })) });
  io.home.readText = () => {
    throw fail('path-link', PATHS.consent);
  };
  assert.equal((await codesByNs(io)).db, 'telemetry-consent-unreadable');
  const noHome = { ...telemetryWorld(), home: null };
  assert.equal((await codesByNs(noHome)).db, 'telemetry-no-home');
  await assert.rejects(telemetry.optIn(noHome, typed), { code: 'telemetry-no-home' });
  assert.equal((await telemetry.doctor(telemetryWorld({ home: homeOf('{torn') }))).ok, false);
  assert.equal((await telemetry.doctor(telemetryWorld())).ok, true);
});

test('[I-16] on and off write only the home record; status writes nothing; each verb leaves its trace row', async () => {
  const io = telemetryWorld();
  await telemetry.optIn(io, typed);
  await telemetry.optOut(io, {});
  await telemetry.status(io, {});
  assert.deepEqual([...io.fs.store.keys()].filter((key) => !key.startsWith('.atlasbound/trace/')), []);
  const steps = io.fs.store.get('.atlasbound/trace/cli-20261118-1.ndjson').trim().split('\n').map((line) => JSON.parse(line).step);
  assert.deepEqual(steps, ['consent-on', 'consent-off', 'consent-status']);
});

test('[I-4] a raised module policy is not covered by an earlier notice: not chosen for it, and the notice is said again', async () => {
  const raised = declaredDescriptors({ open: true }).map((row) => (row.name === 'decisionbook'
    ? { ...row, text: JSON.stringify({ ...JSON.parse(row.text), policy: 2 }) } : row));
  await withWire({ unchosen: 'on', url: URL_SET }, async () => {
    const io = telemetryWorld();
    await telemetry.hint(io, { ask: async () => assert.fail('the notice asks nothing') });
    const later = { ...io, packageData: (rel) => (rel === 'contracts/telemetry.json' ? raised : []) };
    assert.deepEqual(await codesByNs(later), { cli: 'telemetry-default', db: 'telemetry-not-chosen', handoff: 'telemetry-default' });
    assert.match((await telemetry.hint(later, { ask: async () => assert.fail('asked') })).line, /^Telemetry is on during the beta/);
    assert.equal((await codesByNs(later)).db, 'telemetry-default');
  });
});

test('[I-4] status under the beta default says until when, as the notice does', async () => {
  await withWire({ unchosen: 'on', url: URL_SET }, async () => {
    const io = telemetryWorld();
    await telemetry.hint(io, { ask: async () => assert.fail('asked') });
    assert.match(telemetry.debug.render(await telemetry.status(io, {})), /^telemetry: ON for cli, db \(decisionbook\), handoff \(the beta's default until 2027-03-31\)$/m);
  });
});
