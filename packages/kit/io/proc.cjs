// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE spawner: one child, a prompt on stdin, bounded in time and output, an env of exactly what it was given; a child's failure is data,
// never a rejection. The machine's process table is io/ps.cjs.
const { spawn } = require('node:child_process');
const os = require('node:os');
const { StringDecoder } = require('node:string_decoder');
const { realOf } = require('./fs.cjs');
const { windowsProgram } = require('../base/paths.cjs');
const { thrownCode } = require('../base/errors.cjs');

const DEFAULTS = Object.freeze({ timeoutMs: 100000, capBytes: 8 * 1024 * 1024 });
const GRACE_MS = 2000; // SIGTERM to SIGKILL, then SIGKILL to giving up on a child that never reports its exit
const CLOSE_WAIT_MS = 250; // exit to close: a grandchild may still hold the pipes
const POSIX = process.platform !== 'win32'; // POSIX: the child leads its own group; win32: the child alone
const NEVER_EXITED = Object.freeze({ code: null, signal: null, error: 'proc-kill-failed' });
const LIVE = new Set(); // the `stop` of every running child
let stopping = false;

// The answer is deliberately not read (ESRCH: gone; EPERM: nothing we may signal): whether the child ended is the exit event's word.
function signalGroup(pid, signal) {
  thrownCode(() => process.kill(POSIX ? -pid : pid, signal));
}

function within(promise, ms) {
  const late = Promise.withResolvers();
  const timer = setTimeout(late.resolve, ms);
  return Promise.race([promise, late.promise]).finally(() => clearTimeout(timer));
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
  failure = thrownCode(() => pipe.end(text));
  if (failure) pipe.destroy();
  return () => failure;
}

// A cause only asks; this one flow sends every signal, and the group is swept once, at the exit.
async function supervise(child, { stdin, timeoutMs, capBytes }) {
  const [exited, closed, asked, ended] = [0, 1, 2, 3].map(() => Promise.withResolvers());
  child.once('exit', (code, signal) => exited.resolve({ code, signal, error: null }));
  child.once('close', closed.resolve);
  let killedBy = null;
  const stop = Object.assign((cause) => {
    killedBy ||= cause;
    asked.resolve();
    return ended.promise;
  }, { pid: child.pid });
  LIVE.add(stop);
  const timer = setTimeout(stop, timeoutMs, 'timeout');
  const stdout = collect(child.stdout, capBytes, () => stop('cap'));
  const stderr = collect(child.stderr, capBytes, () => stop('cap'));
  const stdinError = feed(child.stdin, stdin);
  const faults = [];
  [child, child.stdout, child.stderr].forEach((source) => source.on('error', (err) => faults.push(err.code)));

  const first = await Promise.race([exited.promise, asked.promise]);
  clearTimeout(timer);
  const end = first || (await stopChild(child.pid, exited.promise));
  if (POSIX) signalGroup(child.pid, 'SIGKILL'); // win32 keeps no group, and an exited child's id may already be another process's
  await within(closed.promise, CLOSE_WAIT_MS);
  [child.stdin, child.stdout, child.stderr].forEach((stream) => stream.destroy()); // a holder that survived must not pin this process
  child.unref();
  LIVE.delete(stop);
  ended.resolve();
  return { code: end.code, signal: end.signal, stdout: stdout(), stderr: stderr(), killedBy, error: end.error || faults[0] || null,
    stdinError: stdinError() };
}

// Windows starts a bare program word from the child's own folder before its PATH, so there it is looked up on the child's PATH alone
const programFor = (cmd, env) => (POSIX ? cmd : windowsProgram(cmd, env, (file) => realOf(file) !== null));

async function run({ cmd, args = [], stdin = '', env, timeoutMs = DEFAULTS.timeoutMs, capBytes = DEFAULTS.capBytes, cwd } = {}) {
  const notStarted = (error, killedBy = null) => ({ code: null, signal: null, stdout: '', stderr: '', killedBy, error, stdinError: null });
  if (stopping) return notStarted(null, 'stop');
  const program = programFor(cmd, env);
  if (program === null) return notStarted('ENOENT');
  let child;
  // `||`: node reads a null env as process.env and a null cwd as this repository.
  const refused = thrownCode(() => {
    child = spawn(program, args, { env: env || {}, cwd: cwd || os.tmpdir(), detached: POSIX, windowsHide: true });
  });
  if (refused) return notStarted(refused);
  if (child.pid === undefined) return notStarted(await new Promise((resolve) => {
    child.once('error', (err) => resolve(err.code));
  }));
  return supervise(child, { stdin, timeoutMs, capBytes });
}

function startDetached({ cmd, args = [], env, cwd } = {}) {
  const program = programFor(cmd, env);
  if (program === null) return { pid: null, error: 'ENOENT' };
  let child;
  const refused = thrownCode(() => {
    child = spawn(program, args, { env: env || {}, cwd: cwd || os.tmpdir(), detached: true, stdio: 'ignore', windowsHide: true });
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

const alive = (target) => [null, 'EPERM'].includes(thrownCode(() => process.kill(target, 0))); // EPERM: there, and not ours to signal

module.exports = { run, startDetached, stopAll, killAllNow, alive, pid, DEFAULTS };
