// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE composition root: the only place that creates io, once per process, and hands each package what it asked for. It reads no package
// by name: discover the packages (adapters/packages), read their manifests, build the shared io, give each package the answers its manifest
// needs from the package whose manifest provides them. How a verb opens the repository is ONE mode word (contracts/shapes MODES).
const { io: kitIo, errors: { fail, isFail }, paths: { parentDir, nameOf, upward, childEnv }, trace: { TRACE_DIR },
  child: { handedStop, selfCheck }, person: { createActor }, text: { lines: { filled } } } = require('@atlasbound/kit');
const { isCode, WORDS: { adapters: W } } = require('../contracts/codes.cjs');
const validate = require('../contracts/validate.cjs');
const { CONFIG, CONFIG_FILE, STEPS, MODES } = require('../contracts/shapes.cjs');
const { PRODUCT } = require('../contracts/verbs.cjs');
const { createFinder } = require('./packages.cjs');
const { createHost, refuseStrayRoot, projectEnv, sessionEnv, pidEnv, sessionWrites: HOST_OPEN } = require('./host.cjs');
const { createTerminal } = require('./terminal.cjs');
const { ceilingOf } = require('../core/windows.cjs');
const { floor } = require('./node-floor.cjs');
const { installFacts } = require('../steps/doctor.cjs');

const CLI_DIR = parentDir(__dirname);
const SELF = Object.freeze({ node: process.execPath, bin: `${CLI_DIR}/bin/atlasbound.cjs` }); // this install: the one place that spells either
let FINDER = null;
/** The packages of this install, found once per process: argv routes with its table before any repository is opened. */
const finder = () => {
  FINDER ??= createFinder(kitIo.createFs);
  return FINDER;
};

/** The nearest folder above the cli whose manifest's own `name` is the product, and that manifest's text; a package.json on the way
 * that does not parse is no product root, so a stranger's broken file cannot stop a verb. */
function productRoot() {
  for (const dir of upward(CLI_DIR)) {
    const text = kitIo.createFs(dir).readText('package.json');
    if (text !== null && Object(validate.jsonOrNull(text)).name === PRODUCT) return { dir, text };
  }
  return null;
}

function productVersion() {
  const root = productRoot();
  return root ? validate.json(root.text, 'manifest-invalid').version : 'unknown';
}

/** The release folders of this install, each with the MANIFEST.json its build wrote: the product's own, then each add-on found. */
function releasesOf() {
  const root = productRoot();
  return [...(root ? [{ name: PRODUCT, dir: root.dir }] : []), ...finder().addOns()];
}

/** The nearest directory holding `.git` (a file in a worktree), or null; git's own GIT_CEILING_DIRECTORIES stops the walk as it stops
 * git. */
function gitRootOf(start) {
  const ceiling = ceilingOf(kitIo.env.get('GIT_CEILING_DIRECTORIES'), process.platform);
  for (const dir of upward(start)) {
    if ((kitIo.createFs(parentDir(dir)).list(nameOf(dir)) || []).includes('.git')) return dir;
    if (ceiling(parentDir(dir))) return null;
  }
  return null;
}

/** A hook reads only its keys of the file and those a package's hooks read (`keys`), so a typo elsewhere cannot close a gate; doctor and
 * every verb still refuse that typo. */
function forHook(read, keys) {
  const { schema = CONFIG.schema, hookTraceDays: days } = validate.shape('HookConfig', read);
  const theirs = Object.fromEntries(keys.filter((key) => Object.hasOwn(read, key)).map((key) => [key, read[key]]));
  return { ...theirs, schema, hookTraceDays: Number.isInteger(days) && days >= 1 ? days : CONFIG.hookTraceDays };
}

function configOf(fs, hook) {
  const text = fs.readText(CONFIG_FILE);
  const read = text === null ? {} : validate.json(text, 'config-invalid');
  const value = hook ? forHook(read, finder().catalog.hookConfig) : validate.shape('Config', read);
  if (!hook && value.hookTraceDays === 0) throw fail('config-invalid', W.traceDays);
  if (value.schema && value.schema !== CONFIG.schema) throw fail('schema-major', `config ${value.schema}`);
  return Object.freeze({ ...CONFIG, ...value });
}

/** A config that does not read leaves the shipped one in force and its refusal on io: doctor names it, the hook asks, every other verb
 * refuses (argv). A refused config prunes nothing. */
function configRead(fs, hook) {
  try {
    const config = configOf(fs, hook);
    return { config, configRefused: null, keepDays: hook ? config.hookTraceDays : undefined };
  } catch (err) {
    if (!isFail(err)) throw err;
    return { config: Object.freeze({ ...CONFIG }), configRefused: err, keepDays: undefined };
  }
}

function versionNowOf(trace, run) {
  return () => {
    try {
      return productVersion();
    } catch (err) {
      trace.event(run, 'packages', { code: err.code, msg: W.manifest });
      return 'unknown';
    }
  };
}

/** A folder that is not there is said as that, not as a folder outside git. */
const existingFolder = (dir) => {
  if (kitIo.createFs(parentDir(dir)).list(nameOf(dir)) === null) throw fail('target-missing', dir);
  return dir;
};

function repositoryOf(start, hostStarted, swap) {
  const projectDir = hostStarted && !swap ? kitIo.env.get(projectEnv) : null;
  const found = gitRootOf(projectDir || existingFolder(start));
  if (!found) throw fail('not-a-repo', projectDir || start);
  // as the disk names it, once: a hook and a verb through two spellings key one home store
  const root = kitIo.env.realOf(found) ?? found;
  // a replay stands for the host's start
  const boundFrom = projectDir || swap ? filled(W.boundProject, { env: projectEnv }) : W.boundStart;
  return { root, boundFrom };
}

/** Looking, cleaning and diagnostic children append only to a local trace folder setup created. A verb that reads the trace keeps
 * its new records in this process. */
const recordsFsOf = (fs, quiet) => (!quiet ? fs
  : { ...fs, append: (...row) => (fs.list(TRACE_DIR) === null ? undefined : fs.append(...row)) });
const digitsOf = (text) => [...text].filter((char) => char >= '0' && char <= '9').join('');
/** Never HOME: env must not be able to point telemetry's consent at a forged record. The user's alone. */
const userHomeFs = () => (kitIo.env.userHome() ? kitIo.createFs(kitIo.env.userHome(), { private: true }) : null);
const selfOf = () => ({ hostPid: Number.parseInt(kitIo.env.get(pidEnv), 10) || null, writer: nameOf(kitIo.env.userHome() || '') || null,
  self: SELF });
const machineOf = () => Object.freeze({ node: process.versions.node, platform: process.platform, exec: SELF.node, bin: SELF.bin, floor,
  fsAt: kitIo.createFs, scratch: kitIo.scratch, releases: releasesOf });

/** `replay` (debug inject): a hook process on a copy, `start` its root whatever the env names, its home a scratch folder, no detached
 * child. */
function replayed(replay) {
  if (!replay) return null;
  // a replay is no hook call of a host: it hands no caller, so its prompts are heard on the copy
  const proc = Object.freeze({ ...kitIo.proc, startDetached: () => ({ error: W.noBackground }), callerOf: () => null });
  const env = Object.freeze({ ...kitIo.env, userHome: () => replay.home });
  return { home: kitIo.createFs(replay.home), session: replay.session, env, proc };
}

/** What kit's actor calls with each answer: one trace row per distinct answer of this process, who was found and why (the seat, the
 * time of a prompt row; for a person the programs above their terminal and the one that could type for them), never a prompt's words. */
function actorRows(trace, run) {
  const rows = new Set();
  return ({ who, why, seat, at, above, wrapped }) => {
    const person = { ...(above ? { above: above.join(' < ') } : {}), ...(wrapped ? { wrapped } : {}) };
    const ref = { who, why, ...(seat ? { seat } : {}), ...(at ? { at } : {}), ...person };
    if (rows.has(JSON.stringify(ref))) return;
    rows.add(JSON.stringify(ref));
    trace.record({ run, step: 'actor', ok: true, codes: { [`actor-${who}`]: 1 }, ref });
  };
}

/** The io every package receives besides its own trace and the answers it needs. `facts`: what the install says of itself in closed
 * words (doctor's verdict among them), for a text a person sends by hand. */
function everyonesIo({ opened, run, config, trace, found, actor, stdio, swap, facts }) {
  const { root, boundFrom, fs, start } = opened; // start: the folder the verb was typed in (a path a person types is read from there)
  const git = kitIo.createGit({ proc: kitIo.proc, root, env: childEnv(kitIo.env, ['PATH', 'HOME'], root) });
  // what a session's write tool may write in the product's store: the host data's files and each wired manifest's
  const sessionWrites = () => [...HOST_OPEN, ...found.declared().manifests.flatMap((manifest) => manifest.sessionWrites ?? [])];
  // a data file every package of this install may declare (the cli's own and each one's on disk), e.g. the telemetry words it may leave as
  const packageData = (rel) => [{ name: 'cli', text: kitIo.createFs(CLI_DIR).readText(rel) }, ...found.dataOf(rel)]
    .filter((r) => r.text !== null);
  const session = stdio.out.isTTY ? null : kitIo.env.get(sessionEnv); // a terminal's text is the person's: no AI session's memory cuts it
  return Object.freeze({ root, start, boundFrom, session, ...selfOf(), run, config, version: productVersion(),
    versionNow: versionNowOf(trace, run), fs, home: userHomeFs(), clock: kitIo.clock, git, env: kitIo.env, proc: kitIo.proc, ...swap,
    stdio, absent: found.absent, sessionWrites, actor, packageData, // actor(prompts): kit's one answer to "who is acting"
    hostEnv: [projectEnv, sessionEnv, pidEnv], // the host's variables a session's command never sets (the shell gate)
    installFacts: facts });
}

function compose({ start, mode = 'work', replay }) {
  const how = MODES[mode];
  if (!how) throw fail('args-invalid', `compose mode ${mode}`);
  const swap = replayed(replay);
  const { root, boundFrom } = repositoryOf(start, Boolean(how.hostRoot), swap);
  const fs = kitIo.createFs(root, { hold: how.reading ? TRACE_DIR : null });
  refuseStrayRoot({ fs, env: kitIo.env, root, cleaning: Boolean(how.cleaning) });
  const { config, configRefused, keepDays } = configRead(fs, Boolean(how.hook));
  const self = selfCheck(kitIo.env);
  const records = recordsFsOf(fs, how.looking || how.cleaning || self);
  const tracer = kitIo.createTrace({ fs: records, clock: kitIo.clock, keepDays, self });
  const run = `${how.hook ? 'hook' : 'cli'}-${digitsOf(kitIo.clock.now())}-${process.pid}`;
  const trace = tracer.forPackage('cli', { steps: STEPS, isCode });
  const { catalog } = finder();
  const host = createHost({ fs, proc: kitIo.proc, env: kitIo.env, root, self: SELF, fsAt: kitIo.createFs, modules: catalog.modules });
  const found = finder().packages({ chosen: host.chosen, trace, run });
  const stdio = { in: process.stdin, out: process.stdout, err: process.stderr };
  const actor = createActor({ env: kitIo.env, proc: kitIo.proc, input: stdio.in, said: actorRows(trace, run) });
  const terminal = createTerminal({ ...stdio, person: () => actor().who === 'terminal' });
  const facts = () => installFacts(whole); // asked while a verb runs, after `whole` below is made
  const shared = everyonesIo({ opened: { root, boundFrom, fs, start }, run, config, trace, found, actor, stdio, swap, facts });
  const loader = finder().loader(found, { shared, tracer });
  // a child its starter bounded (the one process handed a stop) says in its starter's row how it ended; null = its verb ran whole
  const childEnded = (code) => (handedStop(kitIo.env) ? loader.answer('childEnded', { pid: process.pid, code }) : null);
  const whole = Object.freeze({ ...shared, trace, host, terminal, machine: machineOf(),
    packages: Object.freeze({ ...found, ...loader, catalog }), catalog, answer: loader.answer, configRefused, childEnded });
  return whole;
}

// the verb table of this install; the hard stop a starter handed this process (null for a person's own run), and the stop that awaits
// nothing, for the bin's verb start
module.exports = { compose, catalog: () => finder().catalog, clock: kitIo.clock, productVersion, stopChildren: kitIo.proc.stopAll,
  killChildrenNow: kitIo.proc.killAllNow, stopBound: () => handedStop(kitIo.env) };
