// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Whether a namespace reports, pure, first match wins: an environment switch -> no readable choice -> your off -> the namespace's off ->
// its on under the current (core, namespace) policy pair -> nobody chose (on only as the beta's default, after its notice, with an
// address). Env can only close. And what each command writes: a command never turns on a namespace it did not name or list.
const { closedState, choiceEntry, onUnderPair } = require('../contracts/helpers.cjs');

const OFF_WORDS = ['0', 'off', 'false', 'no'];
// An environment switch, as its value reads (trimmed, lower case): the process it is set in makes and sends nothing.
const SWITCHES = {
  DO_NOT_TRACK: (value) => !['', '0'].includes(value),
  ATLASBOUND_TELEMETRY: (value) => OFF_WORDS.includes(value),
  CI: (value) => !['', '0', 'false'].includes(value),
  MCP_OBS_DISABLED: (value) => !['', ...OFF_WORDS].includes(value),
  ATLASBOUND_PUMP: (value) => OFF_WORDS.includes(value),
};
const SWITCH_NAMES = Object.keys(SWITCHES);
const NONE = Object.freeze({ all: null, modules: {}, noticed: null });

/** The switch that closes this process, or null. `words`: each switch's value as the environment holds it. */
const switchOf = (words) => SWITCH_NAMES.find((name) => SWITCHES[name](words[name] ?? '')) ?? null;

/** A stored record as a choice: ab-consent/2 as it is; 0.25.1's ab-consent/1 off as your off, its on as no choice (it was given for
 * another collection). */
const choiceRead = (record, schema) => (record.schema === schema.consentOld ? { ...NONE, all: record.on === false ? 'off' : null }
  : { all: record.all === 'off' ? 'off' : null, modules: record.modules, noticed: record.noticed ?? null });

// What closes a namespace before any on is looked at: a switch, a record that does not read, your off, its own off.
const closedBy = ({ killed, choice, refused }, entry) => (killed && closedState('telemetry-killed', killed)) || (refused && closedState(refused))
  || ((choice.all === 'off' || entry?.on === false) && closedState('telemetry-off')) || null;
/** Whether the notice a person saw covers a namespace: said under the current core policy and this namespace's current policy. */
const noticeCovers = (noticed, { wire, space }) => noticed?.core === wire.policy && noticed.policies?.[space.ns] === space.policy;
const byDefault = ({ noticed }, at) => at.wire.unchosen === 'on' && Boolean(at.wire.url) && at.wire.betaModules.includes(at.space.ns)
  && at.today <= at.wire.betaUntil && noticeCovers(noticed, at);

/** One namespace's state: `{ on, code, source, since, why }`. `held`: { killed, choice, refused }; `at`: { wire, space, today }. */
function reportingState(held, at) {
  const entry = choiceEntry(held.choice, at.space.ns);
  const closed = closedBy(held, entry);
  if (closed) return closed;
  if (onUnderPair(entry, at)) return { on: true, code: 'telemetry-on', source: 'person', since: entry.at, why: null };
  if (byDefault(held.choice, at)) return { on: true, code: 'telemetry-default', source: 'default', since: held.choice.noticed.at, why: null };
  return closedState('telemetry-not-chosen');
}

/** Whether setup puts its question for a namespace: no entry, or an on under an older pair. A no of any pair stands. */
const unanswered = (choice, at) => {
  const entry = choiceEntry(choice, at.space.ns);
  return !entry || (entry.on === true && !onUnderPair(entry, at));
};

// Which namespaces a command writes off and on, and what it does to `all`; `on m` after a bare off first writes off the others here.
function writesOf(choice, { act, names, yes, here }) {
  const bare = !names.length;
  const unwritten = Object.keys(here).filter((ns) => !Object.hasOwn(choice.modules, ns));
  const WRITES = {
    off: () => ({ all: bare ? 'off' : choice.all, off: bare ? [...new Set([...Object.keys(here), ...Object.keys(choice.modules)])] : names, on: [] }),
    on: () => ({ all: null, off: !bare && choice.all === 'off' ? unwritten : [], on: bare ? Object.keys(here) : names }),
    answer: () => ({ all: choice.all, off: yes ? [] : names, on: yes ? names : [] }),
    notice: () => ({ all: choice.all, off: [], on: [] }),
  };
  return WRITES[act]();
}

/** What a command writes. `act`: off | on | answer (setup's) | notice (`names`: those it covered); `names`: the namespaces it names;
 * `here`: { ns: policy } of the namespaces registered now; `core`: wire.policy; `at`: now. A bare off (and reset --forget) closes every
 * entry the record holds, so no entry of another install comes back. */
function choiceAfter(choice, { act, names = [], yes, here, core, at }) {
  const writes = writesOf(choice, { act, names, yes, here });
  const modules = { ...choice.modules };
  const put = (on) => (ns) => {
    modules[ns] = { on, core, policy: here[ns] ?? modules[ns]?.policy ?? 0, at };
  };
  writes.off.forEach(put(false));
  writes.on.forEach(put(true));
  const policies = Object.fromEntries(names.map((ns) => [ns, here[ns]]));
  return { all: writes.all, modules, noticed: act === 'notice' ? { core, at, policies } : choice.noticed };
}

module.exports = { NONE, SWITCH_NAMES, switchOf, choiceRead, reportingState, unanswered, choiceAfter, noticeCovers };
