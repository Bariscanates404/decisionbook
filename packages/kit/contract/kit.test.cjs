// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// kit's black-box contract: only the public entry. A replacement package passes this suite or it is not kit.
// Every [I-n] names one invariant of this package; `node kit/tools/contract.cjs kit --impl <dir>` runs it against another directory.
const test = require('node:test');
const assert = require('node:assert/strict');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const kit = require('@atlasbound/kit');

const { createFs, createGit, createTrace, proc, env } = kit.io;
const { isFail } = kit.errors;
const { pathKey } = kit.paths;

const tmp = () => nodeFs.mkdtempSync(path.join(os.tmpdir(), 'kit-contract-'));
const inTmp = async (fn) => { const dir = tmp(); try { return await fn(dir); } finally { kit.testing.trash(dir); } };
const coded = (code) => (e) => isFail(e, code);

// what is told is what is checked, and a refusal says what it wants.
const ROWS = kit.createValidate({ shapes: { Row: { name: 'str', level: 'level?', tags: 'str[]?' } }, enums: { level: ['low', 'high'] }, refuse: {}, isCode: () => true });

test('an enum field is told with its values, optional or not; every other type as its own type', () => {
  assert.deepEqual(ROWS.jsonSchema('Row').properties.level, { enum: ['low', 'high'] });
  assert.deepEqual(ROWS.jsonSchema('Row').properties.name, { type: 'string' });
  assert.deepEqual(ROWS.jsonSchema('Row').required, ['name']);
  assert.throws(() => ROWS.shape('Row', { name: 'a', level: 'mid' }), /Row\.level is not one of low, high/);
});

test('jsonOrNull: the value, or null for text that is no JSON', () => {
  assert.deepEqual(ROWS.jsonOrNull('{"a":1}'), { a: 1 });
  assert.equal(ROWS.jsonOrNull('{ not json'), null);
  assert.equal(ROWS.jsonOrNull(null), null);
});

test('[I-1] writeAtomic leaves the old bytes and no temp file when the fs throws between the temp write and the rename', () => inTmp((dir) => {
  createFs(dir).writeAtomic('a.txt', 'old');
  const boom = { ...nodeFs, renameSync: () => { throw Object.assign(new Error('boom'), { code: 'EIO' }); } };
  assert.throws(() => createFs(dir, { impl: boom }).writeAtomic('a.txt', 'new'), coded('io-write-failed'));
  assert.equal(nodeFs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'old');
  assert.deepEqual(nodeFs.readdirSync(dir), ['a.txt']);
  createFs(dir).writeAtomic('a.txt', 'new');
  assert.equal(nodeFs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'new');
}));

test('[I-2] a symlinked target, a symlinked parent, a hard link and a path escaping the root are refused and write nothing', () => inTmp((dir) => {
  const outside = tmp();
  try {
    nodeFs.writeFileSync(path.join(outside, 'victim'), 'safe');
    nodeFs.symlinkSync(path.join(outside, 'victim'), path.join(dir, 'link'));
    nodeFs.symlinkSync(outside, path.join(dir, 'parent'));
    nodeFs.linkSync(path.join(outside, 'victim'), path.join(dir, 'hard'));
    const fs = createFs(dir);
    for (const key of ['link', 'parent/victim', 'parent/new', 'hard']) {
      assert.throws(() => fs.writeAtomic(key, 'pwned'), coded('path-link'), `writeAtomic ${key}`);
      assert.throws(() => fs.append(key, 'pwned'), coded('path-link'), `append ${key}`);
      assert.throws(() => fs.remove(key), coded('path-link'), `remove ${key}`);
    }
    assert.throws(() => fs.writeAtomic('../escape', 'pwned'), coded('path-outside-repo'));
    assert.throws(() => fs.writeAtomic('/etc/escape', 'pwned'), coded('path-absolute'));
    assert.equal(nodeFs.readFileSync(path.join(outside, 'victim'), 'utf8'), 'safe');
    assert.deepEqual(nodeFs.readdirSync(outside), ['victim']);
  } finally {
    nodeFs.rmSync(outside, { recursive: true, force: true });
  }
}));

test('[I-3] one path key: NFD -> NFC, a\\b -> a/b, ../x and absolute refused with a code', () => {
  assert.equal(pathKey('cafe\u{301}.js'), 'caf\u{e9}.js');
  assert.equal(pathKey('a\\b'), 'a/b');
  assert.throws(() => pathKey('../x'), coded('path-outside-repo'));
  assert.throws(() => pathKey('/x'), coded('path-absolute'));
});

test('[I-4] an absent file or directory is null, never an empty value', () => inTmp((dir) => {
  const fs = createFs(dir);
  fs.writeAtomic('here/a.txt', ''); // what is there answers what it holds, an empty file its empty text, so a null below is absence
  assert.deepEqual([fs.readText('here/a.txt'), fs.list('here')], ['', ['a.txt']]);
  assert.equal(fs.readText('none.txt'), null);
  assert.equal(fs.list('none'), null);
  assert.equal(fs.readText('here/none.txt'), null);
}));

test('[I-4] exists: a file or a directory, nothing read to answer; the fake says the same', () => inTmp((dir) => {
  const fs = createFs(dir);
  fs.writeAtomic('in/a.txt', 'x');
  assert.deepEqual([fs.exists('in/a.txt'), fs.exists('in'), fs.exists('none'), fs.exists('in/a.txt/under')], [true, true, false, false]);
  const fake = kit.testing.memoryFs({ 'in/a.txt': 'x' });
  assert.deepEqual([fake.exists('in/a.txt'), fake.exists('in'), fake.exists('none')], [true, true, false]);
}));

const vocab = { steps: ['plan'], isCode: kit.codes.isCode };
const traceOf = () => {
  const fs = kit.testing.memoryFs();
  return { store: fs.store, trace: createTrace({ fs, clock: kit.testing.fixedClock() }) };
};
const rec = { run: 'r1', step: 'plan', ok: true };

test('[I-5] a trace record names its package, at .atlasbound/trace/<run>.ndjson, with seq per run across packages', () => {
  const { store, trace } = traceOf();
  trace.forPackage('alpha', vocab).record(rec);
  trace.forPackage('beta', vocab).record(rec);
  const key = kit.trace.tracePath('r1');
  assert.equal(key, '.atlasbound/trace/r1.ndjson');
  const rows = store.get(key).trim().split('\n').map((l) => kit.createValidate({ shapes: {}, enums: {}, refuse: {}, isCode: () => true }).json(l));
  assert.deepEqual(rows.map((r) => [r.pkg, r.seq, r.v]), [['alpha', 1, 1], ['beta', 2, 1]]);
});

test('[I-6] trace refuses a step outside the package vocabulary and a code outside its table, and writes nothing', () => {
  const { store, trace } = traceOf();
  const t = trace.forPackage('alpha', vocab);
  assert.throws(() => t.record({ ...rec, step: 'summarise' }), (e) => isFail(e, 'trace-invalid') && /step/.test(e.message));
  assert.throws(() => t.record({ ...rec, codes: { 'free text': 1 } }), (e) => isFail(e, 'trace-invalid') && /codes/.test(e.message));
  assert.equal(store.size, 0);
});

test('[I-21] a daily trace: hook runs share one file per day, `run` separates them, only the newest N days stay', () => inTmp((dir) => {
  const fs = createFs(dir);
  const old = ['2026-10-30', '2026-10-31', '2026-11-01'].map((day) => kit.trace.dailyPath(day));
  old.forEach((key) => fs.writeAtomic(key, ''));
  fs.writeAtomic(kit.trace.tracePath('cli-run'), 'kept\n');
  let at = '2026-11-02T06:00:00.000Z';
  const trace = createTrace({ fs, clock: { now: () => at, elapsedMs: () => 0 }, keepDays: 2 }).forPackage('alpha', vocab);
  trace.record({ ...rec, run: 'hook-1' });
  trace.record({ ...rec, run: 'hook-2' });
  const today = kit.trace.dailyPath(at);
  assert.equal(today, '.atlasbound/trace/hooks-2026-11-02.ndjson');
  assert.deepEqual(fs.readText(today).trim().split('\n').map((l) => kit.createValidate({ shapes: {}, enums: {}, refuse: {}, isCode: () => true }).json(l)).map((r) => [r.run, r.seq]),
    [['hook-1', 1], ['hook-2', 1]]);
  assert.deepEqual(fs.list('.atlasbound/trace'), ['cli-run.ndjson', 'hooks-2026-11-01.ndjson', 'hooks-2026-11-02.ndjson'], 'a run file is never pruned');
  at = '2026-11-03T00:00:01.000Z';
  trace.record({ ...rec, run: 'hook-3' });
  assert.equal(fs.readText(kit.trace.dailyPath(at)).split('\n').length, 2, 'a new day opens a new file');
}));

test('[I-22] one file holds several packages: a reader keeps its own records before its vocabulary judges them', () => {
  const foreign = JSON.stringify({ pkg: 'beta', run: 'r1', step: 'not-my-step' });
  const mine = JSON.stringify({ a: 1, pkg: 'alpha' });
  const v = kit.createValidate({ shapes: { Row: { a: 'int' } }, enums: {}, refuse: {}, isCode: kit.codes.isCode });
  const io = { fs: kit.testing.memoryFs({ 'p/r1': `${foreign}\n${mine}\n` }) };
  assert.deepEqual(kit.debug.load.createLoader(io, v).rows(['p/r1'], 'Row', (r) => r.pkg === 'alpha'), [{ a: 1, pkg: 'alpha' }]);
  assert.throws(() => v.lines(`${foreign}\n`, 'Row'), (e) => isFail(e, 'shape-invalid') && /line 1/.test(e.message), 'without the filter it is refused');
  assert.throws(() => v.lines(`${foreign}\n{"pkg":"alpha"}\n`, 'Row', (r) => r.pkg === 'alpha'), (e) => isFail(e, 'shape-invalid') && /line 2/.test(e.message), 'the kept row names its own line');
});

test('[I-22] a store that must be whole names its refused line and says the code once', () => {
  const v = kit.createValidate({ shapes: { Row: { a: 'int' } }, enums: {}, refuse: {}, isCode: kit.codes.isCode });
  assert.throws(() => v.lines('{"a":1}\n{torn\n'), (e) => isFail(e, 'json-invalid') && /^json-invalid: line 2: \S/.test(e.message)
    && e.message.split('json-invalid').length === 2, 'json-invalid: line 2: <why>, never json-invalid twice');
});

test('[I-7] traced writes one record per step with digests, and an uncoded failure records only its name', async () => {
  const { store, trace } = traceOf();
  const io = { clock: kit.testing.fixedClock(), trace: trace.forPackage('alpha', vocab) };
  const res = await kit.traced(io, 'plan', async () => ({ out: 1, n: { x: 1 }, codes: {} }))({ a: 1 }, { run: 'r1' });
  assert.equal(res.out, 1);
  await assert.rejects(kit.traced(io, 'plan', async () => { throw new TypeError('secret file text'); })({}, { run: 'r1' }), TypeError);
  const text = store.get(kit.trace.tracePath('r1'));
  assert.equal(text.trim().split('\n').length, 2);
  assert.match(text, /"code":"unexpected-error","msg":"TypeError"/);
  assert.doesNotMatch(text, /secret file text/);
});

test('[I-29] a coded error keeps its code across packages, a code in no table does not, and a step counts only its own codes', async () => {
  const { store, trace } = traceOf();
  const own = kit.codes.createCodes([['own-broke', 'x']]);
  const other = kit.codes.createCodes([['other-broke', 'x']]);
  const io = { clock: kit.testing.fixedClock(), trace: trace.forPackage('alpha', { steps: ['plan'], isCode: own.isCode }) };
  io.trace.forPackage('beta', { steps: ['read'], isCode: other.isCode });
  await assert.rejects(kit.traced(io, 'plan', async () => { throw kit.errors.fail('other-broke', 'x'.repeat(500)); })({}, { run: 'r1' }), (e) => kit.errors.isFail(e, 'other-broke'));
  await assert.rejects(kit.traced(io, 'plan', async () => { throw kit.errors.fail('no-table-has-this'); })({}, { run: 'r1' }), (e) => kit.errors.isFail(e, 'no-table-has-this'));
  const rows = store.get(kit.trace.tracePath('r1')).trim().split('\n').map((line) => kit.createValidate({ shapes: {}, enums: {}, refuse: {}, isCode: () => true }).json(line));
  assert.deepEqual(rows.map((r) => [r.pkg, r.err.code]), [['alpha', 'other-broke'], ['alpha', 'unexpected-error']]);
  assert.throws(() => io.trace.result({ out: 1, n: {}, codes: { 'other-broke': 1 } }), (e) => kit.errors.isFail(e));
});

const git = (dir, ...args) => {
  const res = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: dir, GIT_CONFIG_NOSYSTEM: '1' } });
  assert.equal(res.status, 0, res.stderr);
  return res.stdout;
};
const repo = (dir) => {
  git(dir, 'init', '-q', '-b', 'trunk');
  git(dir, 'config', 'core.precomposeunicode', 'false'); // macOS: keep the NFD spelling in the index, as Linux does
  git(dir, 'config', 'user.email', 'kit@example.invalid');
  git(dir, 'config', 'user.name', 'kit');
  return createGit({ proc, root: dir, env: env.pick(['PATH', 'HOME']) });
};

test('[I-8] lsFiles over a repo with an NFD name and a symlink returns the NFC key, the disk spelling and the link flag', async () => inTmp(async (dir) => {
  const g = repo(dir);
  const nfd = 'cafe\u{301}.js';
  nodeFs.writeFileSync(path.join(dir, nfd), 'x\n');
  nodeFs.writeFileSync(path.join(dir, 'plain.js'), 'y\n');
  nodeFs.symlinkSync('plain.js', path.join(dir, 'alias.js'));
  git(dir, 'add', '-A');
  const rows = await g.lsFiles();
  assert.deepEqual(rows.map((r) => [r.key, r.disk, r.link]).sort(), [
    ['alias.js', 'alias.js', true], ['caf\u{e9}.js', nfd, false], ['plain.js', 'plain.js', false]].sort());
}));

test('unignored names each path git would show, with the rule that brought it back or none; an ignored one is not named', async () => inTmp(async (dir) => {
  const g = repo(dir);
  nodeFs.mkdirSync(path.join(dir, 'sub'));
  nodeFs.writeFileSync(path.join(dir, '.gitignore'), 'local.json\nsub/*.json\n');
  nodeFs.writeFileSync(path.join(dir, 'sub', '.gitignore'), '# the team shares this folder\n!*\n');
  assert.deepEqual(await g.unignored(['local.json', 'sub/x.json', 'free.txt']), [{ key: 'sub/x.json', by: 'sub/.gitignore:2 !*' }, { key: 'free.txt', by: null }]);
  assert.deepEqual(await g.unignored(['local.json']), [], 'an ignored path alone: nothing to name');
  assert.deepEqual(await g.unignored([]), [], 'no path: check-ignore exits 1 (none ignored), which is no failure');
}));

test('[I-9] head and branch are null when there is none; statusZ names changes; a failure is coded, never an empty answer', async () => inTmp(async (dir) => {
  const g = repo(dir);
  assert.equal(await g.head(), null);
  assert.equal(await g.branch(), 'trunk');
  nodeFs.writeFileSync(path.join(dir, 'a.txt'), '1\n');
  assert.deepEqual((await g.statusZ()).map((r) => [r.xy, r.key]), [['??', 'a.txt']]);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'one');
  assert.match(await g.head(), /^[0-9a-f]{40}$/);
  git(dir, 'checkout', '-q', '--detach');
  assert.equal(await g.branch(), null);
  const notRepo = createGit({ proc, root: os.tmpdir(), env: { PATH: process.env.PATH, GIT_CEILING_DIRECTORIES: path.dirname(os.tmpdir()) } });
  await assert.rejects(notRepo.lsFiles(), coded('git-failed'));
}));

test('[I-9] resolves: a commit or its short sha names a commit; an unknown sha, a tree and an option-shaped word do not', async () => inTmp(async (dir) => {
  const g = repo(dir);
  nodeFs.writeFileSync(path.join(dir, 'a.txt'), '1\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'one');
  const head = await g.head();
  const tree = git(dir, 'rev-parse', 'HEAD^{tree}').trim();
  assert.deepEqual(await Promise.all([head, head.slice(0, 7), 'f'.repeat(40), tree, '--all'].map((rev) => g.resolves(rev))), [true, true, false, false, false]);
}));

test('[I-9] shared: the commits of HEAD\'s first-parent line since a base another branch\'s line holds too, with that branch', async () => inTmp(async (dir) => {
  const g = repo(dir);
  const commit = (subject) => git(dir, 'commit', '--allow-empty', '-m', subject) && git(dir, 'rev-parse', 'HEAD').trim();
  const base = commit('base');
  git(dir, 'checkout', '-q', '-b', 'feat/x');
  const own = commit('own');
  git(dir, 'checkout', '-q', 'trunk');
  const mate = commit('mate');
  git(dir, 'merge', '-q', '--no-ff', '--no-edit', 'feat/x');
  const merge = git(dir, 'rev-parse', 'HEAD').trim();
  git(dir, 'checkout', '-q', 'feat/x');
  git(dir, 'update-ref', 'refs/remotes/origin/feat/x', own);
  assert.deepEqual(await g.shared(base, 'feat/x'), [], 'own is the merge\'s second parent, not on trunk\'s line; feat/x and origin/feat/x are its own line');
  git(dir, 'branch', 'feat/x-next');
  assert.deepEqual(await g.shared(base, 'feat/x'), [{ sha: own, ref: 'feat/x-next' }], 'a branch whose name only starts with feat/x is another branch');
  git(dir, 'branch', '-D', 'feat/x-next');
  git(dir, 'merge', '-q', '--ff-only', 'trunk');
  assert.deepEqual(await g.shared(base, 'feat/x'), [{ sha: merge, ref: 'trunk' }, { sha: mate, ref: 'trunk' }], 'synced to trunk: the merge counts, HEAD\'s newest first');
  git(dir, 'checkout', '-q', '--detach', own);
  assert.deepEqual(await g.shared(base, null), [{ sha: own, ref: 'origin/feat/x' }], 'a detached HEAD: every branch is another, a remote copy too');
}));

test('[I-9] shared: a remote\'s HEAD points at one of its branches and is no line of its own', async () => inTmp(async (dir) => {
  const g = repo(dir);
  const commit = (subject) => git(dir, 'commit', '--allow-empty', '-m', subject) && git(dir, 'rev-parse', 'HEAD').trim();
  const base = commit('base');
  const own = commit('own');
  git(dir, 'update-ref', 'refs/remotes/origin/trunk', own);
  git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
  assert.deepEqual(await g.shared(base, 'trunk'), [], 'origin/trunk is trunk\'s own remote copy, and origin/HEAD only points at it');
  git(dir, 'update-ref', 'refs/remotes/origin/next', own);
  git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/next');
  assert.deepEqual(await g.shared(base, 'trunk'), [{ sha: own, ref: 'origin/next' }], 'near miss: origin/next is another branch, named by its own name, not by the pointer');
}));

test('[I-9] one absent rule: no commit yet is an empty history, and a base this clone lacks is null', async () => inTmp(async (dir) => {
  const g = repo(dir);
  const unknown = '0123456789abcdef0123456789abcdef01234567';
  assert.deepEqual([await g.commits(null), await g.shared(null, 'trunk'), await g.author('a.txt'), await g.blame('a.txt')], [[], [], null, []],
    'no commit yet');
  nodeFs.writeFileSync(path.join(dir, 'a.txt'), '1\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'one');
  const head = await g.head();
  assert.deepEqual((await g.commits(null)).map((c) => [c.sha, c.files]), [[head, ['a.txt']]], 'near miss: a real history is read');
  assert.deepEqual(await g.commits(head), [], 'measured: nothing after HEAD');
  assert.equal(await g.commits(unknown), null, 'a base this clone does not hold is unknown, never a measured empty list');
  assert.equal(await g.shared(unknown, 'trunk'), null);
  assert.equal(await g.author('a.txt'), 'kit');
  nodeFs.appendFileSync(path.join(dir, 'a.txt'), '2\n');
  assert.deepEqual(await g.blame('a.txt'), [{ sha: head, subject: 'one' }, { sha: null, subject: null }], 'a line not committed is null');
  const notRepo = createGit({ proc, root: os.tmpdir(), env: { PATH: process.env.PATH, GIT_CEILING_DIRECTORIES: path.dirname(os.tmpdir()) } });
  await assert.rejects(notRepo.commits(null), coded('git-failed'));
  await assert.rejects(notRepo.shared(null, 'trunk'), coded('git-failed'));
}));

test('[I-9] tracked reads a key as a literal path: a bracket name matches itself only', async () => inTmp(async (dir) => {
  const g = repo(dir);
  nodeFs.mkdirSync(path.join(dir, 'src'));
  ['[id].ts', 'i.ts', 'd.ts'].forEach((name) => nodeFs.writeFileSync(path.join(dir, 'src', name), 'x\n'));
  git(dir, 'add', '-A');
  assert.deepEqual(await g.tracked(['src/[id].ts']), ['src/[id].ts']);
  assert.deepEqual(await g.tracked(['src/i.ts', 'src/none.ts']), ['src/i.ts'], 'near miss: a plain key and a missing one');
}));

test('[I-9] tracked of an empty list asks nothing and answers []; one key still answers that key', async () => inTmp(async (dir) => {
  const g = repo(dir);
  ['a.js', 'b.js'].forEach((name) => nodeFs.writeFileSync(path.join(dir, name), 'x\n'));
  git(dir, 'add', '-A');
  assert.deepEqual(await g.tracked([]), []);
  assert.deepEqual(await g.tracked(['b.js']), ['b.js']);
}));

test('[I-10] proc kills the whole process group on timeout, a grandchild included', async () => inTmp(async (dir) => {
  const pidFile = path.join(dir, 'pid');
  const child = `require('node:child_process').spawn(process.execPath,['-e','require("node:fs").writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1e3)'],{stdio:'ignore'});setInterval(()=>{},1e3)`;
  // The clock must outlast two node boots on a loaded machine, or the grandchild never exists and this test proves nothing.
  const res = await proc.run({ cmd: process.execPath, args: ['-e', child], timeoutMs: 3000 });
  assert.equal(res.killedBy, 'timeout', `the child ended first, so say why (cause not established): ${JSON.stringify({ code: res.code, signal: res.signal, error: res.error, stderr: res.stderr.slice(0, 500) })}`);
  // Linux: a killed grandchild stays a zombie until whoever took it in (a CI container's init) reaps it; signal 0 still reaches a zombie
  const stat = (pid) => { try { return nodeFs.readFileSync(`/proc/${pid}/stat`, 'utf8'); } catch { return ''; } }; // '': gone meanwhile
  const zombie = (pid) => process.platform === 'linux' && !/^\d+ \(.*\) [^Z]/.test(stat(pid));
  const alive = (pid) => { try { process.kill(pid, 0); return !zombie(pid); } catch (e) { return e.code !== 'ESRCH'; } };
  assert.equal(alive(Number(nodeFs.readFileSync(pidFile, 'utf8'))), false);
}));

test('[I-10] a group kill answered with a permission error still resolves the run, from the timer and from the exit handler', async () => {
  const realKill = process.kill;
  const signals = [];
  process.kill = (pid, signal) => {
    if (pid >= 0) return realKill.call(process, pid, signal);
    signals.push(signal);
    throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' });
  };
  try {
    const res = await proc.run({ cmd: process.execPath, args: ['-e', 'setTimeout(()=>{},300)'], timeoutMs: 50 });
    assert.equal(res.killedBy, 'timeout');
    assert.equal(res.code, 0);
    assert.equal(signals[0], 'SIGTERM');
    assert.equal(signals.at(-1), 'SIGKILL');
  } finally {
    process.kill = realKill;
  }
});

test('[I-11] a 4-byte character split across chunks decodes whole', async () => {
  const script = "const b=Buffer.from('😀','utf8');process.stdout.write(b.subarray(0,2));setTimeout(()=>process.stdout.write(b.subarray(2)),50)";
  const res = await proc.run({ cmd: process.execPath, args: ['-e', script] });
  assert.equal(res.stdout, '😀');
});

test('[I-12] a child gets only its allowlist, argv is never a shell word', async () => {
  const res = await proc.run({ cmd: process.execPath, args: ['-e', 'process.stdout.write(JSON.stringify([Object.keys(process.env),process.argv[1]]))', '$(id)'], env: { ONLY: '1' } });
  const [keys, arg] = kit.createValidate({ shapes: {}, enums: {}, refuse: {}, isCode: () => true }).json(res.stdout);
  assert.deepEqual(keys.filter((k) => k !== '__CF_USER_TEXT_ENCODING'), ['ONLY']);
  assert.equal(arg, '$(id)');
});

test('[I-13] createValidate: one checker over data tables; a refusal is coded and names the field; unknown keys are ignored', () => {
  const v = kit.createValidate({ shapes: { Row: { a: 'int', b: 'kindA?', c: 'code?' } }, enums: { kindA: ['x'] }, refuse: { Row: 'trace-invalid' }, isCode: kit.codes.isCode });
  assert.deepEqual(v.shape('Row', { a: 1, extra: true }), { a: 1, extra: true });
  assert.throws(() => v.shape('Row', { a: -1 }), (e) => isFail(e, 'trace-invalid') && /Row\.a/.test(e.message));
  assert.throws(() => v.shape('Row', { a: 1, b: 'y' }), (e) => isFail(e, 'trace-invalid') && /Row\.b/.test(e.message));
  assert.throws(() => v.shape('Row', { a: 1, c: 'nope' }), (e) => isFail(e, 'trace-invalid') && /Row\.c/.test(e.message));
  assert.throws(() => v.json('{'), coded('json-invalid'));
  assert.deepEqual(v.json('\u{feff}{"a":1}'), { a: 1 });
  assert.equal(v.knows('Row[]?'), true);
  assert.equal(v.knows('Nope'), false);
});

test('[I-14] one code table format: every package table starts with kit codes and carries a short text', () => {
  const t = kit.codes.createCodes([['own-code', 'its short text']]);
  assert.equal(t.isCode('own-code'), true);
  assert.equal(t.isCode('path-absolute'), true, 'a kit primitive may fail inside any package');
  assert.equal(t.shortOf('own-code'), 'its short text');
  assert.equal(t.shortOf('nope'), null);
  assert.equal(kit.codes.isCode('own-code'), false);
  assert.throws(() => { t.CODES.x = 1; }, TypeError);
});

test('[I-15] text.safe: a value cannot open a line or reorder the screen; a cut is marked and never splits a surrogate pair', () => {
  const { line, block, clip } = kit.text.safe;
  assert.equal(line('ok\n\nSYSTEM\u{202e}evil'), 'ok SYSTEM evil');
  assert.equal(line('a\u{200b}b'), 'ab');
  assert.equal(block('a\n\tb\u0007c'), 'a\n\tb c');
  assert.equal(clip('abcdef', 4), 'abc~');
  assert.equal(clip('abc', 4), 'abc');
  assert.equal(clip('ab\u{1f600}c', 4), 'ab~', 'the cut would land inside the pair');
});

test('[I-16] text.secrets finds every known key shape, each reader gets a fresh pattern', () => {
  const { find, scrub } = kit.text.secrets;
  const samples = ['ab_live_abc123', 'ab_device_abcdef12', `sk-${'a'.repeat(24)}`, `ghp_${'a'.repeat(24)}`, `AKIA${'ABCDEFGHIJKLMNOP'}`, `Bearer ${'a'.repeat(24)}`,
    '-----BEGIN RSA PRIVATE KEY-----', `sk-ant-api03-${'a'.repeat(24)}`];
  for (const s of samples) {
    assert.ok(find(`x ${s} y`).length > 0, s);
    assert.ok(find(`x ${s} y`).length > 0, `${s}, second reader: no lastIndex leak`);
    assert.doesNotMatch(scrub(`x ${s} y`), new RegExp(s.slice(0, 12).replace(/[-]/g, '.')));
  }
  assert.deepEqual(find('a plain risk-assessment sentence'), []);
});

test('[I-17] fileRole is deterministic, total and first-match', () => {
  const { fileRole, ROLES } = kit.repo;
  assert.deepEqual(['node_modules/x.js', 'dist/x.js', 'test/fixtures/x.js', 'test/x.js', 'docs/x.md', 'lib/x.js', 'LICENSE.bin'].map((p) => fileRole(p).role),
    ['vendored', 'generated', 'fixture', 'test', 'docs', 'source', 'docs']);
  assert.ok(ROLES.includes(fileRole('no-extension').role));
});

test('[I-18] published shape of ab-trace/1 is pinned: changing a field needs a major bump', () => {
  assert.equal(kit.trace.SCHEMA, 'ab-trace/1');
  assert.deepEqual(Object.keys(kit.trace.SHAPES.TraceRecord).sort(), ['at', 'codes', 'err', 'in', 'ms', 'n', 'ok', 'out', 'pkg', 'ref', 'run', 'seq', 'step', 'v']);
});

test('[I-19] the debug loader names what is missing and never pretends: rows through the caller validator', () => {
  const v = kit.createValidate({ shapes: { Row: { a: 'int' } }, enums: {}, refuse: { Row: 'shape-invalid' }, isCode: kit.codes.isCode });
  const io = { fs: kit.testing.memoryFs({ 'p/CURRENT': 'abc\n', 'p/r1': '{"a":1}\n{"a":2}\n', 'p/bad': '{"a":-1}\n', 'p/one': '{"a":3}' }) };
  const l = kit.debug.load.createLoader(io, v);
  assert.equal(l.pointer('p/CURRENT'), 'abc');
  assert.throws(() => l.pointer('p/NONE'), coded('store-empty'));
  assert.deepEqual(l.rows(['p/r1', 'p/gone'], 'Row'), [{ a: 1 }, { a: 2 }]);
  assert.deepEqual(l.one('p/one', 'Row'), { a: 3 });
  assert.equal(l.one('p/none', 'Row'), null);
  assert.deepEqual(l.missing, ['p/gone', 'p/none']);
  assert.deepEqual(l.rows(['p/bad', 'p/r1'], 'Row'), [{ a: 1 }, { a: 2 }], 'a refused line costs only itself');
  assert.deepEqual(l.refused, [{ key: 'p/bad', line: 1, code: 'shape-invalid' }]);
});

test('[I-23] readText with no link: a link at the file or at a parent is refused by code, and an absent file is null', () => inTmp((dir) => {
  const fs = kit.io.createFs(dir);
  fs.writeAtomic('out/secret.md', 'theirs');
  fs.writeAtomic('in/plain.md', 'mine');
  nodeFs.symlinkSync(path.join(dir, 'out/secret.md'), path.join(dir, 'in/link.md'));
  nodeFs.symlinkSync(path.join(dir, 'out'), path.join(dir, 'parent'));
  assert.equal(fs.readText('in/plain.md', { noLink: true }), 'mine');
  assert.equal(fs.readText('in/absent.md', { noLink: true }), null);
  assert.equal(fs.readText('in/link.md'), 'theirs', 'a plain read still follows: only the caller that asks is refused');
  for (const key of ['in/link.md', 'parent/secret.md']) assert.throws(() => fs.readText(key, { noLink: true }), (e) => kit.errors.isFail(e, 'path-link'), key);
  // `symbolic` refuses the same symbolic links and reads a hard link, which is the file's own bytes; plain noLink keeps refusing it.
  for (const key of ['in/link.md', 'parent/secret.md']) assert.throws(() => fs.readText(key, { noLink: 'symbolic' }), (e) => kit.errors.isFail(e, 'path-link'), key);
  nodeFs.linkSync(path.join(dir, 'in/plain.md'), path.join(dir, 'in/hard.md'));
  assert.equal(fs.readText('in/hard.md', { noLink: 'symbolic' }), 'mine');
  assert.throws(() => fs.readText('in/hard.md', { noLink: true }), (e) => kit.errors.isFail(e, 'path-link'));
}));

test('[I-23] readText of whole UTF-8: bytes decide, a literal replacement character is text and a bad byte is refused by code', () => inTmp((dir) => {
  const fs = createFs(dir);
  nodeFs.writeFileSync(path.join(dir, 'literal.py'), Buffer.from('x = "�"\n', 'utf8'));
  nodeFs.writeFileSync(path.join(dir, 'bad.py'), Buffer.from([0x63, 0xe9, 0x0a]));
  nodeFs.writeFileSync(path.join(dir, 'both.py'), Buffer.concat([Buffer.from('�', 'utf8'), Buffer.from([0xff])]));
  nodeFs.writeFileSync(path.join(dir, 'bom.py'), Buffer.from('﻿x\n', 'utf8'));
  assert.equal(fs.readText('literal.py', { wholeUtf8: true }), 'x = "�"\n');
  assert.equal(fs.readText('bom.py', { wholeUtf8: true }), fs.readText('bom.py'), 'the same text as a plain read: a digest does not move');
  for (const key of ['bad.py', 'both.py']) assert.throws(() => fs.readText(key, { wholeUtf8: true }), coded('io-read-not-utf8'), key);
  assert.equal(fs.readText('bad.py'), 'c�\n');
  assert.equal(fs.readText('gone.py', { wholeUtf8: true }), null);
  assert.equal(kit.codes.isCode('io-read-not-utf8'), true);
}));

test('[I-23] createExclusive creates once; rename moves or says nothing moved; neither goes through a link', () => inTmp((dir) => {
  const fs = createFs(dir);
  assert.equal(fs.createExclusive('d/lock', 'one'), true);
  assert.equal(fs.createExclusive('d/lock', 'two'), false);
  assert.equal(fs.readText('d/lock'), 'one');
  assert.equal(fs.rename('d/lock', 'd/aside'), true);
  assert.deepEqual([fs.readText('d/lock'), fs.readText('d/aside')], [null, 'one']);
  assert.equal(fs.rename('d/lock', 'd/other'), false);
  nodeFs.symlinkSync(path.join(dir, 'outside'), path.join(dir, 'link'));
  assert.throws(() => fs.createExclusive('link', 'x'), coded('path-link'));
  assert.throws(() => fs.rename('d/aside', 'link'), coded('path-link'));
  assert.throws(() => fs.rename('link', 'd/moved'), coded('path-link'));
  const { memoryFs } = kit.testing;
  const fake = memoryFs();
  assert.deepEqual([fake.createExclusive('a', '1'), fake.createExclusive('a', '2'), fake.rename('a', 'b'), fake.rename('a', 'c')], [true, false, true, false]);
  assert.deepEqual([fake.readText('a'), fake.readText('b')], [null, '1']);
}));

test('[I-24] a process is alive until it is gone, and a bound trace writer binds a sibling over the same seq', async () => {
  assert.equal(proc.pid(), process.pid);
  assert.equal(proc.alive(process.pid), true);
  const gone = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  assert.equal(proc.alive(Number(gone.stdout)), false);
  const clock = kit.testing.fixedClock();
  const fs = kit.testing.memoryFs();
  const first = createTrace({ fs, clock }).forPackage('alpha', { steps: ['a'], isCode: kit.codes.isCode });
  const second = first.forPackage('beta', { steps: ['b'], isCode: kit.codes.isCode });
  assert.deepEqual([first.record({ run: 'r', step: 'a', ok: true }).seq, second.record({ run: 'r', step: 'b', ok: true }).seq], [1, 2]);
  assert.equal(second.record({ run: 'r', step: 'b', ok: true }).pkg, 'beta');
  const t0 = kit.io.clock.elapsedMs();
  await kit.io.clock.sleep(5);
  assert.ok(kit.io.clock.elapsedMs() > t0);
});

test('[I-24] a writer bound as lost notes a refused disk write and goes on, with every sibling it binds; without it, it throws', () => {
  const fs = kit.testing.memoryFs();
  fs.append = () => { throw kit.errors.fail('io-write-failed', '.atlasbound/trace: EROFS'); };
  const lost = [];
  const first = createTrace({ fs, clock: kit.testing.fixedClock() }).forPackage('alpha', { steps: ['a'], isCode: kit.codes.isCode, lost });
  const sibling = first.forPackage('beta', { steps: ['b'], isCode: kit.codes.isCode });
  assert.equal(first.record({ run: 'r', step: 'a', ok: true }).seq, 1);
  assert.equal(sibling.event('r', 'b', { code: 'io-read-failed', msg: '' }).pkg, 'beta');
  assert.deepEqual(lost, ['io-write-failed', 'io-write-failed']);
  const strict = createTrace({ fs, clock: kit.testing.fixedClock() }).forPackage('alpha', { steps: ['a'], isCode: kit.codes.isCode });
  assert.throws(() => strict.record({ run: 'r', step: 'a', ok: true }), (err) => err.code === 'io-write-failed');
  assert.throws(() => first.record({ run: 'r', step: 'nope', ok: true }), (err) => err.code !== 'io-write-failed');
});

test('[I-28] lockLine says a lock for a doctor and changes nothing: free, a live holder, a dead one, a torn one', () => {
  const { lockLine } = kit.lock;
  const world = (alive) => ({ fs: kit.testing.memoryFs(), proc: { alive: () => alive }, clock: { now: () => '2026-11-03T00:00:01.000Z' } });
  const held = `${JSON.stringify({ pid: 41, nonce: 'a'.repeat(64), at: '2026-11-03T00:00:00.000Z' })}\n`;
  assert.equal(lockLine(world(true), 'L'), null);
  const live = world(true);
  live.fs.writeAtomic('L', held);
  assert.deepEqual(lockLine(live, 'L'), { stuck: false, says: 'lock held by pid 41' });
  assert.equal(live.fs.readText('L'), held);
  const dead = world(false);
  dead.fs.writeAtomic('L', held);
  assert.deepEqual(lockLine(dead, 'L'), { stuck: true, says: 'dead lock (pid 41): the next writer reclaims it' });
  assert.equal(dead.fs.readText('L'), held, 'a doctor reclaims nothing');
  const torn = world(true);
  torn.fs.writeAtomic('L', '{"pid":41');
  assert.deepEqual(lockLine(torn, 'L'), { stuck: true, says: 'torn lock (pid null): the next writer reclaims it' });
});

test('[I-25] withLock: one holder per key, released on a throw, a live holder waited for then lock-held, a dead one reclaimed', async () => {
  const { withLock } = kit.lock;
  const world = (alive) => ({ fs: kit.testing.memoryFs(), clock: kit.testing.fixedClock(), proc: { pid: () => 7, alive } });
  const io = world(() => true);
  assert.equal(await withLock(io, 'L', async () => 'done'), 'done');
  assert.equal(io.fs.readText('L'), null);
  await assert.rejects(withLock(io, 'L', async () => { throw kit.errors.fail('not-found', 'x'); }), coded('not-found'));
  assert.equal(io.fs.readText('L'), null, 'a throw releases');
  const order = [];
  await Promise.all(['a', 'b'].map((who) => withLock(io, 'L', async () => {
    order.push(`${who}+`);
    await io.clock.sleep(100);
    order.push(`${who}-`);
  })));
  assert.deepEqual(order, ['a+', 'a-', 'b+', 'b-'], 'never two holders');
  const held = world(() => true);
  held.fs.writeAtomic('L', `${JSON.stringify({ pid: 99, nonce: 'a'.repeat(64), at: 'then' })}\n`);
  await assert.rejects(withLock(held, 'L', async () => 'no'), coded('lock-held'));
  assert.ok(held.fs.readText('L').includes('"pid":99'), 'a live lock is never stolen');
  const dead = world(() => false);
  dead.fs.writeAtomic('L', `${JSON.stringify({ pid: 99, nonce: 'a'.repeat(64), at: 'then' })}\n`);
  assert.equal(await withLock(dead, 'L', async () => 'reclaimed'), 'reclaimed');
  assert.equal(dead.fs.readText('L'), null);
});

test('[I-27] a live holder is waited for as long as it plausibly works; one that never leaves ends at the bound as held', async () => {
  const { withLock } = kit.lock;
  const lock = `${JSON.stringify({ pid: 99, nonce: 'a'.repeat(64), at: 'then' })}\n`;
  const world = ({ releaseAfterMs = Infinity, alive = () => true, text = lock }) => {
    const fs = kit.testing.memoryFs({ L: text });
    const clock = { ...kit.testing.fixedClock(), waited: 0 };
    clock.elapsedMs = () => clock.waited;
    clock.sleep = async (ms) => {
      clock.waited += ms;
      if (clock.waited >= releaseAfterMs) fs.remove('L');
    };
    return { fs, clock, proc: { pid: () => 7, alive } };
  };
  const slow = world({ releaseAfterMs: 103000 }); // a slow holder that leaves inside the bound
  assert.equal(await withLock(slow, 'L', async () => 'landed'), 'landed');
  const stuck = world({});
  await assert.rejects(withLock(stuck, 'L', async () => 'no'), (e) => isFail(e, 'lock-held') && /pid 99/.test(e.message) && /alive after 600 s/.test(e.message));
  assert.ok(stuck.clock.waited >= 600000 && stuck.clock.waited < 601000, `bound ${stuck.clock.waited}`);
  assert.ok(stuck.fs.readText('L').includes('"pid":99'), 'a lock that reads alive is never stolen');
  const torn = world({ text: '{"pid":' });
  assert.equal(await withLock(torn, 'L', async () => 'reclaimed'), 'reclaimed');
  assert.ok(torn.clock.waited >= 60000 && torn.clock.waited < 61000, `a crash's torn lock does not cost the whole bound: ${torn.clock.waited}`);
});

// the product's background children start through one door; the spawn is a spy, nothing runs.
function childWorld({ alive = () => true, envGiven = { PATH: '/usr/bin:/fake/node_modules/.bin', HOME: '/home/ana', TOKEN: 'never' } } = {}) {
  const starts = [];
  const io = { root: '/fake', self: { node: '/node', bin: '/bin/atlasbound.cjs' }, fs: kit.testing.memoryFs(), clock: kit.testing.fixedClock(),
    env: { pick: (keys) => Object.fromEntries(Object.entries(envGiven).filter(([key]) => keys.includes(key))), realOf: (dir) => dir },
    proc: { pid: () => 7, alive, startDetached: (spec) => { starts.push(spec); return { pid: 4242, error: null }; } } };
  return { io, starts };
}

test('[I-67] startOnce: under the lock, one detached child of the product, its row noted only once it started', async () => {
  const { startOnce, startSelf } = kit.child;
  const { io, starts } = childWorld();
  const noted = [];
  const plan = (refused) => () => (refused ? { refused } : { start: () => startSelf(io, ['toy', 'work'], ['PATH', 'HOME']), note: (pid) => noted.push(pid) });
  assert.deepEqual(await startOnce(io, { lock: 'L' }, plan(null)), { pid: 4242 });
  assert.deepEqual(starts, [{ cmd: '/node', args: ['/bin/atlasbound.cjs', 'toy', 'work'], env: { PATH: '/usr/bin', HOME: '/home/ana' }, cwd: '/fake' }],
    'its own node and bin, the words given, only the named env keys, a PATH with no repository directory, at the root');
  assert.deepEqual(noted, [4242]);
  assert.equal(io.fs.readText('L'), null, 'the lock is released');
  assert.deepEqual(await startOnce(io, { lock: 'L' }, plan('not-due')), { refused: 'not-due' });
  const failing = childWorld();
  failing.io.proc.startDetached = () => ({ pid: null, error: 'EAGAIN' });
  const none = [];
  assert.deepEqual(await startOnce(failing.io, { lock: 'L' }, () => ({ start: () => startSelf(failing.io, ['toy', 'work'], []), note: (pid) => none.push(pid) })), { error: 'EAGAIN' });
  assert.deepEqual([starts.length, noted, none], [1, [4242], []], 'a refusal and a failed start note no row');
});

test('[I-67] startOnce while another live process holds the lock starts nothing and gives up at its own short bound', async () => {
  const { startOnce, startSelf } = kit.child;
  const lock = `${JSON.stringify({ pid: 99, nonce: 'a'.repeat(64), at: '2026-11-02T06:00:00.000Z' })}\n`;
  const plan = (io) => () => ({ start: () => startSelf(io, ['toy', 'work'], []), note: () => {} });
  const held = childWorld();
  held.io.fs.writeAtomic('L', lock);
  const waited = [];
  held.io.clock.sleep = async (ms) => { waited.push(ms); };
  await assert.rejects(startOnce(held.io, { lock: 'L', waitMs: 200 }, plan(held.io)), coded('lock-held'));
  assert.equal(held.starts.length, 0, 'the lock is not ignored');
  assert.ok(waited.length > 0 && waited.length < 100, `it stopped at its bound, not kit's 600 s: ${waited.length} waits`);
  const dead = childWorld({ alive: () => false });
  dead.io.fs.writeAtomic('L', lock);
  assert.deepEqual(await startOnce(dead.io, { lock: 'L', waitMs: 200 }, plan(dead.io)), { pid: 4242 });
});

test('startSelf hands a bounded child its hard stop in the one env key the starter owns, and handedStop reads it back', () => {
  const { startSelf, handedStop } = kit.child;
  const { io, starts } = childWorld();
  startSelf(io, ['toy', 'work'], ['HOME'], 300000);
  startSelf(io, ['toy', 'tidy'], ['HOME']);
  const [key, ...more] = Object.keys(starts[0].env).filter((name) => !Object.hasOwn(starts[1].env, name));
  assert.deepEqual([more, starts[0].env[key]], [[], '300000'], 'a bound given rides as one env key of data; a child with none gets no key');
  const envOf = (value) => ({ get: (name) => (name === key ? value : null) });
  assert.deepEqual([handedStop(envOf('300000')), handedStop(envOf(null)), handedStop(envOf('0')), handedStop(envOf('-5')), handedStop(envOf('soon'))], [300000, null, null, null, null]);
});

test('[I-20] render never prints a fabricated 0: an absent number is "not measured"', () => {
  const { measured, d8, tally } = kit.debug.render;
  assert.equal(measured(null), 'not measured');
  assert.equal(measured(0), '0');
  assert.equal(d8(null), '—');
  assert.equal(tally({ b: 1, a: 2 }), 'a ×2, b ×1');
});

test('[I-26] testing.trash moves a test world aside with one rename: nothing is unlinked, and a world already gone is no error', () => {
  const dir = tmp();
  nodeFs.writeFileSync(path.join(dir, 'a.txt'), 'kept\n');
  const unlinks = [];
  const realUnlink = nodeFs.unlinkSync;
  nodeFs.unlinkSync = (at) => { unlinks.push(at); return realUnlink(at); };
  try {
    const moved = kit.testing.trash(dir);
    assert.equal(nodeFs.existsSync(dir), false);
    assert.equal(path.dirname(moved), path.join(os.tmpdir(), 'atlasbound-test-trash'));
    assert.equal(nodeFs.readFileSync(path.join(moved, 'a.txt'), 'utf8'), 'kept\n');
    assert.deepEqual(unlinks, []);
    assert.equal(kit.testing.trash(dir), null);
  } finally {
    nodeFs.unlinkSync = realUnlink;
  }
});

test('[I-16] a private key goes whole, armour and body, in every shape; what follows its END line stays', () => {
  const { find, scrub } = kit.text.secrets;
  const BODY = 'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAAB';
  const shapes = {
    openssh: `before\n-----BEGIN OPENSSH PRIVATE KEY-----\n${BODY}\n${BODY}\n-----END OPENSSH PRIVATE KEY-----\nafter`,
    rsa: `before\n-----BEGIN RSA PRIVATE KEY-----\n${BODY}\n-----END RSA PRIVATE KEY-----\nafter`,
    pkcs8: `before\n-----BEGIN PRIVATE KEY-----\n${BODY}\n-----END PRIVATE KEY-----\nafter`,
    crlf: `before\r\n-----BEGIN EC PRIVATE KEY-----\r\n${BODY}\r\n-----END EC PRIVATE KEY-----\r\nafter`,
    'one line': `before -----BEGIN PRIVATE KEY----- ${BODY} -----END PRIVATE KEY----- after`,
    'spelled low': `before\n----- begin rsa private key -----\n${BODY}\n----- end rsa private key -----\nafter`,
  };
  for (const [name, text] of Object.entries(shapes)) {
    const out = scrub(text);
    assert.ok(!out.includes(BODY.slice(0, 16)), `${name}: ${out}`);
    assert.doesNotMatch(out, /PRIVATE KEY|private key/i, name);
    assert.deepEqual([out.startsWith('before'), out.endsWith('after')], [true, true], `${name}: ${out}`);
    assert.ok(find(text).includes('private-key-block'), name);
  }
  assert.ok(find(`-----BEGIN ${'A '.repeat(60)}PRIVATE KEY-----`).includes('private-key-block'), 'no name a row caught is lost: a row never narrows');
  const started = Date.now();
  scrub(`-----BEGIN ${'A'.repeat(512 * 1024)}`);
  scrub('-----BEGIN PRIVATE KEY-----'.repeat(20000));
  assert.ok(Date.now() - started < 2000, 'linear on a long name and on many armours');
  const cut = scrub(`before\n-----BEGIN PRIVATE KEY-----\n${BODY}\n${BODY}`);
  assert.ok(!cut.includes(BODY.slice(0, 16)), 'no END line: to the end of the text');
  assert.ok(cut.startsWith('before'));
  assert.deepEqual(find('-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----'), [], 'a public key is not a secret');
});

test('[I-16] secrets: the shapes beyond a vendor prefix, read through escapes; a placeholder is no credential', () => {
  const { find } = kit.text.secrets;
  const value = 'a1'.repeat(8);
  const shapes = [`github_pat_${'a'.repeat(30)}`, `glpat-${'a'.repeat(20)}`, `xoxb-${'1'.repeat(20)}`, `sk_live_${'a'.repeat(24)}`, `rk_test_${'a'.repeat(24)}`, `AIza${'a'.repeat(35)}`,
    `npm_${'a'.repeat(36)}`, `ASIA${'A'.repeat(16)}`, `eyJ${'a'.repeat(12)}.eyJ${'b'.repeat(12)}.${'c'.repeat(12)}`, '-----BEGIN PGP PRIVATE KEY BLOCK-----', '-----BEGIN OPENSSH PRIVATE KEY-----',
    `postgres://app:${value}@db.example.invalid/x`, `api_key = "${value}"`, `password: '${value}'`, `DB_PASSWORD=${value}`, `export GITHUB_TOKEN=${value}`, `spring.datasource.password=${value}`];
  for (const s of shapes) assert.ok(find(`x\n${s}\ny`).length > 0, s);
  const key = `AKIA${'A'.repeat(16)}`;
  assert.deepEqual(find(`\\u0041KIA${'A'.repeat(16)}`), ['aws-access-key'], 'a unicode escape');
  assert.deepEqual(find(`\\x41KIA${'A'.repeat(16)}`), ['aws-access-key'], 'a hex escape');
  assert.deepEqual(find(key), ['aws-access-key'], 'found once, not once per spelling');
  const plain = ['password: process.env.DB_PASSWORD', 'API_KEY=', 'API_KEY=your-api-key-here', 'const secret = req.session.secret;', 'http://localhost:3000/x', 'http://user@host.invalid/',
    'mongodb://${user}:${pass}@host.invalid/db', 'tests/options.env.test.js', 'a plain risk-assessment sentence', 'sha512-abc+/=', 'token = nextToken();', 'x = "\\u0041\\u0042"'];
  for (const s of plain) assert.deepEqual(find(s), [], s);
});

// credential forms in ordinary source. Every value is built here, at run time, and is a fake: letters and digits, no vendor's real prefix unless the row is about that prefix.
const fake = (n = 20) => `q${'x1y2z3'.repeat(Math.ceil(n / 6)).slice(0, n - 2)}7`;
const v = fake();
const up = (n) => 'A1B2C3D4'.repeat(Math.ceil(n / 8)).slice(0, n);
const b64 = (s) => Buffer.from(s).toString('base64');
const KEYED_FORMS = {
  'go :=': `func main() { password := "${v}"; _ = password }`, 'ts annotation': `const apiKey: string = "${v}";`, 'ts class field': `class A { private readonly secret: string = '${v}'; }`,
  'rust annotation': `let token: &str = "${v}";`, 'py bytes': `SECRET_KEY = b"${v}"`, 'py raw': `SECRET_KEY = r"${v}"`, 'py fstring': `password = f"${v}"`, 'py subscript': `config["password"] = "${v}"`,
  'py environ set': `os.environ["API_KEY"] = "${v}"`, 'php define': `<?php define('DB_PASSWORD', '${v}');`, 'wp auth key': `<?php define('AUTH_KEY', '${v}');`, 'java setter': `ds.setPassword("${v}");`, 'array pair': `const a = ["password", "${v}"];`,
  '||': `const s = process.env.JWT_SECRET || "${v}";`, '??': `export const s = process.env.API_KEY ?? '${v}';`, or: `password = os.environ.get("X") or "${v}"`, 'getenv default': `API_KEY = os.getenv("API_KEY", "${v}")`, 'environ.get default': `password = os.environ.get("DB_PASSWORD", "${v}")`,
  'env read, any key, ||': `const c = process.env.SOMETHING || "${v}";`, 'env read, any key, ??': `const c = process.env.SOMETHING ?? '${v}';`, 'env read, any key, or': `c = os.environ.get("SOMETHING") or "${v}"`, 'env read, any key, argument': `c = os.getenv("SOMETHING", "${v}")`,
  'env read, any key, ?:': `$c = getenv('SOMETHING') ?: '${v}';`, 'env read, any key, ruby': `c = ENV.fetch("SOMETHING", "${v}")`, 'env read, any key, rust': `let c = env::var("SOMETHING").unwrap_or("${v}".to_string());`,
  'spring default': `@Value("\${app.secret:${v}}") private String s;`, 'shell default': `DB=\${DB_PASSWORD:-${v}}`,
  'pass:': `const m = { auth: { user: "a@b.c", pass: "${v}" } };`, DB_PASS: `DB_PASS=${v}`, MYSQL_PASS: `MYSQL_PASS="${v}"`, camelPass: `const dbPass = "${v}";`, AUTH_KEY: `AUTH_KEY=${v}`, ENCRYPTION_KEY: `ENCRYPTION_KEY=${v}`, SIGNING_KEY: `SIGNING_KEY=${v}`,
  APP_KEY: `APP_KEY=base64:${v}`, passphrase: `passphrase = "${v}"`, credential: `credential = "${v}"`, sifre: `sifre = "${v}"`, parola: `DB_PAROLA=${v}`, passwort: `passwort = "${v}"`,
  'trailing comment': `password=${v} # rotate me`, 'yaml comment': `password: ${v} # prod`, 'aligned bare': `password         = ${v}`, 'aligned quoted': `password         = "${v}"`, '33 indent': `${' '.repeat(33)}password=${v}`,
  'long prefix': `${'a'.repeat(70)}password=${v}`, 'long suffix': `password${'a'.repeat(70)}=${v}`, 'over 512': `const password = "${fake(600)}";`, 'next line': `password:\n  ${v}`, 'short value': `const password = "${fake(11)}";`,
  'escaped quote': `{"cells":[{"source":["DB_PASSWORD = \\"${v}\\"\\n"]}]}`, 'escaped output': `{"cells":[{"outputs":[{"text":["API_TOKEN=${v}\\n"]}]}]}`, 'in a template': `const t = \`password=${v}\`;`, 'bom first line': `﻿password=${v}`,
  'cr only': `a=1\rpassword=${v}\rb=2\r`,
};
const VENDOR_FORMS = {
  'slack webhook': `const u = "https://hooks.slack.com/services/T${up(8)}/B${up(8)}/${fake(24)}";`, 'slack app': `xapp-1-${up(11)}-${up(12)}-${fake(40)}`, 'stripe webhook': `whsec_${fake(32)}`,
  'google oauth': `ya29.${fake(60)}`, 'google client': `GOCSPX-${fake(28)}`, 'azure account key': `DefaultEndpointsProtocol=https;AccountName=a;AccountKey=${fake(86)}==;EndpointSuffix=core.windows.net`,
  'azure sas': `https://a.blob.core.windows.net/c?sv=2022-11-02&ss=b&sig=${fake(43)}%3D`, 'azure client secret': `abc8Q~${fake(34)}`, sendgrid: `SG.${fake(22)}.${fake(43)}`, 'hugging face': `hf_${fake(34)}`, digitalocean: `dop_v1_${'a1'.repeat(32)}`,
  pypi: `pypi-AgEI${fake(60)}`, 'basic auth': `Authorization: Basic ${b64(`admin:${v}`)}`, 'token as url user': `https://${'a1'.repeat(20)}@github.com/o/r.git`, 'redis empty user': `redis://:${v}@cache.example.invalid:6379`,
  'url password %': `postgres://app:%40${v}@db.example.invalid/x`, 'url password $': `postgres://app:$${v}@db.example.invalid/x`, 'url password {': `postgres://app:{${v}@db.example.invalid/x`, 'url password /': `postgres://app:ab/${v}@db.example.invalid/x`,
  'url password :': `postgres://app:ab:${v}@db.example.invalid/x`, 'jdbc query': `jdbc:mysql://db/x?user=app&password=${v}`, 'connection string': `Server=db;Database=x;User Id=sa;Password=${v};`, 'curl -u': `curl -u admin:${v} https://api.example.invalid/x`,
  'mysql -p': `mysql -u root -p${v} app < dump.sql`, sshpass: `sshpass -p '${v}' ssh deploy@host`, 'docker login': `docker login -u ci -p ${v} registry.example.invalid`, 'aws configure': `aws configure set aws_secret_access_key ${v}`,
  'xml tag': `<password>${v}</password>`, 'xml attr': `<add key="Password" value="${v}"/>`, 'sql identified': `CREATE USER app IDENTIFIED BY '${v}';`, 'sql with password': `ALTER USER app WITH PASSWORD '${v}';`,
  'pem spaced': '-----BEGIN  PRIVATE  KEY-----', 'pem lower': '-----begin private key-----', 'pem base64': b64('-----BEGIN PRIVATE KEY-----\nabc\n'), 'der body': `MII${fake(200)}`, putty: 'PuTTY-User-Key-File-3: ssh-ed25519', 'base64 aws': b64(`AKIA${up(16)}:${v}`),
};
const PLAIN_TEXT = ['process.env.BASE_URL || \'http://localhost:3000\'', 'process.env.NODE_ENV || \'development\'', "process.env.PORT || '3000'", "process.env.VERSION || 'v1.2.3-beta4'", 'os.getenv("HOME", "/home/user1")',
  "token === 'abc123def456'", 'setPassword(password1)', 'setToken("")', 'token = nextToken();', 'pass: process.env.DB_PASS1', 'if token: pass', 'bypass = "abc123456789"', 'passed: "abc123456789"', 'compass = "abc123def456"',
  'curl -u "$USER:$PASS" https://x.invalid', 'curl -u $USER:$TOKEN1 https://x.invalid', 'docker login -u ci -p $DOCKER_PASSWORD1 registry', 'mysql -u root -p app < dump.sql', '<password>${db.password1}</password>', '<token></token>',
  'postgres://app:$DB_PASS1@db.invalid/x', 'postgres://app:%(password1)s@db.invalid/x', 'postgres://app:{password1}@db.invalid/x', 'https://unpkg.invalid:443/@babel/core@7.0.0', 'http://localhost:3000/@scope/pkg@1.0', 'redis://:${REDIS_PASSWORD1}@cache.invalid',
  '${SERVER_PORT:-30001234}', '${VERSION:-1.2.3-beta4}', '${DB_PASSWORD:-}', 'password = "password"', 'const TOKEN_RE=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;var a=1', 'a basic mechanism abcdefgh1234567890', "connect(password=db_pass1, host='x')", 'hooks.slack.com/services/', 'sig=abc', 'the token 123 is invalid'];

test('[I-16] a keyword and a value in ordinary source are caught with no vendor row, and the scrub takes the whole value', () => {
  const { find, scrub } = kit.text.secrets;
  for (const [form, text] of Object.entries(KEYED_FORMS)) {
    assert.ok(find(text).length > 0, `${form}: ${text.slice(0, 80)}`);
    assert.ok(!scrub(text).includes(v.slice(-10)), `${form}: nothing of the value is left: ${scrub(text).slice(0, 80)}`);
  }
});

test('[I-16] vendor and URL forms, one row each; the scrub takes the whole value', () => {
  const { find, scrub } = kit.text.secrets;
  const headers = new Set(['pem spaced', 'pem lower', 'putty']); // the row sees the armour; a body has no form of its own, so such a file is refused whole by find
  for (const [form, text] of Object.entries(VENDOR_FORMS)) {
    assert.ok(find(text).length > 0, `${form}: ${text.slice(0, 80)}`);
    if (!headers.has(form)) assert.ok(!scrub(text).includes(v.slice(-10)), `${form}: nothing of the value is left: ${scrub(text).slice(0, 80)}`);
  }
});

test('[I-16] no new row is dead: every label fires on a form of its own', () => {
  const { find } = kit.text.secrets;
  const fired = new Set([...Object.values(KEYED_FORMS), ...Object.values(VENDOR_FORMS)].flatMap((text) => find(text)));
  const rows = ['slack-app-token', 'slack-webhook', 'stripe-webhook-secret', 'google-oauth-token', 'google-client-secret', 'azure-storage-key', 'azure-sas-signature', 'azure-client-secret', 'sendgrid-key', 'huggingface-token', 'digitalocean-token',
    'pypi-token', 'aws-key-base64', 'basic-auth', 'private-key-spelled', 'private-key-base64', 'der-key-body', 'putty-key', 'url-password-no-user', 'url-password-odd-start', 'url-password-odd-middle', 'url-token-user', 'code-credential', 'pair-credential',
    'spaced-credential', 'inline-credential', 'setter-credential', 'markup-credential', 'sql-credential', 'pass-credential', 'env-default', 'placeholder-default', 'cli-credential'];
  assert.deepEqual(rows.filter((label) => !fired.has(label)), []);
});

test('[I-16] what no reader sees is taken out before a row looks, and the scrub runs before the cut', () => {
  const { find, scrub, clipped } = kit.text.secrets;
  const body = 'A1b2'.repeat(9);
  const key = `ghp_${body}`;
  for (const hidden of ['\u200b', '\u200c', '\u200d', '\u2060', '\ufeff', '\u00ad', '\u202e', '\u2066', '\u0001', '\u{e0041}']) {
    const text = `key ghp_${hidden}${body} end`;
    assert.deepEqual(find(text), ['github-token'], JSON.stringify(hidden));
    assert.equal(scrub(text), 'key [github-token] end', JSON.stringify(hidden));
  }
  assert.deepEqual(find(`key ghp_\\u200b${body}`), ['github-token'], 'written as an escape');
  assert.equal(find(key.split('').join('\u200b')).length, 1, 'between every letter');
  const aws = `AKIA${up(16).toUpperCase()}`;
  const cut = clipped(`${'z'.repeat(41)}${aws}`, 60);
  assert.ok(!cut.includes(aws.slice(0, 18)), `18 of its 20 characters stayed: ${cut}`);
  assert.equal(cut, `${'z'.repeat(41)}[aws-access-key]`);
  assert.ok(clipped('x'.repeat(100), 10).endsWith('~'), 'a cut still says so');
  assert.equal(kit.text.safe.visible('a\u200bb\u202ec\nd'), 'abc\nd', 'a line break stays: rows read lines');
});

test('[I-16] holds reads every decoded string and key of a value, and across a key and its value', () => {
  const { holds } = kit.text.secrets;
  for (const value of [{ key: `password = "${v}"` }, { a: [{ b: `postgres://app:${v}@db.invalid/x` }] }, { [`AKIA${up(16)}`]: 1 }, { password: v }, `password=${v}`, [`ghp_${'a1'.repeat(15)}`]]) {
    assert.equal(holds(value), true, JSON.stringify(value));
  }
  for (const value of [{ key: 'PORT' }, { refs: ['lib/a.js:3'], hasDefault: true, count: 2 }, null, undefined, 3, true, '', [], {}]) assert.equal(holds(value), false, JSON.stringify(value));
});

test('[I-16] no row goes past linear: every hostile input stays far from a second over 512 KB', () => {
  const { find } = kit.text.secrets;
  const fill = (unit) => unit.repeat(Math.ceil(524288 / unit.length)).slice(0, 524288);
  const units = ['a', '\n', ' ', 'password', 'password=', 'password="', 'password: ', `password${'a'.repeat(64)}`, `${'a'.repeat(63)}password${'a'.repeat(63)}\n`, `password:${'\n'.repeat(64)}`, `token: ${'x,'.repeat(24)}`, `password="${'a'.repeat(600)}"\n`,
    'env ', 'env,', `process.env.A${'b'.repeat(50)} || "x"\n`, 'postgres://', `a://${'b'.repeat(64)}:`, 'curl ', `curl ${'x '.repeat(32)}\n`, 'mysql ', 'docker login ', 'setpassword', '<password>', 'pass ', 'aPass:', 'password=a(', 'password: a[', `token = ${'a.'.repeat(16)}a(`, 'token=a::', '${', 'sk-', '-----begin ', 'MII', '\\u0041', '\u200b', 'authorization: basic '];
  for (const unit of units) {
    const text = fill(unit);
    const t0 = process.hrtime.bigint();
    find(text);
    assert.ok(Number(process.hrtime.bigint() - t0) / 1e6 < 1000, `over a second on ${JSON.stringify(unit.slice(0, 20))}`);
  }
});

test('[I-16] what code really writes stays text: a url, a version, a variable, a call and a word are no credentials', () => {
  const { find } = kit.text.secrets;
  for (const text of PLAIN_TEXT) assert.deepEqual(find(text), [], text);
});

// lines of real code first. A right side wholly in the form of a call, a subscript or a member of a known object holds no literal.
const CODE_RIGHT = ['tokens = tokens[:len(tokens)-1]', 'tokens = tokens[1:]', 'c.tokens = c.tokens[:0]', 'secret = crypto.randomBytes(32)', 'token: getToken1(),', 'password = hash_password_v2(raw)', 'password: process.env.DB_PASS1',
  'listingsProviderInfo.Password = Convert.ToHexStringLower(SHA1.HashData(Encoding.UTF8.GetBytes(pw)));', 'AccessToken = row.GetString(1),', 'non_separator_tokens: v6::Setting::NotSet,', 'password = SecureRandom.hex(16)',
  'req.accessTokenId = result.rows[0].id;', 'ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT=#{SecureRandom.alphanumeric(32)}', '  next_token = self.tokens[idx1]', 'export TOKEN=getToken1()', '$token = hash_v2($raw);', 'pass: getPass1(),'];
// The same rows on what still holds a value: a bracket inside a value is not a call, and a literal is a literal whatever it says.
const STILL_VALUE = ['password = abc(def)12xyz', 'password = abc12(def)xyz', 'password=a1b2c3d4e5f6', 'token: a1b2c3d4e5f6a7b8', 'token = tokens1[a]b2c3d4', 'password = "hash_v2(raw)x"', 'secret: "crypto.randomBytes(32)"', "password: 'test1234'", 'password: ${DB_PWD:abc12345}',
  'SECRET_KEY=process1env2value3', 'private_key: MIIBUwIBADANBgkqhkiG9w0BAQEFAASCAT0wggE5AgEAAkEA0vfvyTdGJkdbHkB8mp0f3FE0GYP3AYPaJF7jUd1M0'];

test('[I-16] a right side that is code is no credential, whatever the language; every literal stays refused', () => {
  const { find, scrub } = kit.text.secrets;
  for (const text of CODE_RIGHT) assert.deepEqual(find(text), [], text);
  for (const text of STILL_VALUE) {
    assert.ok(find(text).length > 0, text);
    assert.notEqual(scrub(text), text, `${text}: the value goes`);
  }
});

test('[I-16] a number and a time unit is a duration, not a credential; any other word after the number stays refused', () => {
  const { find, scrub } = kit.text.secrets;
  for (const text of ['ACCESS_TOKEN_UPDATE_FREQUENCY = 24.hours.freeze', 'TOKEN_TTL = 15.minutes', 'session_token_lifetime: 30.days.to_i,', 'API_KEY_EXPIRY=7.days.ago', 'token_ttl = 2.weeks.from_now # refresh']) assert.deepEqual(find(text), [], text);
  for (const text of ['token = 24.hours9freeze', 'token = 12345.abc9def1', 'password = 1234.Abcdefgh', 'password = 1234.abcdefgh', 'password=123.abcdefgh4', 'token = 1234567.days', 'token = 24.hours.freeze.a1b2c3', 'password: "24.hours.freeze"', "password = '30.days.to_i'"]) {
    assert.ok(find(text).length > 0, text);
    assert.notEqual(scrub(text), text, `${text}: the value goes`);
  }
});

test('[I-40] a code file named for a store is judged by its text; the same name on data, or on a sourced script, stays refused', () => {
  const { isSecretFile } = kit.repo;
  const code = ['src/credentials.ts', 'src/secret.service.ts', 'botocore/credentials.py', 'src/secrets.py', 'credentialsProvider.ts', 'app/controllers/api/v1/credentials_controller.rb', 'spec/requests/api/v1/credentials_spec.rb',
    'src/Entities/Security/ApiKey.cs', 'src/routes/api_key.rs', 'tests/auth/api_keys.rs', 'resources/js/pages/ApiKeys.vue', 'app/views/user_mailer/webauthn_credential_added.html.haml', 'docs/credentials.md', 'views/secrets.html'];
  for (const p of code) assert.equal(isSecretFile(p), false, p);
  const data = ['credentials', 'credentials.json', 'a/Credentials.yml', 'credentials.pub', 'CREDENTIALS.json', 'credentials.yml.enc', 'secrets.yml', 'secret.yaml', 'secret.txt', 'SECRETS.env', 'secrets.pub', 'api_keys.json', 'apikey.txt', 'workloads/api-keys.json', 'creds.json',
    'secrets.sh', 'credentials.sh', 'secrets.sql', 'wp-config.php', '.env.js', 'x.env'];
  for (const p of data) assert.equal(isSecretFile(p), true, p);
});

test('[I-40] near names at any depth, test-role paths included; a directory rule beats the template exemption', () => {
  const { isSecretFile, fileRole } = kit.repo;
  const secret = ['env', 'ENV', 'dotenv', '.dotenv', 'env.local', 'env.production', 'env.prod', 'env.txt', 'backend.env.bak', 'prod.env.local', 'app.env.old', 'docker.env.prod', 'prod.env.json', '_env', '.env~', '.env ', '.env#', '.env(1)', '.env copy',
    '.env/production', '.env\\x', '.envs/.production', '.envs/production/.django', 'aws_credentials', 'creds', 'creds.json', 'my-credentials.json', 'app_secrets.json', 'my-secrets.yml', 'secrets', 'secret', 'client_secret.json', 'client_secret_123.json',
    'config/master.key.bak', 'server.key.bak', 'server.pem.bak', 'x.p12.old', 'terraform.tfvars.json', 'x.auto.tfvars.json', 'x.tfplan', 'kube/config', '.kube/config.bak', 'kube.config', 'npmrc', 'pgpass', 'pypirc', 'git-credentials', 'htpasswd', 'my.cnf', '.my.cnf', '.mylogin.cnf',
    '.dockercfg', 'vault-token', '.vault-token', 's3cfg', '.s3cfg', '.boto', 'rsa_key', 'deploy_key', 'ssh/deploy_key', 'passwords.csv', 'passwords.txt', 'pass.txt', 'token', '.token', 'token.txt', 'api_keys.json', 'apikey.txt', 'auth.json', 'oauth.json',
    'serviceAccountKey.json', 'service-account.json', 'firebase-adminsdk-abc.json', 'application_default_credentials.json', 'wp-config.php', 'wp-config.php.bak', '.bash_history', '.zsh_history',
    '.secrets/db.yml', 'a/.secret/x', 'credentials/db.json', 'a/credentials/x.yml', '.azure/accessTokens.json', '.azure/azureProfile.json', '.config/gcloud/application_default_credentials.json', '.config/gcloud/access_tokens.db', '.auth/user.json',
    // a test role changes nothing
    'tests/fixtures/serviceAccountKey.json', 'playwright/.auth/user.json', 'e2e/.auth/state.json', 'cypress/cypress.env.json', 'cypress.env.json', 'fixtures/creds.json', 'test/wp-config.php',
    // a template is exempt from the name rule only
    'secrets/.env.example', '.aws/.env.sample', '.azure/.env.template', 'credentials/.env.example',
    // spellings a reader cannot tell from the name
    '．env', '․env', '.ｅｎｖ', '.e​nv', '​.env'];
  for (const p of secret) assert.equal(isSecretFile(p), true, JSON.stringify(p));
  assert.equal(fileRole('playwright/.auth/user.json').role, 'test', 'the role stays what it was: the secret rule is not a role');
  const read = ['.env.example', 'env.example', 'env.sample', 'cfg/.env.sample', 'src/env.js', 'test/support/env.js', 'build_env.py', 'src/dotenv.js', 'lib/token.js', 'src/password.js', 'src/credentials/index.js', 'pkg/credentials/provider.go', 'src/creds.ts',
    'docs/env.md', 'docs/setup-env.rst', 'views/reset-password.html', 'views/secret-form.html', 'package.json', '.environment', 'environment.yml', 'tokens.json', 'style/design-tokens.json', 'a.key.js', 'pem.md', 'server.pem.pub', 'id_rsa.pub'];
  for (const p of read) assert.equal(isSecretFile(p), false, JSON.stringify(p));
});

test('[I-40] a word in a directory or a stem no longer closes a code or media file; a named secret file stays closed', () => {
  const { isSecretFile } = kit.repo;
  for (const p of ['lib/secrets/rotate.rb', 'app/secrets/store.ts', '.secrets/run.sh', 'secret.mp3', 'assets/sounds/secret.wav', 'secrets/logo.png']) assert.equal(isSecretFile(p), false, p);
  for (const p of ['.env', 'config/master.key', 'server.pem', 'config/credentials.yml.enc', 'config/secrets.yml', 'secrets/db.yml', 'secrets.sh', 'secrets/key.pem']) assert.equal(isSecretFile(p), true, p);
});

test('[I-40] a kubeconfig or an ssh key name holds a store only as data: the same name as source is read', () => {
  const { isSecretFile } = kit.repo;
  const read = ['pkg/cluster/internal/kubeconfig/kubeconfig.go', 'src/kubeconfig_loader.py', 'lib/id_ed25519.go', 'src/id_rsa.ts'];
  assert.deepEqual(read.map(isSecretFile), [false, false, false, false]);
  assert.deepEqual(['kubeconfig', 'ops/kubeconfig.yaml', 'id_ed25519', 'keys/id_rsa.old'].map(isSecretFile), [true, true, true, true], 'near miss: the stores');
});

test('[I-1] remove makes nothing: removing a file under folders that are not there leaves no folder', () => inTmp((dir) => {
  const fs = createFs(dir);
  fs.remove('a/b/c/never.txt');
  assert.deepEqual(nodeFs.readdirSync(dir), []);
  fs.writeAtomic('a/b/x.txt', 'x');
  fs.remove('a/b/x.txt');
  assert.deepEqual([fs.exists('a/b/x.txt'), fs.list('a/b')], [false, []], 'near miss: a file that is there goes, its folder stays');
}));

test('[I-40] isSecretFile: named by path at any depth and any letter case, and nothing a template or a public key needs', () => {
  const { isSecretFile } = kit.repo;
  const secret = ['.env', '.env.local', '.env.production', '.env.prod.local', 'app/.env', 'a/b/.ENV.LOCAL', '.env-local', '.envrc', 'prod.env', 'x.ENV', '.npmrc', 'a/.npmrc', '.netrc', '_netrc', '.pgpass',
    '.pypirc', '.git-credentials', '.htpasswd', '.aws/credentials', 'home/.aws/credentials', '.docker/config.json', 'a/.DOCKER/CONFIG.JSON', '.kube/config', 'kubeconfig', 'ops/kubeconfig.yaml',
    'server.pem', 'a/b/server.key', 'x.KEY', 'x.p12', 'x.pfx', 'x.p8', 'x.ppk', 'x.jks', 'x.keystore', 'x.jceks', 'x.kdbx', 'terraform.tfstate', 'terraform.tfstate.backup', 'prod.tfvars',
    'id_rsa', 'a/id_rsa', 'id_rsa.old', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'ID_ED25519', 'secrets.yml', 'a/secrets.json', 'SECRETS.env', 'secret.yaml', 'credentials', 'credentials.json', 'a/Credentials.yml',
    '.env.pub', 'credentials.pub', 'secrets.pub', 'secrets/db.txt', 'a/secret/x.conf', 'a/.ssh/config', '.ssh/known_hosts', '.gnupg/pubring.kbx', '.aws/config'];
  for (const p of secret) assert.equal(isSecretFile(p), true, p);
  const read = ['.env.example', '.env.sample', '.env.template', 'a/.ENV.EXAMPLE', 'id_rsa.pub', 'a/id_ed25519.pub', 'server.pem.pub', '.environment', 'env.js', 'src/env.ts', 'tests/options.env.test.js', 'docker/config.json',
    'config.json', 'mysecrets.js', 'src/secret-sauce.js', 'keys.js', 'monkey.js', 'a.key.js', 'pem.md', 'lib/credential.js', '.gitignore', 'package.json', 'my-secrets/a.js', 'aws/config', 'ssh/config'];
  for (const p of read) assert.equal(isSecretFile(p), false, p);
});

test('[I-41] the one trace writer never writes a credential: any package, any field, and the fact stays', () => inTmp((dir) => {
  const key = `AKIA${'B'.repeat(16)}`;
  const fs = createFs(dir);
  const writer = createTrace({ fs, clock: { now: () => 't' } }).forPackage('p', { steps: ['s'], isCode: (c) => c === 'c' });
  const returned = writer.record({ run: 'r1', step: 's', ok: false, ref: { file: `a/${key}.js` }, err: { code: 'c', msg: `failed on ${key}` } });
  writer.event('r1', 's', { code: 'c', msg: key });
  const quoted = `a1${'b2'.repeat(8)}`;
  writer.event('r1', 's', { code: 'c', msg: `password: "${quoted}"` }); // JSON escapes these quotes: a scrub of the serialized line would miss it, and could break the line
  const text = fs.readText(kit.trace.tracePath('r1'));
  assert.ok(!text.includes(key) && !text.includes(quoted), 'the credential is on no line');
  const rows = text.trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(rows.map((r) => [r.seq, r.err.code, r.err.msg]), [[1, 'c', 'failed on [aws-access-key]'], [2, 'c', '[aws-access-key]'], [3, 'c', '[quoted-credential]']]);
  assert.equal(rows[0].ref.file, 'a/[aws-access-key].js');
  assert.equal(returned.err.code, 'c');
}));

test('[I-41] a message is scrubbed before it is cut: a key the cap would split never leaves, and the line stays readable', async () => {
  const fs = kit.testing.memoryFs();
  const io = { clock: kit.testing.fixedClock(), trace: createTrace({ fs, clock: kit.testing.fixedClock() }).forPackage('alpha', { steps: ['plan'], isCode: kit.codes.isCode }) };
  const token = `ghp_${'A1b2C3d4E5f6G7h8I9j0'.repeat(2)}`;
  const pad = 'x'.repeat(160); // with the code, the cap of 200 falls inside the key's 40 characters
  const step = kit.traced(io, 'plan', async () => { throw kit.errors.fail('io-read-failed', `${pad} ${token}`); });
  await assert.rejects(step({}, { run: 'r1' }), (e) => isFail(e, 'io-read-failed') && e.message.endsWith(token), 'the thrown error keeps its whole message');
  io.trace.event('r1', 'plan', { code: 'io-read-failed', msg: `${'://:abcdef@'.repeat(14)}${pad}` });
  const text = fs.store.get(kit.trace.tracePath('r1'));
  assert.ok(!text.includes('ghp_A1b2'), 'no prefix of the key is on the line');
  const reader = kit.createValidate({ shapes: kit.trace.SHAPES, enums: { step: ['plan'] }, refuse: kit.trace.REFUSE, isCode: kit.codes.isCode });
  const rows = reader.lines(text, 'TraceRecord');
  assert.equal(rows.length, 2, 'a message the scrub lengthens is still a record its own reader keeps');
  assert.match(rows[0].err.msg, /^io-read-failed: x{160} \[github-token\]$/);
  assert.ok(rows.every((r) => r.err.msg.length <= kit.errors.MSG_CAP && r.err.msg.endsWith('~') === (r.seq === 2)), 'near miss: only the long one is cut, and says so');
});

test('[I-49] the record is scrubbed once and then cut: a cut end that looks like a credential is written as checked', () => {
  const fs = kit.testing.memoryFs();
  const trace = createTrace({ fs, clock: kit.testing.fixedClock() }).forPackage('alpha', { steps: ['plan'], isCode: kit.codes.isCode });
  trace.event('r1', 'plan', { code: 'io-read-failed', msg: `${'x'.repeat(186)} pwd=a1b2c3d4e5f6)` }); // whole, no row matches; cut, `pwd=a1b2c3d4~` would
  trace.event('r1', 'plan', { code: 'io-read-failed', msg: `${'x'.repeat(20)} pwd=a1b2c3d4e5f6` }); // negative: a whole credential is still a label
  const reader = kit.createValidate({ shapes: kit.trace.SHAPES, enums: { step: ['plan'] }, refuse: kit.trace.REFUSE, isCode: kit.codes.isCode });
  const rows = reader.lines(fs.store.get(kit.trace.tracePath('r1')), 'TraceRecord');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].err.msg.length, kit.errors.MSG_CAP);
  assert.ok(rows[0].err.msg.endsWith('~'));
  assert.ok(!rows[1].err.msg.includes('a1b2c3d4'), rows[1].err.msg);
});

test('[I-30] a held folder: nothing under it reaches the disk, and every verb sees what is held over what is there', () => inTmp((dir) => {
  nodeFs.mkdirSync(path.join(dir, 't'));
  nodeFs.writeFileSync(path.join(dir, 't', 'old.ndjson'), 'o\n');
  const fs = createFs(dir, { hold: 't' });
  fs.append('t/run.ndjson', 'a\n');
  fs.append('t/run.ndjson', 'b\n');
  assert.deepEqual([fs.readText('t/run.ndjson'), fs.exists('t/run.ndjson'), fs.list('t')], ['a\nb\n', true, ['old.ndjson', 'run.ndjson']]);
  fs.remove('t/old.ndjson');
  fs.remove('t/run.ndjson');
  assert.deepEqual([fs.exists('t/old.ndjson'), fs.readText('t/run.ndjson'), fs.list('t')], [false, null, []]);
  assert.deepEqual(nodeFs.readdirSync(path.join(dir, 't')), ['old.ndjson'], 'the disk is as it was');
  fs.append('x/y', 'z'); // negative: outside the held folder a write reaches the disk
  assert.equal(nodeFs.readFileSync(path.join(dir, 'x', 'y'), 'utf8'), 'z');
}));

test('[I-30] a held folder answers list and exists for a subfolder of what it holds, as the disk does for the same writes', () => inTmp((dir) => {
  const fs = createFs(dir, { hold: 't' });
  fs.append('r/a/b.ndjson', 'x\n'); // outside the held folder: the disk's own answer is the oracle
  fs.append('t/a/b.ndjson', 'x\n');
  const seen = (top) => [fs.list(top), fs.exists(`${top}/a`), fs.exists(top), fs.list(`${top}/a`)];
  assert.deepEqual(seen('r'), [['a'], true, true, ['b.ndjson']]);
  assert.deepEqual(seen('t'), seen('r'));
  assert.equal(nodeFs.existsSync(path.join(dir, 't')), false, 'nothing held reached the disk');
  assert.deepEqual([fs.list('t/z'), fs.exists('t/z')], [null, false], 'negative: a subfolder nothing holds is absent');
}));

test('[I-30] a held folder keeps a subfolder whose last file was removed, as the disk does', () => inTmp((dir) => {
  const fs = createFs(dir, { hold: 't' });
  for (const top of ['r', 't']) {
    fs.append(`${top}/a/b`, 'x');
    fs.remove(`${top}/a/b`);
    fs.remove(`${top}/n/never`);
  }
  const seen = (top) => [fs.list(top), fs.list(`${top}/a`), fs.exists(`${top}/a`), fs.exists(top), fs.readText(`${top}/a/b`), fs.exists(`${top}/n`)];
  assert.deepEqual(seen('r'), [['a'], [], true, true, null, false]);
  assert.deepEqual(seen('t'), seen('r'));
}));

test('[I-21] a hook trace keeps at least one day: keepDays 0 is refused, never read as "not a hook"', () => {
  const fs = kit.testing.memoryFs();
  assert.throws(() => createTrace({ fs, clock: kit.testing.fixedClock(), keepDays: 0 }), coded('config-invalid'));
  const trace = createTrace({ fs, clock: kit.testing.fixedClock(), keepDays: 1 }).forPackage('alpha', vocab);
  trace.record({ ...rec, run: 'h1' });
  trace.record({ ...rec, run: 'h2' });
  assert.deepEqual(fs.list('.atlasbound/trace'), [kit.trace.dailyPath(kit.testing.fixedClock().now()).split('/').pop()], 'one day file, no run file per call');
});

test('blockEnd: a block ends before the first line indented no deeper, and a blank line ends nothing', () => {
  const { blockEnd, indentOf } = kit.text.lines;
  const py = ['def test_x(', '    client,', ') -> None:', '    r = client.get()', '', '    assert r', 'def other():', '    pass'];
  assert.deepEqual([blockEnd(py, 1), blockEnd(py, 7), indentOf('   '), indentOf('  a')], [6, 8, Infinity, 2]);
  const ts = ['test(', '  "x",', '  async ({', '    page,', '  }) => {', '    await go(page);', '  },', ');', 'test("y", () => {});'];
  assert.deepEqual([blockEnd(ts, 1), blockEnd(ts, 9)], [7, 9]);
});

test('filled fills a word\'s slots once: a value holding a slot is never filled again, and a slot no value names stays', () => {
  const { filled } = kit.text.lines;
  assert.equal(filled('{id}: close it on {branch}', { id: 'a-x', branch: '{id}' }), 'a-x: close it on {id}');
  assert.equal(filled('step {order}: {file} ({gone})', { order: 0, file: 'src/a.js' }), 'step 0: src/a.js ({gone})');
  assert.equal(filled('no slots <task>', {}), 'no slots <task>');
});

test('the host\'s facts, a shape\'s example, an emptied folder, letters without marks and a Windows folder\'s spelling are public', () => inTmp((dir) => {
  const { host, text, paths } = kit;
  assert.deepEqual([host.DRAFTS, host.SHELL_TOOLS], ['.atlasbound/drafts/', { Bash: 'sh', PowerShell: 'powershell' }]);
  assert.equal(host.draftCall('book add x', 'x', '{}'),
    'write this JSON with your Write tool to .atlasbound/drafts/x.json:\n{}\nthen run: book add x --file .atlasbound/drafts/x.json');
  assert.deepEqual(ROWS.example('Row', { fixed: { level: 'high' } }), { value: { name: '<text>', level: 'high' }, optional: ['tags'] });
  assert.deepEqual(Object.keys(ROWS.example('Row', { whole: true }).value), ['name', 'level', 'tags']);
  const fs = createFs(dir);
  fs.writeAtomic('a/x.txt', '1');
  fs.removeEmpty('a');
  assert.equal(fs.exists('a/x.txt'), true, 'a folder that holds a file stays');
  fs.remove('a/x.txt');
  fs.removeEmpty('a');
  assert.equal(fs.exists('a'), false);
  assert.equal(text.lines.unmarked('S\u1eeda \u00c7arp\u0131m'), 'Sua Carp\u0131m', 'a letter Unicode does not take apart stays');
  assert.deepEqual(['C:\\Users\\Ana\\', 'c:/users/ana'].map(paths.winFolder), ['c:/users/ana', 'c:/users/ana']);
}));
