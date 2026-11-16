// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The cli contract suite's worlds (black box). A world is a directory laid out like an installed product: <w>/node_modules/@atlasbound/*
// (copies, so a fake package resolves as a sibling and nothing reaches the repository's own packages; DecisionBook among them). A
// repo is a temp git repository, the person's. Everything runs through the bin in a clean environment: an inherited GIT_DIR (a commit
// hook) or a flag of the host must never reach a world.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { testing: { trash, countSpawn } } = require('@atlasbound/kit');

const made = [];
const shared = new Map();
process.on('exit', () => made.forEach(trash));
const tmp = (prefix) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  made.push(dir);
  return dir;
};
const packageDir = (name) => path.dirname(require.resolve(`@atlasbound/${name}`));
const REPO = path.dirname(path.dirname(packageDir('kit')));
const SETTINGS = path.join('.claude', 'settings.local.json');
// approvals follow the password database, so a world's bin answers it with the world's home, or a verb that keeps a person's yes would write into the real one.
const PASSWD = `--require ${path.join(packageDir('kit'), 'testing', 'passwd-preload.cjs')}`;
/** one empty home per process. The moment something has written to it, the next call gets a new one, so no test sees another's home. */
let home = null;
const emptyHome = () => {
  if (!home || fs.readdirSync(home).length > 0) home = tmp('cli-home-');
  return home;
};
// the env a world-env.cjs beside this file adds to every world, where there is one
const WORLD_ENV = fs.existsSync(path.join(__dirname, 'world-env.cjs')) ? require('./world-env.cjs') : {};
const cleanEnv = (extra = {}) => ({ PATH: process.env.PATH, ...(extra.HOME ? {} : { HOME: emptyHome() }), NODE_OPTIONS: PASSWD,
  ...WORLD_ENV, ...extra });
/** A person at a plain terminal answering the one question a verb puts (tty-preload: the bin sees a terminal on the piped stdin): yes to
 * a yes question; run() types the phrase instead where the verb is a grave act that asks for one. */
const YES = 'yes\n';
const typedYes = (env = {}) => ({ env: { ...env, NODE_OPTIONS: `${PASSWD} --require ${path.join(__dirname, 'tty-preload.cjs')}` }, input: YES });
const SKIP = new Set(['node_modules', 'test', 'contract']);

function copyPackage(from, to) {
  fs.cpSync(from, to, { recursive: true, filter: (src) => !SKIP.has(path.basename(src)) });
}

/** A linked file has one mode: with no write bit, a test that writes through a link fails at that line (EACCES) instead of reaching every world of the
 * process. */
function readOnlyTree(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) readOnlyTree(at);
    else fs.chmodSync(at, fs.statSync(at).mode & ~0o222);
  });
}

/** shipped bytes are copied once per process, from the repository, and hard-linked into each world: never a link to the repository's own file. */
let shippedRoot = null;
function shippedCopy(key, copy) {
  shippedRoot = shippedRoot || tmp('cli-shipped-');
  const to = path.join(shippedRoot, key);
  if (!fs.existsSync(to)) {
    copy(to);
    readOnlyTree(to);
  }
  return to;
}

function linkTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from, { withFileTypes: true }).forEach((entry) => {
    const [src, dest] = [path.join(from, entry.name), path.join(to, entry.name)];
    if (entry.isDirectory()) linkTree(src, dest);
    else fs.linkSync(src, dest);
  });
}

/** What a real package declares to the cli beside its wiring (its verbs, answers, free verbs, next steps, names): a fake of it keeps that face. */
function declaredFace(name) {
  const file = path.join(REPO, 'packages', name, 'package.json');
  if (!fs.existsSync(file)) return {};
  const WIRING = ['hooks', 'commands', 'mcp', 'sessionWrites'];
  return Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')).atlasbound || {}).filter(([key]) => !WIRING.includes(key)));
}

const manifestAt = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).atlasbound || {};
// the open package's own module data, read as the data file it is (a world's install holds the same file)
const OPEN_DATA = JSON.parse(fs.readFileSync(path.join(packageDir('cli'), 'contracts', 'modules.json'), 'utf8'));
const OPEN_NAMES = ['cli', ...OPEN_DATA.base, ...OPEN_DATA.modules.flatMap((m) => m.packages)];
/** The module rows the packages of `dir` bring in their manifests (`module`): a folder of packages, this tree's or a world's. */
const broughtRows = (dir) => fs.readdirSync(dir).filter((name) => fs.existsSync(path.join(dir, name, 'package.json')))
  .map((name) => manifestAt(path.join(dir, name)).module).filter(Boolean);

/** The module row a fake brings, as an add-on's package does: its own (`given`: the manifest's, or the real package's face) unless a
 * package of the world already brings that module; none for a package the open data or a row in the world names; else the row a
 * package of this tree brings for it, or a toy module of that one package. */
function broughtBy(dir, name, given) {
  const there = broughtRows(path.join(dir, 'node_modules', '@atlasbound'));
  if (given) return there.some((row) => row.name === given.name) ? null : given;
  if (OPEN_NAMES.includes(name) || there.some((row) => row.packages.includes(name))) return null;
  return broughtRows(path.join(REPO, 'packages')).find((row) => row.packages.includes(name))
    ?? { name, title: `the fake ${name}`, packages: [name], what: `what the fake ${name} does`, loses: `you lose the fake ${name}` };
}

/** A fake package: `hooks` / `commands` / `mcp` in its manifest over the real package's verbs and answers, `body` the source of its exports (vocabulary
 * added). It replaces what was there: writing through a link would reach every world. A fake no module names brings its own row (broughtBy). */
function writeFake(dir, name, { manifest = {}, body = '{}', files = {} }) {
  if ([...shared.values()].some((world) => world.dir === dir)) throw new Error(`writeFake ${name}: a shared world never changes, make this one with ` +
    `makeWorld({ own: true })`);
  const at = path.join(dir, 'node_modules', '@atlasbound', name);
  fs.rmSync(at, { recursive: true, force: true });
  const { module: given, ...face } = { ...declaredFace(name), ...manifest };
  const module = broughtBy(dir, name, given);
  fs.mkdirSync(at, { recursive: true });
  fs.writeFileSync(path.join(at, 'package.json'), JSON.stringify({ name: `@atlasbound/${name}`, version: '0.0.0', exports: { '.': './index.cjs' },
    atlasbound: { ...face, ...(module ? { module } : {}) } }));
  fs.writeFileSync(path.join(at, 'index.cjs'),
    `'use strict';\nconst fs = require('node:fs');\nconst mark = (t) => { if (process.env.MARK) fs.appendFileSync(process.env.MARK, t + '\\n'); ` +
      `};\nmodule.exports = { vocabulary: { steps: ['x'], isCode: () => true }, ...(${body}) };\n`);
  Object.entries(files).forEach(([key, text]) => {
    fs.mkdirSync(path.dirname(path.join(at, key)), { recursive: true });
    fs.writeFileSync(path.join(at, key), text);
  });
}

/** A fake telemetry whose hint stays silent, so a world about something else says no hint line. */
const QUIET = { telemetry: { manifest: {}, body: '{ hint: () => ({ line: null }) }' } };

/** The dependencies of a real package that are no package of the product. */
const thirdParty = (name) => Object.keys(JSON.parse(fs.readFileSync(path.join(packageDir(name), 'package.json'), 'utf8')).dependencies ?? {})
  .filter((dep) => !dep.startsWith('@atlasbound/'));

/** A real package and the packages of the product it imports by name (its manifest's dependencies), as an install lays them beside it. */
function withImports(name) {
  const { dependencies = {} } = JSON.parse(fs.readFileSync(path.join(packageDir(name), 'package.json'), 'utf8'));
  return [name, ...Object.keys(dependencies).filter((dep) => dep.startsWith('@atlasbound/')).map((dep) => dep.split('/')[1])];
}

/** Every world holds the open package's real cli, kit, DecisionBook and telemetry. `real`: other packages copied in as they are, with the
 * packages they import. `product`: a root manifest of that version,
 * as a tarball has. `at`: where the install lives. `without`: a package left out (a port test of fake packages leaves out the real
 * DecisionBook every install has). */
function buildWorld({ fakes = {}, name = 'cli-world-', real = [], product = null, at = null, without = [] }) {
  const dir = at || tmp(name);
  const laid = new Set(['cli', 'kit', 'decisionbook', 'telemetry', ...real.flatMap(withImports)]);
  for (const pkg of [...laid].filter((one) => !without.includes(one))) linkTree(shippedCopy(pkg,
    (to) => copyPackage(packageDir(pkg), to)), path.join(dir, 'node_modules', '@atlasbound', pkg));
  // a real package's own third-party dependency is linked, not copied per world
  for (const dep of new Set(real.flatMap(thirdParty))) fs.symlinkSync(path.dirname(require.resolve(`${dep}/package.json`)), path.join(dir, 'node_modules', dep));
  Object.entries(fakes).forEach(([pkg, spec]) => writeFake(dir, pkg, spec));
  if (product) fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'atlasbound', version: product }));
  return { dir, bin: path.join(dir, 'node_modules', '@atlasbound', 'cli', 'bin', 'atlasbound.cjs') };
}

/** the product writes nothing into its install, so one spec is one world per process. A test that changes its world asks for `own: true`. */
function makeWorld({ own = false, ...spec } = {}) {
  if (own || spec.at) return buildWorld(spec);
  const key = JSON.stringify(spec);
  if (!shared.has(key)) shared.set(key, buildWorld(spec));
  return shared.get(key);
}

function git(cwd, ...args) {
  const res = spawnSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=a', ...args], { cwd, env: cleanEnv(), encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`git ${args[0]}: ${res.stderr}`);
  return res.stdout;
}

function writeFiles(dir, files) {
  Object.entries(files).forEach(([key, text]) => {
    fs.mkdirSync(path.dirname(path.join(dir, key)), { recursive: true });
    fs.writeFileSync(path.join(dir, key), text);
  });
}
/** A `claude` for the front of PATH that leaves the file `started` in its folder when it is started: the handoff never starts it. */
function recordingClaude(prefix) {
  const dir = tmp(prefix);
  fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\necho started >> "${dir}/started"\n`, { mode: 0o755 });
  return dir;
}

/** `git init + add + commit` once per process; copying the result is fast. */
const templateRepo = (() => {
  let template = null;
  return () => {
    if (template) return template;
    template = tmp('cli-template-');
    git(template, 'init', '-q', '--template=');
    writeFiles(template, { 'lib/z.cjs': 'x\n', 'README.md': 'hi\n' });
    git(template, 'add', '.');
    git(template, 'commit', '-qm', 'first');
    return template;
  };
})();

/** The human step: a person names what the gate guards (DecisionBook's config), and with `danger` the paths among them that stay theirs
 * outside a READY plan. Nothing is protected before it. */
const protect = (repo, globs = ['lib/**'], danger = []) => writeFiles(repo, { '.decisionbook/config.json': JSON.stringify({ protect: globs,
  ...(danger.length ? { danger } : {}), answer: { answer: 'chosen', door: 'protect-command', at: '2026-11-04T00:00:00.000Z' } }) });

/** A customer repository with two tracked files; nothing is protected until `protect`; `files` join its one commit. */
function makeRepo(files = {}) {
  const dir = tmp('cli-repo-');
  fs.cpSync(templateRepo(), dir, { recursive: true });
  if (Object.keys(files).length === 0) return dir;
  writeFiles(dir, files);
  git(dir, 'add', '.');
  git(dir, 'commit', '--amend', '-qm', 'first');
  return dir;
}

/** A stuck child fails its own test (code null, the verb named in the assertion) instead of stalling the suite with no output. */
const STUCK_MS = 120000;

// per bin, the verbs only a person runs there (each row's words, then the flags it needs) and the grave ones with the phrase each is
// typed with, as that bin's own `debug who` lists them
const personRows = new Map();
function whoOf(bin) {
  if (!personRows.has(bin)) {
    countSpawn();
    // debug who lists the verbs of the modules on where it runs: a repository set up with every installed one, as these worlds test them
    const repo = makeRepo();
    countSpawn();
    spawnSync(process.execPath, [bin, ...chosenArgs(bin, ['setup'], false), '--target', repo], { env: cleanEnv(), encoding: 'utf8' });
    const res = spawnSync(process.execPath, [bin, 'debug', 'who', '--json', '--target', repo], { env: cleanEnv(), encoding: 'utf8' });
    // a file that is no bin (node-floor runs one module of it) answers nothing, so it has no verb only a person runs
    const { personOnly = [], grave = [] } = res.status === 0 && res.stdout.trim() !== '' ? JSON.parse(res.stdout) : {};
    personRows.set(bin, { rows: personOnly.map((row) => row.split(' ')), grave });
  }
  return personRows.get(bin);
}
function personsVerb(bin, args) {
  const fits = (row) => row.every((word, i) => (word.startsWith('--') ? args.includes(word) : args[i] === word));
  return whoOf(bin).rows.some(fits);
}
/** What a person's run types: the test's own input; where it gave none, or typedYes's plain yes, and the verb is a grave act, the
 * phrase that act asks for (its row's words for it, the words sent after the verb's where it names them, the flags it names sent). */
function typedInput(bin, args, { input, ai }) {
  const row = !ai && (input === undefined || input === YES) && personsVerb(bin, args)
    ? whoOf(bin).grave.find(({ words }) => words.every((word, i) => args[i] === word)) : null;
  if (!row) return input;
  const at = args.indexOf('--target');
  const sent = row.sent ? args.filter((word, i) => i >= row.words.length && !word.startsWith('--') && (at === -1 || i !== at + 1)) : [];
  return `${[row.phrase, ...sent, ...row.flags.filter((flag) => args.includes(flag)).map((flag) => flag.slice(2))].join(' ')}\n`;
}
/** Who a test's run stands for. A verb only a person may run is sent as the person sends it, from their terminal (tty-preload), the one
 * caller the product lets through; `ai: true` sends it as an AI's shell does, for the tests of the refusal. Every other verb runs as
 * before: no terminal, unless the test's own env brings one. */
const callerEnv = (bin, args, { env, ai }) => cleanEnv(!ai && personsVerb(bin, args) ? typedYes(env).env : env);

// A hook call that carries the person's words is heard only from the AI host (the port asks who holds its output's other end), so
// a test sends one through the stand-in host; `ai: true` sends it as an AI's shell would, for the tests of the refusal.
const HOST = path.join(__dirname, 'claude', 'host.cjs');
const PERSONS_HOOK = /hook (UserPromptSubmit|Stop)\b/; // the events only the host is heard on (contracts/shapes EVENTS `person`)
const viaHost = (program, args, forged) => !forged && PERSONS_HOOK.test([program, ...args].join(' '));
const asHost = (program, args, forged) => (viaHost(program, args, forged) ? [process.execPath, [HOST, program, ...args]] : [program, args]);
/** The env of such a run: the stand-in itself runs with no node option (a test's preload is the call's, not the host's). */
const hostEnv = (env, routed) => (routed ? { ...env, NODE_OPTIONS: '', HOST_CHILD_NODE_OPTIONS: env.NODE_OPTIONS ?? '' } : env);

// These worlds test every module they install, so a setup that names no module names each installed one with --with, as the product
// itself lists them (once per bin, like whoOf): a plain setup may leave a module off. What a plain setup wires is its own claim
// (modules.test.cjs), sent with `plain: true` as a person types it.
const CHOOSING = /^--(only|without|with)(=|$)/;
const installedRows = new Map();
function installedOf(bin) {
  if (!installedRows.has(bin)) {
    countSpawn();
    const res = spawnSync(process.execPath, [bin, 'modules', '--json', '--target', makeRepo()], { env: cleanEnv(), encoding: 'utf8' });
    const { modules = [] } = res.status === 0 && res.stdout.trim() !== '' ? JSON.parse(res.stdout) : {};
    installedRows.set(bin, modules.filter((m) => m.state !== 'not-installed').map((m) => m.name));
  }
  return installedRows.get(bin);
}
function chosenArgs(bin, args, plain) {
  if (plain || args[0] !== 'setup' || args.some((word) => CHOOSING.test(word))) return args;
  const there = installedOf(bin);
  return there.length ? [...args, '--with', there.join(',')] : args;
}

function run(bin, sent, { cwd, input, env, ai = false, plain = false } = {}) {
  countSpawn();
  const args = chosenArgs(bin, sent, plain);
  const [program, words] = asHost(process.execPath, [bin, ...args], ai);
  const res = spawnSync(program, words, { cwd: cwd || os.tmpdir(), input: typedInput(bin, args, { input, ai }),
    env: hostEnv(callerEnv(bin, args, { env, ai }), viaHost(process.execPath, [bin, ...args], ai)), encoding: 'utf8', timeout: STUCK_MS });
  return { code: res.status, out: res.stdout, err: res.stderr };
}

/** One run as a promise: the same process and answer as run(). */
function startedRun(bin, { args: sent, cwd, input, env, ai = false, plain = false }) {
  countSpawn();
  const args = chosenArgs(bin, sent, plain);
  return new Promise((resolve) => {
    const caller = hostEnv(callerEnv(bin, args, { env, ai }), viaHost(process.execPath, [bin, ...args], ai));
    const child = spawn(...asHost(process.execPath, [bin, ...args], ai), { cwd: cwd || os.tmpdir(), env: caller, timeout: STUCK_MS });
    const said = { out: '', err: '' };
    child.stdout.on('data', (chunk) => { said.out += chunk; });
    child.stderr.on('data', (chunk) => { said.err += chunk; });
    child.on('close', (code) => resolve({ code, ...said }));
    child.stdin.end(typedInput(bin, args, { input, ai }));
  });
}

/** many asks of the bin, `pool` at a time, each its own real process, the answers in the order asked. For a file whose every claim needs its own
 * start. */
async function runAll(bin, asks, { pool = 4 } = {}) {
  const answers = [];
  let next = 0;
  const worker = async () => {
    for (let at = next; at < asks.length; at = next) {
      next += 1;
      answers[at] = await startedRun(bin, asks[at]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(pool, asks.length) }, worker));
  return answers;
}

/** Every file under `dir` -> its bytes, .git excluded, the trace store optionally excluded. */
function snapshot(dir, { trace = true } = {}) {
  const out = {};
  const walk = (rel) => fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).forEach((e) => {
    const key = rel ? `${rel}/${e.name}` : e.name;
    if (key === '.git' || (!trace && key === '.atlasbound/trace')) return;
    if (e.isDirectory()) walk(key);
    else out[key] = fs.readFileSync(path.join(dir, key), 'utf8');
  });
  walk('');
  return out;
}

/** Every row of every trace file of a repository, read line by line here (no product code): what a debug view or a run is checked against. */
const traceRows = (repo) => fs.readdirSync(path.join(repo, '.atlasbound', 'trace')).flatMap((name) => fs.readFileSync(path.join(repo, '.atlasbound', 'trace',
  name), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)));

/** A hand-made trace row, and a trace file of them planted in a repository's store. */
const traceRow = (over) => ({ v: 1, seq: 1, at: '2099-01-01T00:00:00.000Z', in: null, out: null, ms: 1, ok: true, n: {}, codes: {}, ref: null, err: null,
  pkg: 'cli', step: 'cli.verb', run: 'cli-seeded', ...over });
function planted(repo, name, rows) {
  fs.mkdirSync(path.join(repo, '.atlasbound', 'trace'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.atlasbound', 'trace', `${name}.ndjson`), rows.map((r) => `${JSON.stringify(r)}\n`).join(''));
}

const readSettings = (repo) => JSON.parse(fs.readFileSync(path.join(repo, SETTINGS), 'utf8'));

/** Claude Code's own dispatch: a plain name list matches exactly, anything else is a regex; no matcher fires always. */
function fires(matcher, value) {
  if (!matcher) return true;
  return /^[A-Za-z0-9_|]+$/.test(matcher) ? matcher.split('|').includes(value) : new RegExp(matcher).test(value);
}

const commandsFor = (settings, event, value) => (settings.hooks[event] || []).filter((row) => fires(row.matcher,
  value)).flatMap((row) => row.hooks.map((h) => h.command));

/** Fire one command the way the host does: a shell string, the settings' env, the project dir, the payload on stdin. */
function fire(repo, command, payload, env = {}, { ai = false } = {}) {
  const settings = readSettings(repo);
  const res = spawnSync(...asHost('/bin/sh', ['-c', command], ai), { cwd: repo, input: JSON.stringify(payload), encoding: 'utf8', timeout: STUCK_MS,
    env: hostEnv(cleanEnv({ ...settings.env, CLAUDE_PROJECT_DIR: repo, ...env }), viaHost('/bin/sh', ['-c', command], ai)) });
  return { code: res.status, out: res.stdout, err: res.stderr };
}

/** The one port row setup wrote for an event and a matcher value, and a hook's reply as JSON ({} for silence). */
const portRow = (repo, event, value) => commandsFor(readSettings(repo), event, value).find((c) => c.includes(' hook '));
const replyJson = (res) => JSON.parse(res.out.trim() || '{}');

/** A hook reply's context and its decision. */
const hookContextOf = (res) => (replyJson(res).hookSpecificOutput || {}).additionalContext || '';
const hookDecisionOf = (res) => replyJson(res).hookSpecificOutput || {};
/** A repository with `files` committed, set up by `world`'s bin: { repo, out: what setup said }. */
function setupRepo(world, files = {}) {
  const repo = makeRepo(files);
  const res = run(world.bin, ['setup', '--target', repo]);
  if (res.code !== 0) throw new Error(`setup: ${res.err}`);
  return { repo, out: res.out };
}

const editOf = (repo, file) => ({ session_id: 's1', cwd: repo, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(repo,
  file), old_string: 'a', new_string: 'b' } });

const fileJson = (repo, key) => JSON.parse(fs.readFileSync(path.join(repo, key), 'utf8'));

module.exports = { fileJson, REPO, QUIET, SETTINGS, PASSWD, typedYes, writeFiles, recordingClaude, tmp, cleanEnv, makeWorld, writeFake,
  makeRepo, protect, git, run, runAll, snapshot, traceRows, traceRow, planted, readSettings, fires, commandsFor, portRow, replyJson, hookContextOf, hookDecisionOf, setupRepo,
    fire, editOf };
