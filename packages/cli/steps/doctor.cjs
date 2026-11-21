// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// doctor: never green on silence. Each package answers `measured`, `not-measured` or `problem`; the cli measures the wiring.
const { traced, debug: { render: { columns } }, errors: { isFail }, text: { lines: { filled } } } = require('@atlasbound/kit');
const { DEBUG_SCHEMA, CONFIG_FILE } = require('../contracts/shapes.cjs');
const validate = require('../contracts/validate.cjs');
const { shortOf, WORDS: { doctor: W, states: SAID, manifestInvalid: MANIFEST_INVALID, toDo: TO_DO } } = require('../contracts/codes.cjs');
const { capabilitiesOf } = require('../core/capabilities.cjs');
const { serversOf } = require('../core/host.cjs');
const { probed, adviceOf, hintOf } = require('./probes.cjs');
const { noticeOf } = require('./protect.cjs');
const { moduleRows, moduleStateOf, moduleLine } = require('./modules.cjs');
const GONE_SHOWN = 4;
const row = (name, state, health, says = null) => ({ name, state, health, says });
const absent = (io, name) => (io.catalog.modules.base.includes(name) ? row(name, 'not-installed', 'problem', W.required) : row(name, 'not-installed', 'not-measured'));

/** A package whose module is off here is not asked: off is a choice, not a problem. Each row says where the package was found. */
const packageRow = (io, name) => Promise.resolve().then(async () => {
  const from = io.packages.where(name)?.from?.name ?? null;
  if (io.packages.has(name) && !io.packages.wired(name)) return { ...row(name, moduleStateOf(io, name), 'not-measured', W.notOn), from };
  const entry = io.packages.load(name);
  if (typeof entry.doctor !== 'function') return { ...row(name, 'installed', 'not-measured'), from };
  const res = validate.shape('Doctor', await entry.doctor(io.packages.ioFor(name)));
  return { ...row(name, 'installed', res.ok ? 'measured' : 'problem', res.says), from };
}).catch((err) => {
  if (err.code === 'package-not-installed') return absent(io, name);
  return err.code === 'package-broken' ? row(name, 'broken', 'problem', err.message) : row(name, 'installed', 'problem', isFail(err) ? err.message : err.code || err.name);
});

/** A drift entry is a package's when it names what that package declared; the rest is the host's (the ignore block, the allow rules). */
const namesOf = (m) => [...(m.commands || []).map((c) => c.dest), ...serversOf([m]).map((server) => server.name), ...(m.hooks || []).map((h) => ` hook ${h.event}`)];

/** A package's entry, or why there is none (its own row says how it broke); any other throw is a fault, never a state. */
const loadedEntry = (io) => (name) => {
  try {
    return { entry: io.packages.load(name) };
  } catch (err) {
    if (err.code === 'package-not-installed') return { state: 'not-installed' };
    if (err.code === 'package-broken') return { state: 'broken' };
    throw err;
  }
};

async function viewOf(io, { probing = true } = {}) { // `status` judges nothing, so it asks for no probe
  const { manifests, problems: unread } = io.packages.declared();
  // the base and every package of a module with any package on disk: a module with none says so on its module line, not package by package
  const listed = io.packages.names.filter((name) => io.catalog.modules.base.includes(name)
    || io.catalog.modules.modules.some((m) => m.packages.includes(name) && m.packages.some(io.packages.has)));
  const rows = await Promise.all(listed.map((name) => packageRow(io, name)));
  const plan = io.host.plan(manifests, io.packages);
  const missing = io.host.drift(plan);
  const owned = new Set(manifests.flatMap(namesOf));
  const host = missing.filter((d) => ![...owned].some((n) => d.name.endsWith(n)));
  const packages = rows.map((r) => {
    const names = namesOf(manifests.find((m) => m.name === r.name) || {});
    return { ...r, wired: names.length ? !missing.some((d) => names.some((n) => d.name.endsWith(n))) : null };
  });
  const probes = probing ? (await traced(io, 'probes', probed)({ plan, manifests }, { run: io.run })).out : [];
  const advice = probing ? await adviceOf(io) : [];
  const modules = moduleRows(io);
  const { verbs, provides, conflicts } = io.catalog;
  const capabilities = capabilitiesOf({ verbs, provides, manifests, entryOf: loadedEntry(io) });
  const manifestProblems = [...unread, ...conflicts];
  // an install record git holds is another machine's: every wiring verb refuses it (steps/setup cloneOf), so doctor says it too; where
  // git cannot be asked, its own probe line says that
  const recordTracked = await io.git.tracked([io.host.stateFile]).then((keys) => keys.includes(io.host.stateFile), (err) => {
    if (!isFail(err)) throw err;
    return false;
  });
  const problems = problemsOf({ packages, modules, manifests: manifestProblems, missing, probes, configRefused: io.configRefused,
    recordTracked, record: io.host.stateFile });
  return { schema: DEBUG_SCHEMA, verb: 'doctor', root: io.root, ok: problems.length === 0, modules, packages, problems, missing, capabilities,
    host: { wired: host.length === 0, missing: host }, probes, advice, protectedPaths: await noticeOf(io) };
}

/** The ONE list `ok` is judged from: whatever doctor saw go wrong, each with where and what it says. */
const problemsOf = ({ packages, modules, manifests, missing, probes, configRefused, recordTracked, record }) => [
  ...(configRefused ? [{ from: 'config', name: CONFIG_FILE, says: configRefused.message }] : []),
  ...(recordTracked ? [{ from: 'record', name: record, says: `state-tracked: ${record}: ${shortOf('state-tracked')}` }] : []),
  ...(modules.some((m) => m.state === 'on') ? [] : [{ from: 'modules', name: 'modules', says: W.noModule }]),
  ...packages.filter((p) => p.health === 'problem').map((p) => ({ from: 'package', name: p.name, says: p.says || p.state })),
  ...manifests.map((m) => ({ from: 'manifest', name: m, says: 'manifest-invalid' })),
  ...missing.map((d) => ({ from: 'wiring', name: d.name, says: filled(W.notWired, { what: d.what }) })),
  ...probes.filter((p) => p.state === 'failed').map((p) => ({ from: 'probe', name: p.name, says: p.says }))];

const wiredText = (w) => (w === null ? W.nothingToWire : w ? 'wired' : W.notWiredColumn);

/** One package's columns: its name, state, wiring, health, what it says, and the add-on it came from. */
const packageColumns = (plainName) => (p) => [plainName(p.name), SAID[p.state] || p.state, p.state === 'installed' ? wiredText(p.wired) : '',
  p.state === 'not-installed' ? '' : SAID[p.health] || p.health, [p.says, p.from && filled(W.from, { from: p.from })].filter(Boolean).join('; ')];

function textOf(view, plainName) {
  const toDo = view.advice.length ? [TO_DO, ...view.advice.map((line) => `  ${line}`)] : [];
  const packageRows = view.packages.map(packageColumns(plainName));
  const gone = [...new Set(view.host.missing.map((d) => filled(W.gone, { what: d.what, name: d.what === 'hook' ? d.name.split(' ')[0] : d.name })))];
  const notWired = gone.length > GONE_SHOWN ? [...gone.slice(0, GONE_SHOWN), filled(W.goneMore, { n: gone.length - GONE_SHOWN })] : gone;
  const unmeasured = [...view.packages.filter((p) => p.state === 'installed' && p.health === 'not-measured'), ...view.probes.filter((p) => p.state === 'not-measured')];
  const closing = filled(W.closing, { verdict: view.ok ? 'ok' : 'problem',
    unmeasured: unmeasured.length ? filled(W.unmeasured, { names: unmeasured.map((p) => plainName(p.name)).join(', ') }) : '' });
  const config = view.problems.filter((p) => ['config', 'record'].includes(p.from)).map((p) => filled(W[p.from], { says: p.says }));
  const manifests = view.problems.filter((p) => p.from === 'manifest').map((p) => filled(MANIFEST_INVALID, { name: p.name }));
  const gaps = view.capabilities.filter((c) => c.state === 'capability-missing').map((c) => filled(W.gap, c));
  const answering = view.capabilities.filter((c) => c.state === 'answers').length;
  const promised = [filled(W.promised, { answering, n: view.capabilities.length }), ...gaps];
  // drift is mended by update: it keeps the modules and writes this version's rows (another version's rows differ)
  const lines = [filled(W.head, { root: view.root }), ...config, ...view.modules.map(moduleLine), ...columns(packageRows), ...notWired,
    ...manifests,
    ...(view.problems.some((p) => p.from === 'modules') ? [W.noModuleRow] : []),
    ...(view.missing.length ? [W.wireAgain] : []), ...(view.protectedPaths ? [view.protectedPaths] : []), ...promised, W.machine,
    ...view.probes.map((p) => `  ${p.name.padEnd(16)}${SAID[p.state] || p.state}  ${p.says}`),
    ...toDo, closing];
  return `${lines.join('\n')}\n`;
}

async function doctor(args, io) {
  const view = await viewOf(io);
  const hint = await hintOf(io, args.flags);
  return { out: view, n: { problems: view.problems.length, probesFailed: view.probes.filter((p) => p.state === 'failed').length },
    codes: view.ok ? {} : { 'doctor-problem': 1 }, text: `${textOf(view, io.catalog.plain)}${hint ? `${hint}\n` : ''}`,
    exit: view.ok ? 0 : 1 };
}

/** What this install says of itself in closed words, for a text a person sends by hand (any package may ask it: io.installFacts): the
 * version, platform and Node major, then doctor's verdict and codes, with each package and probe that is not measured by its name and
 * state. Never doctor's sentences, its paths or its findings. */
async function installFacts(io) {
  const { out: view, codes } = await doctor({}, io);
  const unwired = [...view.packages.filter((p) => p.wired === false).map((p) => [p.name, 'not-wired']), ...(view.host.wired ? [] : [['host', 'not-wired']])];
  const rows = [...view.packages.map((p) => [p.name, p.health]), ...view.probes.map((p) => [p.name, p.state])].filter(([, state]) => state !== 'measured');
  const said = [...unwired, ...rows].map(([name, state]) => `${name}=${state}`).join(', ');
  const slots = { version: io.version, platform: io.machine.platform, node: io.machine.node.split('.')[0],
    verdict: view.ok ? 'ok' : Object.keys(codes).join(' '), said: said ? `; ${said}` : '' };
  return W.facts.map((fact) => filled(fact, slots));
}

async function debugDoctor(_args, io) {
  const view = await viewOf(io);
  return { out: view, n: { problems: view.problems.length }, codes: {}, text: `${JSON.stringify(view, null, 2)}\n` };
}

async function status(_args, io) {
  const view = await viewOf(io, { probing: false });
  const installed = view.packages.filter((p) => ['installed', 'off', 'not-set-up'].includes(p.state)).map((p) => p.name);
  const absent = io.packages.names.filter((name) => !io.packages.has(name)); // a module with no package here among them
  const head = filled(W.status, { root: io.root, wired: view.missing.length ? W.statusWiredNo : 'yes', installed: installed.map(io.catalog.plain).join(', '),
    absent: absent.map(io.catalog.plain).join(', ') || 'none' });
  // it judges nothing, and still says what a package itself says is wrong (a plan file that does not read): no look is silent on it
  const said = view.problems.filter((p) => p.from === 'package').map((p) => filled(W.statusSays, { name: io.catalog.plain(p.name), says: p.says }));
  const text = `${head}${view.modules.map((m) => `${moduleLine(m)}\n`).join('')}${said.join('')}`;
  return { out: { root: io.root, wired: !view.missing.length, modules: view.modules, installed, absent },
    n: { installed: installed.length }, codes: {}, text };
}

module.exports = { doctor, debugDoctor, status, installFacts };
