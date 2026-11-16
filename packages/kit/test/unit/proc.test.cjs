// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// io/proc with REAL children (node -e scripts, never a model): no shell, stdin then EOF, env allowlist, timeout, output cap,
// UTF-8 decoded once at the end, a missing command resolves with its error instead of throwing.
const test = require('node:test');
const assert = require('node:assert/strict');
const nodeFs = require('node:fs');
const os = require('node:os');
const { io: { proc, clock }, codes } = require('@atlasbound/kit');

const node = (script, opts = {}) => proc.run({ cmd: process.execPath, args: ['-e', script, ...(opts.argv || [])], ...opts });

test('proc.run: argv reaches the child verbatim (no shell), the prompt arrives on stdin and stdin is closed', async () => {
  const script = "let s='';process.stdin.on('data',(c)=>{s+=c});process.stdin.on('end',()=>process.stdout.write(JSON.stringify({argv:process.argv.slice(1),s})))";
  const res = await node(script, { argv: ['$(echo hi);rm -rf x', '`id`'], stdin: 'PROMPT ☃' });
  assert.deepEqual([res.code, res.killedBy, res.error], [0, null, null]);
  assert.deepEqual(JSON.parse(res.stdout), { argv: ['$(echo hi);rm -rf x', '`id`'], s: 'PROMPT ☃' });
});

test('proc.run: the child env is exactly the allowlist it was given, never process.env', async () => {
  process.env.KIT_PARENT_SECRET = 'leak';
  const res = await node('process.stdout.write(JSON.stringify(Object.keys(process.env)))', { env: { ONLY: '1' } });
  delete process.env.KIT_PARENT_SECRET;
  const keys = JSON.parse(res.stdout).filter((k) => k !== '__CF_USER_TEXT_ENCODING'); // macOS adds this one to every process
  assert.deepEqual(keys, ['ONLY']);
});

test('proc.run: a child that never ends is killed at the timeout and reported as timeout', async () => {
  const res = await node('setInterval(() => {}, 1000)', { timeoutMs: 300 });
  assert.equal(res.killedBy, 'timeout');
  assert.notEqual(res.signal, null);
});

test('proc.run: a child over the output cap is killed and reported as cap, stdout kept within the cap', async () => {
  const res = await node("process.stdout.write('x'.repeat(200000)); setInterval(() => {}, 1000)", { capBytes: 1000, timeoutMs: 5000 });
  assert.equal(res.killedBy, 'cap');
  assert.ok(res.stdout.length <= 1000, `stdout ${res.stdout.length} > cap`);
});

test('proc.run: a UTF-8 character split across two chunks is decoded whole (decode once at the end)', async () => {
  const script = 'process.stdout.write(Buffer.from([0xe2])); setTimeout(() => process.stdout.write(Buffer.from([0x98, 0x83])), 60)';
  const res = await node(script);
  assert.equal(res.stdout, '☃');
});

test('proc.run: a command that does not exist resolves with its error code, it does not throw', async () => {
  const res = await proc.run({ cmd: '/nonexistent/no-such-binary', args: [] });
  assert.deepEqual([res.code, res.killedBy, res.error], [null, null, 'ENOENT']);
});

// ---- everything below: one test per rule the cases above leave open.
const SPAWN_LIMIT = { timeout: 20000 };
const EPERM = () => { throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' }); };

/** Runs body with every GROUP kill seen, and answered by `answer` when given (a plain pid always reaches the real kill). */
async function withGroupKills(answer, body) {
  const real = process.kill;
  const seen = { signals: [], pid: null };
  process.kill = (pid, signal) => {
    if (pid >= 0) return real.call(process, pid, signal);
    seen.signals.push(signal);
    seen.pid = -pid;
    return answer ? answer() : real.call(process, pid, signal);
  };
  try {
    return await body(seen);
  } finally {
    process.kill = real;
  }
}

test('rule 9/10: a normal run resolves the one shape, stderr included', async () => {
  const res = await node("process.stdout.write('out');process.stderr.write('err')");
  assert.deepEqual(res, { code: 0, signal: null, stdout: 'out', stderr: 'err', killedBy: null, error: null, stdinError: null });
});

test('rule 9/10: a command that cannot start resolves the same shape, also for a missing cwd', async () => {
  const shape = { code: null, signal: null, stdout: '', stderr: '', killedBy: null, error: 'ENOENT', stdinError: null };
  assert.deepEqual(await proc.run({ cmd: '/nonexistent/no-proc' }), shape);
  assert.deepEqual(await proc.run({ cmd: process.execPath, cwd: '/nonexistent/no-proc' }), shape);
});

test('rule 10: what spawn refuses by throwing still resolves, it never rejects', async () => {
  assert.equal((await proc.run({ cmd: 'a\0b' })).error, 'ERR_INVALID_ARG_VALUE');
  assert.equal((await proc.run()).error, 'ERR_INVALID_ARG_TYPE');
});

test('rule 3: no env given, or null, is an empty env and never process.env', async () => {
  const keysOf = async (opts) => JSON.parse((await node('process.stdout.write(JSON.stringify(Object.keys(process.env)))', opts)).stdout).filter((k) => k !== '__CF_USER_TEXT_ENCODING');
  process.env.KIT_OTHER_SECRET = 'leak';
  try {
    assert.deepEqual(await keysOf({}), []);
    assert.deepEqual(await keysOf({ env: null }), []);
  } finally {
    delete process.env.KIT_OTHER_SECRET;
  }
});

test('rule 4: cwd defaults to the OS temp dir, also for null, and a given cwd is used', async () => {
  const cwdOf = async (opts) => nodeFs.realpathSync((await node('process.stdout.write(process.cwd())', opts)).stdout);
  const tmp = nodeFs.realpathSync(os.tmpdir());
  assert.equal(await cwdOf({}), tmp);
  assert.equal(await cwdOf({ cwd: null }), tmp);
  assert.equal(await cwdOf({ cwd: __dirname }), nodeFs.realpathSync(__dirname));
});

test('a child that stops reading records the broken pipe as a stdin error, and the run itself is untouched', async () => {
  const res = await node('process.exit(0)', { stdin: 'x'.repeat(8 * 1024 * 1024) });
  assert.deepEqual([res.code, res.error, res.stdinError], [0, null, 'EPIPE']);
});

test('rule 2 + 10: a stdin the pipe refuses is recorded, the pipe still closes and the run resolves', async () => {
  const res = await node("process.stdin.resume();process.stdin.on('end',()=>process.stdout.write('eof'))", { stdin: 42 });
  assert.deepEqual([res.code, res.stdout, res.stdinError], [0, 'eof', 'ERR_INVALID_ARG_TYPE']);
});

test('rule 5: a child that ignores SIGTERM gets SIGKILL after the 2 s grace', SPAWN_LIMIT, () => withGroupKills(null, async (seen) => {
  const t0 = performance.now();
  // The cap, not the clock, starts the kill: it can only fire once the handler is installed, whatever the load.
  const res = await node("process.on('SIGTERM',()=>{});process.stdout.write('x'.repeat(5000));setInterval(()=>{},1e3)", { capBytes: 1000 });
  assert.deepEqual([res.killedBy, res.signal, res.code], ['cap', 'SIGKILL', null]);
  assert.ok(performance.now() - t0 >= 1900);
  assert.deepEqual(seen.signals, ['SIGTERM', 'SIGKILL', 'SIGKILL']);
}));

test('rule 5: the cap counts each stream; exactly capBytes is not over it', async () => {
  const exact = await node("process.stdout.write('x'.repeat(1000))", { capBytes: 1000 });
  assert.deepEqual([exact.killedBy, exact.stdout.length], [null, 1000]);
  const both = await node("process.stdout.write('x'.repeat(800));process.stderr.write('y'.repeat(800))", { capBytes: 1000 });
  assert.deepEqual([both.killedBy, both.stdout.length, both.stderr.length], [null, 800, 800]);
});

test('rule 5/8: stderr past the cap is a cap too, and is kept within it', async () => {
  const res = await node("process.stderr.write('e'.repeat(5000));setInterval(()=>{},1e3)", { capBytes: 1000, timeoutMs: 5000 });
  assert.equal(res.killedBy, 'cap');
  assert.equal(res.stderr.length, 1000);
});

test('rule 5/8: output past the cap that is read after the child already exited still says cap', async () => {
  const res = await node("process.stdout.write('x'.repeat(200000))", { capBytes: 1000 });
  assert.deepEqual([res.killedBy, res.stdout.length], ['cap', 1000]);
});

test('rule 5: timeout first, then the cap: the first cause stays and no second SIGTERM goes out', SPAWN_LIMIT, () => withGroupKills(null, async (seen) => {
  const res = await node("process.on('SIGTERM',()=>process.stdout.write('x'.repeat(5000),()=>process.exit(0)));setInterval(()=>{},1e3)", { timeoutMs: 1500, capBytes: 1000 });
  assert.equal(res.killedBy, 'timeout');
  assert.ok(res.stdout.length <= 1000);
  assert.deepEqual(seen.signals, ['SIGTERM', 'SIGKILL']);
}));

test('rule 5: the cap first, then the clock runs out: the first cause stays', SPAWN_LIMIT, () => withGroupKills(EPERM, async () => {
  const res = await node("process.stdout.write('x'.repeat(5000));setTimeout(()=>{},2300)", { capBytes: 1000, timeoutMs: 2000 });
  assert.deepEqual([res.killedBy, res.code, res.error], ['cap', 0, null]);
}));

test('rule 6: a grandchild holding the pipes is killed by the sweep and the run resolves at once', SPAWN_LIMIT, async () => {
  const t0 = performance.now();
  const res = await proc.run({ cmd: 'sh', args: ['-c', 'sleep 30 & echo $!'], env: { PATH: process.env.PATH } });
  const ms = performance.now() - t0;
  assert.deepEqual([res.code, res.killedBy, res.error], [0, null, null]);
  assert.ok(ms < 2000, `took ${ms} ms`); // spec: about 0.5 s; the margin is for a loaded host, 30 s is what this tells apart
  const grandchild = Number(res.stdout);
  for (let i = 0; i < 40 && proc.alive(grandchild); i += 1) await clock.sleep(25);
  assert.equal(proc.alive(grandchild), false);
});

test('rule 6: a normal end sweeps the group exactly once, and an already-gone group (ESRCH) is success', () => withGroupKills(() => { throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' }); }, async (seen) => {
  const res = await node("process.stdout.write('ok')");
  assert.deepEqual([res.code, res.stdout, res.error], [0, 'ok', null]);
  assert.deepEqual(seen.signals, ['SIGKILL']);
}));

test('nothing signals the group after its leader was reaped, the kill timer included', SPAWN_LIMIT, () => withGroupKills(null, async (seen) => {
  const res = await node('setInterval(()=>{},1e3)', { timeoutMs: 200 });
  assert.equal(res.killedBy, 'timeout');
  assert.deepEqual(seen.signals, ['SIGTERM', 'SIGKILL']);
  await clock.sleep(2200);
  assert.deepEqual(seen.signals, ['SIGTERM', 'SIGKILL']);
}));

test('rule 7: a holder that left the group cannot keep the run open, and the pipes do not pin this process', SPAWN_LIMIT, async () => {
  const script = "const g=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1e3)'],{detached:true,stdio:['ignore','inherit','inherit']});process.stdout.write(String(g.pid));g.unref()";
  const res = await node(script);
  const holder = Number(res.stdout);
  assert.equal(res.code, 0);
  assert.equal(proc.alive(holder), true); // it really escaped the sweep, or this test proves nothing
  process.kill(holder, 'SIGKILL');
});

test('a refused sweep after a good run is no failure: the provider adapter would throw away a finished answer on `error`', () => withGroupKills(EPERM, async (seen) => {
  const res = await node("process.stdout.write('answer')");
  assert.deepEqual([res.code, res.stdout, res.killedBy, res.error], [0, 'answer', null, null]);
  assert.deepEqual(seen.signals, ['SIGKILL']);
}));

test('a refused kill from the output handler never throws; the run ends with the child', SPAWN_LIMIT, () => withGroupKills(EPERM, async (seen) => {
  const res = await node("process.stdout.write('x'.repeat(5000));setTimeout(()=>{},200)", { capBytes: 1000 });
  assert.deepEqual([res.killedBy, res.code, res.error, res.stdout.length], ['cap', 0, null, 1000]);
  assert.equal(seen.signals[0], 'SIGTERM');
}));

test('a child no signal can reach still ends the run, named by error, with its output kept', SPAWN_LIMIT, () => withGroupKills(EPERM, async (seen) => {
  const res = await node("process.stdout.write('up');setInterval(()=>{},1e3)", { timeoutMs: 1000 });
  process.kill(seen.pid, 'SIGKILL');
  assert.deepEqual([res.killedBy, res.code, res.signal, res.error], ['timeout', null, null, 'proc-kill-failed']);
  assert.equal(codes.isCode(res.error), true);
  assert.deepEqual(seen.signals, ['SIGTERM', 'SIGKILL', 'SIGKILL']);
}));

test('a cut at the cap drops a split trailing character instead of inventing a replacement character', async () => {
  const res = await node("process.stdout.write('x'.repeat(999)+'☃')", { capBytes: 1000 });
  assert.equal(res.killedBy, 'cap');
  assert.equal(res.stdout, 'x'.repeat(999));
});

test('rule 8: an uncut stream that really ends mid-character decodes as what it is', async () => {
  const res = await node('process.stdout.write(Buffer.from([0xe2]))');
  assert.deepEqual([res.killedBy, res.stdout], [null, '�']);
});

test('proc.alive: a process we may not signal is alive; a value that is no pid names no process', () => {
  assert.equal(proc.alive(1), true);
  assert.equal(proc.alive(Number.NaN), false);
});

test('ancestry: this process\'s ancestors up to the root and who leads its session; null with no listing or a parent not listed', () => {
  const rows = (self, shell) => [`  ${process.pid} ${process.ppid} ${self} node x`, `  ${process.ppid}   500 ${shell} -zsh`,
    '  500    77 Ss  login -pfl dev /bin/bash -c exec', '   77     1 S   /Applications/Terminal.app/Contents/MacOS/Terminal', '    1     0 Ss  /sbin/launchd',
    ' 4242   500 Ss+ node another-child', ''].join('\n');
  const chain = [['-zsh'], ['login', '-pfl', 'dev', '/bin/bash', '-c', 'exec'], ['/Applications/Terminal.app/Contents/MacOS/Terminal']];
  assert.deepEqual(proc.ancestry(12, rows('S+', 'S')), { chain, leader: 1 }, 'the nearest ancestor whose state says it leads the session');
  assert.equal(proc.ancestry(12, rows('S+', 'Ss')).leader, 0);
  assert.equal(proc.ancestry(12, rows('Ss+', 'S')).leader, -1, 'this process leads its own: a terminal opened for it alone');
  assert.equal(proc.ancestry(12, `${process.ppid} 1 S -zsh\n`).leader, null, 'no leader seen (S alone is a sleeping process)');
  assert.equal(proc.ancestry(2, rows('S+', 'S')), null, 'deeper than the bound: not walked whole');
  assert.equal(proc.ancestry(12, `${process.ppid} 500 S -zsh\n`), null, 'a parent the listing does not hold');
  assert.equal(proc.ancestry(12, null), null, 'no listing could be had');
  if (process.platform === 'win32') return;
  const own = proc.ancestry(64); // the system's own ps: this test's real ancestors
  assert.ok(own.chain.length >= 1 && own.chain.every((words) => words.length >= 1 && words[0].length > 0), JSON.stringify(own));
});
