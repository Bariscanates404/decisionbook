// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE argv port: the only process.argv reader and the only place a verb's exit code is set; a refusal is `atlasbound: <code>: <detail>`
// on stderr (with --json also `{"error": {code, message, next}}` on stdout), exit 1, or exit 2 with the usage line for a command typed
// wrong.
const { traced, errors: { fail, isFail }, paths, text: { secrets, lines: { filled } } } = require('@atlasbound/kit');
const { HELP_FLAGS, VERSION_FLAGS, DEBUG_SAYS, entryAt } = require('../contracts/verbs.cjs');
const { shortOf, WORDS: { adapters: W } } = require('../contracts/codes.cjs');
const { DEBUG_SCHEMA } = require('../contracts/shapes.cjs');
const { overview, everyCommand, groupHelp, wrap } = require('../core/help.cjs');
const { compose, catalog, productVersion, stopChildren, killChildrenNow, stopBound } = require('./compose.cjs');
const { hookPort, stdinText } = require('./hook.cjs');
const { verbRow, unknownVerb, withUsage, oddTopFlag, refusalSaid } = require('../core/refusal.cjs');
const { setup, uninstall } = require('../steps/setup.cjs');
const { doctor, status, debugDoctor } = require('../steps/doctor.cjs');
const { debugRuns } = require('../debug/trace.cjs');
const { debugShell } = require('../debug/shell.cjs');
const { debugWho } = require('../debug/who.cjs');
const { whoami } = require('../steps/whoami.cjs');
const { debugInject } = require('./inject.cjs');
const { leftovers, leftoversRemove } = require('../steps/leftovers.cjs');
const { draftGiven, dropDraft, draftKept } = require('../steps/drafts.cjs');
const { modulesChosen, choiceByPerson, modules, modulesSet, offLine } = require('../steps/modules.cjs');
const { isPersons, onlyThePerson, phraseOf, typedBy, typedOrRefused } = require('../steps/person.cjs');

const INTERRUPTS = Object.freeze({ SIGHUP: 129, SIGINT: 130, SIGTERM: 143 }); // 128 + the signal, what a shell reports
const UNWIND_MS = 3000; // from the last child's end to the run's own: a bound for a stalled machine
let composed = null; // the io of this process, once there is one: what an interrupt records through
let interrupted = false;
let afterAnswer = null; // telemetry's daily attempt, when this verb may make one: run once its answer is written

function parse(argv) {
  const words = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const [name, value] = argv[i].split(/=(.*)/s);
    if (!name.startsWith('--')) words.push(argv[i]);
    else if (value !== undefined) flags[name.slice(2)] = value;
    else if (catalog().valueFlags.includes(name)) flags[name.slice(2)] = argv[(i += 1)];
    else flags[name.slice(2)] = true;
  }
  return { words: catalog().tableWords(words), flags };
}

const LOCAL = { setup: ['setup', setup], update: ['update', setup], doctor: ['doctor', doctor], status: ['status', status], debugTrace: ['debug.trace', debugRuns],
  debugDoctor: ['debug.doctor', debugDoctor], debugShell: ['debug.shell', debugShell],
  modules: ['modules', modules], modulesSet: ['modules', modulesSet], debugInject: ['debug.inject', debugInject],
  debugWho: ['debug.who', debugWho], whoami: ['whoami', whoami], leftovers: ['leftovers', leftovers], leftoversRemove: ['leftovers', leftoversRemove] };

/** The repository help speaks of, opened only to look; null outside one, where no module is on or off. */
function lookedAt(flags) {
  try {
    return compose({ start: absolute(flags.target || process.cwd()), mode: 'look' });
  } catch (err) {
    if (isFail(err, 'not-a-repo') || isFail(err, 'root-unsafe') || isFail(err, 'target-missing')) return null;
    throw err;
  }
}

/** A command typed wrong (exit 2) leaves one coded row in the repository it was typed in, where a setup keeps a trace, so it is counted;
 * outside one, or where it cannot be read, nothing. */
function countRefused(err, flags) {
  try {
    const io = lookedAt(flags);
    if (io) io.trace.event(io.run, 'cli.verb', { code: err.code, msg: err.code });
  } catch (failed) {
    if (!isFail(failed)) throw failed;
  }
}

/** A line of the help made here (a module's off line, a debug task), within the help's width, its indent kept. */
const fitWidth = (text) => wrap(text, '    ', text.match(/^ */)[0]);

/** The help text of `asked` rows: one command or a group, every command (--all), or the overview. */
function helpText({ asked, all, rows, steps, slash, off }) {
  if (!asked.length && !all) return overview({ version: productVersion(), rows, steps, slash, off: off.length ? ['', ...off] : [] });
  return [asked.length ? groupHelp(rows, asked) : everyCommand(rows), ...off].join('\n');
}

/** The verbs of `words`, none of a module off or not set up here (`io`): that module's one line stands in their place. */
function helpOf(words, io, all = false) {
  const { route, under, verbs: every, next, slash } = catalog();
  const pkgs = [...new Set(every.map((r) => r.pkg).filter(Boolean))];
  const offs = new Map(pkgs.map((pkg) => [pkg, io && offLine(io, pkg)]).filter(([, off]) => off));
  const here = (rows) => rows.filter((r) => !offs.has(r.pkg));
  const asked = words.filter((w, i) => !HELP_FLAGS.includes(w) && !(i === 0 && w === 'help'));
  const head = route(asked);
  const listed = under(asked);
  const found = listed.length ? listed : head && under(head.words).length === 1 && [head];
  if (!found) throw unknownVerb(catalog(), asked);
  const rows = here(found);
  const off = [...new Set(found.filter((r) => offs.has(r.pkg)).map((r) => `  ${offs.get(r.pkg)}`))].map(fitWidth);
  const steps = next.filter((s) => rows.some((r) => r.words.join(' ') === s.verb));
  const verbs = `${helpText({ asked, all, rows, steps, slash: slash.filter((c) => !offs.has(c.pkg)), off })}\n`;
  if (asked.join(' ') !== 'debug') return { out: rows, text: verbs };
  const tasks = here(every).flatMap((row) => row.tasks ?? []);
  const lines = tasks.flatMap(({ question, run, read }) => [`  ${question}`, `    atlasbound ${run} --json: ${read.join(', ')}`]);
  const text = `${verbs}\n${W.tasks}\n${[...lines, '', ...DEBUG_SAYS].map(fitWidth).join('\n')}\n`;
  return { out: { schema: DEBUG_SCHEMA, says: DEBUG_SAYS, tasks, verbs: rows }, text };
}

const asksHelp = (argv) => argv.some((arg) => HELP_FLAGS.includes(arg.split('=')[0]));

function questionOf(argv, { words, flags }) {
  if (argv.some((arg) => VERSION_FLAGS.includes(arg)) || (words.join(' ') === 'version' && !asksHelp(argv))) {
    const version = productVersion();
    return { out: { version }, text: `${version}\n` };
  }
  const { route, under } = catalog();
  const odd = oddTopFlag(catalog(), words, flags);
  if (odd) throw unknownVerb(catalog(), [odd]);
  const asks = !words.length || words[0] === 'help' || asksHelp(argv) || (!route(words) && under(words).length);
  return asks ? helpOf(words, lookedAt(flags), Boolean(flags.all)) : null;
}

const absolute = (dir) => paths.resolveFrom(process.cwd(), dir);

/** What a row that asks is handed: the typed-phrase question of its grave act (`ask`), or null where no one can be asked. */
const handedAsk = (row, args, ask) => (row.asks ? { ...args, ask } : args);

/** A package's verb, called; the draft it was handed goes once its function ran whole (steps/drafts), never where none ran. */
async function callPackage(io, row, args, { ask, draft }) {
  const off = offLine(io, row.pkg); // every verb of a module that is off here, the acting ones too: nothing is read or written
  if (off) return { out: { off: row.pkg }, code: 'verb-module-off', text: `atlasbound ${row.words.join(' ')}: ${off}\n` };
  const entry = io.packages.load(row.pkg);
  const fn = entryAt(entry, row.call || '');
  if (!row.call && !args.rest.length) return helpOf(row.words, io); // a bare group: its package is there, so its verbs are the answer
  if (typeof fn !== 'function') throw fail('verb-unknown', args.words.join(' '));
  const said = await fn(io.packages.ioFor(row.pkg), handedAsk(row, args, ask));
  dropDraft(io, draft, said);
  return row.render ? { out: said, text: `${entryAt(entry, row.render)(said)}\n` } : said;
}

/** The traced step of a verb; a config that does not read refuses inside it, so the refusal is a coded record, unless the row runs
 * degraded. A package's verb counts the characters its caller sent (`inChars`) and the ones it prints back (`outChars`). */
function verbOf(io, row, args, { ask, inChars, draft }) {
  const verb = async () => {
    const said = (await callPackage(io, row, args, { ask, draft })) ?? null;
    return { out: said, n: { inChars, outChars: render(said || {}, args.flags).length }, codes: said?.code ? { [said.code]: 1 } : {} };
  };
  const [step, fn] = row.pkg ? ['cli.verb', verb] : LOCAL[row.run];
  return [step, io.configRefused && !row.degrades ? () => {
    throw io.configRefused;
  } : fn];
}

/** Before the traced step: a refused root or module choice must not receive even a trace file, and a wiring that moves the choice
 * stored here is the person's (steps/modules choiceByPerson), as the rows of `modules on` and `modules off` say of theirs. */
async function wiringArgs(io, row, args, argv) {
  if (!row.wires) return args;
  io.host.refusal();
  const on = modulesChosen(io, args);
  if (!isPersons(row, args.flags)) await choiceByPerson(io, row.words.join(' '), on, argv);
  return { ...args, on };
}

/** The person's part of a verb, before any code of its package. Sent with what makes it theirs (`by`, narrowed by `when`), only they
 * run it. A grave act is asked only as its typed phrase, of a person at a terminal no program of kit's list can type into: here,
 * unless its row asks (its step says what it takes, then asks), and each asking refuses a wrapped terminal there and then, so the
 * question a step puts is no way round either. No terminal: no one to ask. -> that question, or null. */
async function personsPart(io, row, args, argv) {
  const what = row.words.join(' ');
  if (isPersons(row, args.flags)) onlyThePerson(io, what, argv, Boolean(row.phrase));
  if (!row.phrase || !io.terminal.on) return null;
  const typed = typedBy(io, phraseOf(row, args));
  const ask = async (info) => {
    onlyThePerson(io, what, argv, true);
    return typed(info);
  };
  if (!row.asks) await typedOrRefused(ask);
  return ask;
}

/** compose's one mode word for a row: the host's project directory names the repository unless --target does. */
function modeOf(row, targeted) {
  const host = row.host && !targeted;
  if (row.reads) return host ? 'host-read' : 'read';
  if (host) return 'host';
  if (row.cleans) return 'clean';
  return (row.wires && 'wire') || (row.looks ? 'look' : 'work');
}

// a verb's words; its JSON word not given, the JSON is the draft --file names (steps/drafts), else what standard input holds; a terminal
// is never read
async function restOf(row, rest, draft) {
  const text = draft ? draft.text : row.stdin === rest.length && (await stdinText()).trim();
  return text ? [...rest, text] : rest;
}

async function main(argv) {
  const parsed = parse(argv);
  const answered = questionOf(argv, parsed);
  if (answered) return answered;
  const row = verbRow(catalog(), parsed);
  return verbRun(argv, parsed, row).catch((err) => {
    throw withUsage(err, row);
  });
}

/** Telemetry's attempt after a verb's answer (its answer `due`): never for a hook (the hook port does not come here), a server or a read,
 * telemetry's own verbs, uninstall, or a process its starter bounded. */
const dueAfter = (io, row) => (row.host || row.reads || row.looks || row.pkg === 'telemetry' || stopBound() ? null
  : () => io.answer('due', {}));

async function verbRun(argv, parsed, row) {
  const io = compose({ start: absolute(parsed.flags.target || process.cwd()), mode: modeOf(row, Boolean(parsed.flags.target)) });
  composed = io;
  const words = parsed.words.slice(row.words.length);
  const draft = draftGiven(io, row, { flags: parsed.flags, rest: words }, process.cwd());
  const args = { ...parsed, rest: await restOf(row, words, draft) };
  const chosen = await wiringArgs(io, row, args, argv); // a refused module choice first: it writes nothing, not even a trace
  const ask = await personsPart(io, row, args, argv);
  if (row.run === 'uninstall') return uninstall({ ...args, ask }, io); // it records first, no trace after: its last act removes the store
  const stdin = args.rest.slice(parsed.words.length - row.words.length); // the JSON word standard input held, when it did
  const verb = verbOf(io, row, chosen, { ask, inChars: [...argv, ...stdin].join(' ').length, draft });
  const ref = { verb: row.words.join(' '), modules: chosen.on, ...(io.session ? { session: io.session } : {}) };
  const res = await traced(io, verb[0], verb[1])(chosen, { run: io.run, ref }).catch((err) => {
    throw draftKept(err, draft);
  });
  afterAnswer = dueAfter(io, row);
  return row.pkg ? res.out || {} : res;
}

/** A verb that answered nothing prints nothing: a server's verb hands stdout to its protocol, where one more line is an error. */
function render(res, flags) {
  if (res.out === undefined && !res.text) return '';
  const scrubbed = (_, value) => (typeof value === 'string' ? secrets.scrub(value) : value);
  return flags.json || !res.text ? `${JSON.stringify(res.out ?? null, scrubbed)}\n` : secrets.scrub(res.text);
}
const saidRefusal = (err) => refusalSaid(err, (code) => Boolean(composed && composed.trace.knows(code)));

/** Flush, then leave, so a hung handler's timer or handle cannot hold the process open; once a signal came, the interrupt owns the exit.
 * Telemetry's attempt runs between the two: it never changes the answer or the exit code (its own failure is one trace row). */
const leave = (text, code) => process.stdout.write(text, () => Promise.resolve(afterAnswer?.())
  .catch((err) => composed.trace.event(composed.run, 'cli.verb', { code: 'unexpected-error', msg: `telemetry due: ${err.name}` }))
  .finally(() => process.exit(code)));
const finish = (text, code) => (interrupted ? process.stdout.write(text) : leave(text, code));

async function stopFor(signal, work) {
  const stopped = await stopChildren();
  process.stderr.write(`${filled(W.interrupted, { signal, stopped, why: shortOf('run-interrupted') })}\n`);
  if (composed) composed.trace.event(composed.run, 'cli.verb', { code: 'run-interrupted', msg: `${signal}, ${stopped} running stopped` });
  if (stopped) await Promise.race([work(), new Promise((resolve) => {
    setTimeout(resolve, UNWIND_MS);
  })]);
}

function watchInterrupts(work) {
  Object.entries(INTERRUPTS).forEach(([signal, code]) => process.on(signal, () => {
    if (interrupted) return;
    interrupted = true;
    afterAnswer = null; // an interrupted process makes no attempt
    stopFor(signal, work).catch((err) => process.stderr.write(saidRefusal(err).line)).then(() => leave('', code));
  }));
}

/** a child its starter bounded says in its starter's row how it ended (the root's `childEnded`): null = its verb ran whole. */
const childEnded = (code) => {
  if (composed) composed.childEnded(code);
};

/** a child its starter bounded (a person's own run has no bound) ends itself there at once, so its verb runs no further. */
function hardStop(words, ms = stopBound()) {
  if (ms) setTimeout(() => {
    const msg = `${words.join(' ')} past ${ms} ms`;
    const killed = killChildrenNow();
    if (composed) composed.trace.event(composed.run, 'cli.verb', { code: 'child-hard-stop', msg });
    childEnded('child-hard-stop');
    process.stderr.write(`${filled(W.hardStopped, { msg, killed, why: shortOf('child-hard-stop') })}\n`);
    process.exit(1);
  }, ms).unref();
}

function start() {
  const argv = process.argv.slice(2);
  const { words, flags } = parse(argv);
  let work = null;
  watchInterrupts(() => work);
  hardStop(words);
  const isHook = words[0] === 'hook' && !asksHelp(argv) && !argv.some((arg) => VERSION_FLAGS.includes(arg));
  if (isHook) work = hookPort(words[1]).then((text) => stopChildren().then(() => finish(text, 0)));
  else work = main(argv).then((res) => {
    childEnded(null);
    finish(render(res, flags), res.exit || 0);
  }, (err) => {
    childEnded(isFail(err) ? err.code : 'unexpected-error');
    const said = saidRefusal(err);
    if (said.exit === 2 && !composed) countRefused(err, flags);
    process.stderr.write(said.line);
    finish(flags.json ? said.json : '', said.exit);
  });
  return work;
}

module.exports = { start };
