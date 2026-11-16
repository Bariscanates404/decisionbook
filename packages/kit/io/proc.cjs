// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE spawner: one child, a prompt on stdin, bounded in time and output, an env of exactly what it was given; a child's failure is data,
// never a rejection.
const childProcess = require('node:child_process');
const { spawn } = childProcess;
const os = require('node:os');
const { StringDecoder } = require('node:string_decoder');

const DEFAULTS = Object.freeze({ timeoutMs: 100000, capBytes: 8 * 1024 * 1024 });
const GRACE_MS = 2000; // SIGTERM to SIGKILL, then SIGKILL to giving up on a child that never reports its exit
const CLOSE_WAIT_MS = 250; // exit to close: a grandchild may still hold the pipes
const POSIX = process.platform !== 'win32'; // POSIX: the child leads its own group; win32: the child alone
const NEVER_EXITED = Object.freeze({ code: null, signal: null, error: 'proc-kill-failed' });
const LIVE = new Set(); // the `stop` of every running child
let stopping = false;

function codeOf(call) {
  try {
    call();
    return null;
    // eslint-disable-next-line no-restricted-syntax -- not silent: the code IS the answer (signalGroup's caller has the exit event)
  } catch (err) {
    return err.code || 'unexpected-error';
  }
}

// The answer is deliberately not read (ESRCH: gone; EPERM: nothing we may signal): whether the child ended is the exit event's word.
function signalGroup(pid, signal) {
  codeOf(() => process.kill(POSIX ? -pid : pid, signal));
}

function within(promise, ms) {
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

async function stopChild(pid, exited) {
  signalGroup(pid, 'SIGTERM');
  const onTerm = await within(exited, GRACE_MS);
  if (onTerm) return onTerm;
  signalGroup(pid, 'SIGKILL');
  return (await within(exited, GRACE_MS)) || NEVER_EXITED;
}

function collect(stream, capBytes, onOver) {
  const chunks = [];
  let size = 0;
  stream.on('data', (chunk) => {
    if (size <= capBytes) chunks.push(chunk);
    size += chunk.length;
    if (size > capBytes) onOver();
  });
  return () => {
    const bytes = Buffer.concat(chunks);
    return size > capBytes ? new StringDecoder('utf8').write(bytes.subarray(0, capBytes)) : bytes.toString('utf8');
  };
}

function feed(pipe, text) {
  let failure = null;
  pipe.on('error', (err) => {
    failure ||= err.code;
  });
  failure = codeOf(() => pipe.end(text));
  if (failure) pipe.destroy();
  return () => failure;
}

// A cause only asks; this one flow sends every signal, and the group is swept once, at the exit.
async function supervise(child, { stdin, timeoutMs, capBytes }) {
  const exited = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal, error: null }));
  });
  const closed = new Promise((resolve) => {
    child.once('close', resolve);
  });
  let killedBy = null;
  let wake;
  const asked = new Promise((resolve) => {
    wake = resolve;
  });
  const ended = Promise.withResolvers();
  const stop = Object.assign((cause) => {
    killedBy ||= cause;
    wake();
    return ended.promise;
  }, { pid: child.pid });
  LIVE.add(stop);
  const timer = setTimeout(stop, timeoutMs, 'timeout');
  const stdout = collect(child.stdout, capBytes, () => stop('cap'));
  const stderr = collect(child.stderr, capBytes, () => stop('cap'));
  const stdinError = feed(child.stdin, stdin);
  const faults = [];
  [child, child.stdout, child.stderr].forEach((source) => source.on('error', (err) => faults.push(err.code)));

  const first = await Promise.race([exited, asked]);
  clearTimeout(timer);
  const end = first || (await stopChild(child.pid, exited));
  signalGroup(child.pid, 'SIGKILL');
  await within(closed, CLOSE_WAIT_MS);
  [child.stdin, child.stdout, child.stderr].forEach((stream) => stream.destroy()); // a holder that survived must not pin this process
  child.unref();
  LIVE.delete(stop);
  ended.resolve();
  return { code: end.code, signal: end.signal, stdout: stdout(), stderr: stderr(), killedBy, error: end.error || faults[0] || null,
    stdinError: stdinError() };
}

async function run({ cmd, args = [], stdin = '', env, timeoutMs = DEFAULTS.timeoutMs, capBytes = DEFAULTS.capBytes, cwd } = {}) {
  const notStarted = (error, killedBy = null) => ({ code: null, signal: null, stdout: '', stderr: '', killedBy, error, stdinError: null });
  if (stopping) return notStarted(null, 'stop');
  let child;
  // `||`: node reads a null env as process.env and a null cwd as this repository.
  const refused = codeOf(() => {
    child = spawn(cmd, args, { env: env || {}, cwd: cwd || os.tmpdir(), detached: POSIX, windowsHide: true });
  });
  if (refused) return notStarted(refused);
  if (child.pid === undefined) return notStarted(await new Promise((resolve) => {
    child.once('error', (err) => resolve(err.code));
  }));
  return supervise(child, { stdin, timeoutMs, capBytes });
}

function startDetached({ cmd, args = [], env, cwd } = {}) {
  let child;
  const refused = codeOf(() => {
    child = spawn(cmd, args, { env: env || {}, cwd: cwd || os.tmpdir(), detached: true, stdio: 'ignore', windowsHide: true });
  });
  if (refused) return { pid: null, error: refused };
  child.once('error', () => {}); // a later refusal reaches only the child's own trace; an 'error' with no listener would throw here
  child.unref();
  return { pid: child.pid ?? null, error: child.pid === undefined ? 'spawn-failed' : null };
}

// No child starts after this, so a call between two asks cannot outlive it. -> how many were stopped, once all have ended.
async function stopAll() {
  stopping = true;
  const running = [...LIVE];
  await Promise.all(running.map((stop) => stop('stop')));
  return running.length;
}

// for a process that ends this instant (a child past its hard stop): no child starts, every running group is killed now, nothing awaited.
function killAllNow() {
  stopping = true;
  LIVE.forEach((stop) => signalGroup(stop.pid, 'SIGKILL'));
  return LIVE.size;
}

const pid = () => process.pid;

function alive(target) {
  const code = codeOf(() => process.kill(target, 0));
  return code === null || code === 'EPERM';
}

// the machine's processes as `pid ppid state command line`, by the system's own `ps` (a fixed PATH: never the caller's, which a session
// could plant), or null where there is none (Windows, a `ps` without these columns) or it did not answer.
const PS = Object.freeze({ cmd: 'ps', args: ['-axo', 'pid=,ppid=,stat=,args='], path: '/bin:/usr/bin', waitMs: 3000 });
const LEADS = 's'; // in a process's state: it leads its terminal's session (what a terminal starts first)
function processList() {
  const listed = childProcess.spawnSync(PS.cmd, PS.args, { encoding: 'utf8', env: { PATH: PS.path }, timeout: PS.waitMs, maxBuffer: DEFAULTS.capBytes, windowsHide: true });
  return listed.status === 0 ? listed.stdout : null;
}

// Who holds the other end of this process's standard output, by the kernel's own word, and the command words of a process: read by
// the system's interpreter at a fixed path with this fixed program (never the caller's PATH or script), on the one platform it was
// measured on. The numbers are that platform's: the local-socket level (0) with its peer-pid option (2), and the kernel call (202,
// name 1.49.<pid>) that hands a process's arguments; standard output is handed on, nothing is written to it.
const PEER = Object.freeze({ platform: 'darwin', cmd: '/usr/bin/perl', path: '/bin:/usr/bin', waitMs: 3000, code: [
  'my $o = getsockopt(STDOUT, 0, 2); my $n = getpeername(STDOUT);',
  'my $mib = pack("i3", 1, 49, $ARGV[0]); my $buf = "\\0" x 65536; my $size = pack("Q", 65536); my @w = ();',
  'if (syscall(202, $mib, 3, $buf, $size, 0, 0) == 0) { my $len = unpack("Q", $size); my $argc = unpack("i", $buf);',
  '  my (undef, $tail) = split(/\\0+/, substr($buf, 4, $len - 4), 2); @w = (split(/\\0/, $tail // ""))[0 .. $argc - 1]; }',
  'print STDERR join("\\t", defined $o ? unpack("i", $o) : "-", defined $n && unpack("x2 Z*", $n) eq "" ? "pair" : "-",',
  '  map { s/[\\t\\n]/ /gr } grep { defined } @w[0, 1]);'].join('\n') });

/** Who called this process, as the kernel says -> { platform, parent: this process's parent, read: whether it could be read here
 * (another platform, no answer: false, which a reader must never take as "the host called"), peer: the pid at the other end of
 * standard output (null: it is no connected socket), pair: that socket is one end of a pair, bound to no path, words: the first
 * command words of the parent }. */
function callerOf() {
  const here = { platform: process.platform, parent: process.ppid };
  if (here.platform !== PEER.platform) return { ...here, read: false };
  const read = childProcess.spawnSync(PEER.cmd, ['-e', PEER.code, String(here.parent)], { stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8',
    env: { PATH: PEER.path }, timeout: PEER.waitMs, windowsHide: true });
  if (read.status !== 0 || typeof read.stderr !== 'string') return { ...here, read: false };
  const [peer, name, ...words] = read.stderr.split('\t');
  return { ...here, read: true, peer: /^\d+$/.test(peer) ? Number(peer) : null, pair: name === 'pair', words };
}

/** This process's ancestors, nearest first, up to the root, and who leads its terminal's session -> { chain: [[word, ...], ...] their
 * command words, leader: the place in `chain` of the nearest session leader, -1 where this process is one itself, null where none is
 * seen }; null where the walk cannot be done whole: no listing, a parent that is not in it, or more than `levels` ancestors. The
 * caller must never read null as "nobody above". */
function ancestry(levels, listing = processList()) {
  if (listing === null) return null;
  const rowOf = ([id, parent, state, ...words]) => [Number(id), { parent: Number(parent), leads: String(state).includes(LEADS), words }];
  const rows = new Map(listing.split('\n').map((line) => line.trim().split(/\s+/)).map(rowOf));
  const chain = [];
  for (let at = process.ppid; at > 1; at = rows.get(at).parent) {
    if (!rows.has(at) || chain.length === levels) return null;
    chain.push(rows.get(at));
  }
  const first = chain.findIndex((row) => row.leads);
  const above = first === -1 ? null : first;
  return { chain: chain.map((row) => row.words), leader: rows.get(process.pid)?.leads ? -1 : above };
}

module.exports = { run, startDetached, stopAll, killAllNow, alive, pid, ancestry, callerOf };
