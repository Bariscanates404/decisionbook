// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The registry's rules, pure: which descriptors form which namespace (wire.json `owners` binds the open ones), the core metrics of every
// namespace, the metrics a descriptor names, and the wire schema both ends validate with (schemaOf). What a policy covers is pinned by a
// test (test/unit/locks.test.cjs): a changed collection shape under an unchanged policy is a silent widening.
const { trace: { VERDICTS } } = require('@atlasbound/kit');
const { descriptorRead } = require('./declared.cjs');
const { WIRE, validate } = require('./shapes.cjs');

const DESCRIPTOR = 'contracts/telemetry.json';
const MS = [0, 50, 200, 1000, 5000, 30000];
const HEALTH = ['lost', 'overflow', 'unsupported', 'send_failed', 'rejected', 'unreadable', 'cut'];
/** A product word on the wire: every char outside `[\w-]` as `-`, so the cli's `hook.in` leaves as `hook-in`. */
const wireWord = (word) => String(word).replace(/[^\w-]/gu, '-');
const closed = (words) => [...[...new Set(words)].filter((word) => word !== 'other').sort(), 'other'];

/** The five metrics every namespace has over its measured steps, its codes and, where its steps carry one, the host event. */
function coreMetrics({ steps, timed, codes, events }) {
  const opt = events ? { opt: { event: events } } : {};
  return {
    step: { type: 'counter', dims: { step: steps, outcome: ['ok', 'failed'] }, ...opt },
    step_ms: { type: 'histogram', dims: { step: timed }, ...opt, edges: MS },
    code: { type: 'counter', dims: { step: steps, code: codes } },
    failure: { type: 'counter', dims: { step: steps, code: codes } },
    decision: { type: 'counter', dims: { step: steps, verdict: VERDICTS, code: codes } },
  };
}
// A metric a descriptor names: computed by telemetry itself, or a count of an `ok` row of one step.
const COMPUTED = { 'hook-incomplete': (events) => ({ type: 'counter', dims: { event: events ?? ['other'] } }),
  health: () => ({ type: 'counter', dims: { kind: HEALTH } }) };
const namedMetric = (one, stepOf, events) => (one.computed ? { ...COMPUTED[one.computed](events), computed: one.computed }
  : { type: one.buckets ? 'histogram' : 'counter', dims: {}, ...(one.buckets ? { edges: one.buckets } : {}),
    from: { step: stepOf(one.step), n: one.n, code: one.code ?? null } });

/** The step table of a namespace: `<pkg>:<step>` -> its wire word (the step alone in a namespace of one package, `<pkg>-<step>` in one of
 * several) and how it is measured; null when two steps would leave as one word. */
function namespaceSteps(group) {
  const steps = new Map();
  for (const one of group) {
    for (const [step, mark] of Object.entries(one.steps)) {
      const word = wireWord(group.length > 1 ? `${one.pkg}-${step}` : step);
      steps.set(`${one.pkg}:${step}`, { word, measured: mark !== 'local-only', timed: mark !== 'local-only' && mark !== 'measured-untimed',
        event: Boolean(one.event?.steps.includes(step)) });
    }
  }
  const words = [...steps.values()].map((step) => step.word);
  return new Set(words).size === words.length ? steps : null;
}

/** One namespace from its descriptors (and the shared codes) -> its registration, or `{ refused }` with the local reason. */
function spaceOf(group, shared) {
  const [first] = group;
  if (group.some((one) => one.schema !== first.schema || one.policy !== first.policy)) return { refused: 'namespace-split' };
  const steps = namespaceSteps(group);
  const named = group.flatMap((one) => Object.keys(one.metrics));
  if (!steps) return { refused: 'step-twice' };
  if (new Set(named).size !== named.length) return { refused: 'metric-twice' };
  const measured = [...steps.values()].filter((step) => step.measured);
  const words = group.flatMap((one) => one.event?.words ?? []);
  const events = group.some((one) => one.event) ? closed(words) : null;
  const timed = measured.filter((step) => step.timed);
  const metrics = coreMetrics({ steps: measured.map((step) => step.word), timed: timed.map((step) => step.word),
    codes: closed([...shared, ...group.flatMap((one) => one.codes)].map(wireWord)), events });
  const stepOf = (pkg) => (step) => `${pkg}:${step}`;
  group.forEach((one) => Object.entries(one.metrics).forEach(([name, spec]) => {
    metrics[name] = namedMetric(spec, stepOf(one.pkg), events);
  }));
  const event = group.find((one) => one.event)?.event ?? null;
  return { ns: first.namespace, packages: group.map((one) => one.pkg).sort(), schema: first.schema, policy: first.policy, lock: first.lock,
    says: first.says, steps, metrics, event };
}

/** Every descriptor of the install (`[{ name, text }]`, as io.packageData hands them) -> the namespaces registered here and the
 * descriptors refused (`{ name, code }`). */
function spacesOf(rows, wire) {
  const parsed = rows.map(({ name, text }) => ({ name, value: validate.jsonOrNull(text) }));
  const refused = parsed.filter(({ value }) => descriptorRead(value) === false).map(({ name }) => ({ name, code: 'descriptor-unread' }));
  const fine = parsed.filter(({ value }) => descriptorRead(value)).map(({ name, value }) => ({ ...value, pkg: name }));
  const owned = (ns) => (Object.hasOwn(wire.owners, ns) ? wire.owners[ns] : null);
  const taken = fine.filter((one) => one.namespace && owned(one.namespace) && !owned(one.namespace).includes(one.pkg));
  refused.push(...taken.map((one) => ({ name: one.pkg, code: 'namespace-taken' })));
  const shared = fine.filter((one) => one.shared).flatMap((one) => one.codes);
  const names = [...new Set(fine.filter((one) => one.namespace && !taken.includes(one)).map((one) => one.namespace))].sort();
  const spaces = [];
  for (const ns of names) {
    const group = fine.filter((one) => one.namespace === ns && !taken.includes(one));
    const space = spaceOf(group, shared);
    if (space.refused) refused.push(...group.map((one) => ({ name: one.pkg, code: space.refused })));
    else spaces.push(space);
  }
  return { spaces, refused };
}

const wireMetric = ({ type, dims, opt, edges }) => ({ type, dims, ...(opt ? { opt } : {}), ...(edges ? { edges } : {}) });
const each = (map, fn) => Object.fromEntries(Object.entries(map).map(([key, value]) => [key, fn(value)]));

/** The wire schema of the namespaces registered here: the same file the server validates with (its generator adds an entry per
 * namespace and schema version). */
const schemaOf = (spaces, wire) => ({ protocol: wire.protocol, policy: wire.policy, countCap: wire.limits.countCap,
  rows: wire.limits.reportRows, words: wire.words,
  modules: Object.fromEntries(spaces.map((one) => [one.ns, { [one.schema]: { policy: one.policy, metrics: each(one.metrics, wireMetric) } }]
  )),
});

/** The namespaces registered by the descriptors on disk in this install (io.packageData), and the descriptors refused. */
const spacesIn = (io) => spacesOf(io.packageData(DESCRIPTOR), WIRE);

module.exports = { spacesIn, schemaOf };
