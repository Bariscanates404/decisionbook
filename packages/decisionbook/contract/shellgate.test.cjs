// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Black box: an AI can write every file through Bash (`cat > app/... <<'EOF'`, `python3 - <<EOF ... open(p,'w')`), where no
// edit gate fires and no
// plan is written. So a shell command that writes a protected file meets the Edit gate's own ladder, codes and words, plus one line; and a session cannot finish with
// protected files changed and no plan: Stop blocks once (never twice in a row, the host's stop_hook_active).
const test = require('node:test');
const assert = require('node:assert/strict');
const decisionbook = require('@atlasbound/decisionbook');
const { ROOT, bookWorld, readyOne, writeConfig, asMode, starting, wire, lastN, planRecords } = require('./world.cjs');

const { handlers } = decisionbook;
const shellRuling = (said) => [said.verdict, said.code];
const bash = (command, cwd = ROOT) => ({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command }, cwd });
const LINE = (file) => `this shell command writes ${file}; once the branch's READY plan covers the file, the same command passes`;
// READY is the freeze. A plain protected file a command writes outside the READY plan joins it, said in one line; a danger path
// (here app/db/, a database path) outside it is still the person's
// a file outside the READY plan, as the shell gate asks it: its code and the file the reason names first
const outside = (said) => [...shellRuling(said), (String(said.reason).match(/^DecisionBook gate: plan-outside: ([^:]+): [^\n]*open a new plan for this file/) || [])[1]];
const joined = (io, id) => planRecords(io, id).filter((r) => r.t === 'link' && r.source).map((r) => r.to.slice('file:'.length));
const WRITES_X = [["cat > app/x.rb <<'EOF'\nclass X\nEOF", ROOT], ["cat > ../app/x.rb <<'EOF'\nclass X\nEOF", `${ROOT}/lib`],
  ["cd app && cat > x.rb <<'EOF'\nx\nEOF", ROOT],
  ["python3 - <<'EOF'\nopen('app/x.rb', 'w').write('x')\nEOF", ROOT], ["python3 - <<EOF\np = 'app/x.rb'\nopen(p, 'w').write(body)\nEOF", ROOT],
    ["sed -i 's/X/Y/' app/x.rb", ROOT]];
const READ_ONLY = ['echo hi > /tmp/x', 'cat app/x.rb', 'grep -rn X app | head', 'git diff -- app', 'bundle exec rspec spec/x_spec.rb > tmp/rspec.log 2>&1'];
/** app/** protected, nothing planned. */
function protectedWorld(over = {}) {
  const io = bookWorld({ files: { 'app/x.rb': 'class X\n', '.atlasbound/labels/b.door.json': wire({ id: 'b.door', lock: 'firm' }) }, ...over });
  writeConfig(io, { protect: ['app/**'] });
  return io;
}
const stopping = (over = {}) => ({ hook_event_name: 'Stop', session_id: 's1', stop_hook_active: false, ...over });

test('[I-5] a shell command writing a protected file is denied with no READY plan, from a subfolder and after a cd too',
  async () => {
  const io = protectedWorld();
  for (const [command, cwd] of WRITES_X) {
    const said = await handlers.preShell(bash(command, cwd), io);
    assert.deepEqual(shellRuling(said), ['deny', 'plan-none'], command);
    assert.equal(said.reason,
      `DecisionBook gate: plan-none: app/x.rb: a protected file, and no READY plan on this branch: plan it with one \`atlasbound decisionbook new\` (its fill-in: the plan pack, or atlasbound decisionbook plan <path>)\n${LINE('app/x.rb')}`, command);
  }
  await handlers.preShell(bash(WRITES_X[4][0]), io);
  assert.equal(lastN(io, 'decisionbook.shell').unplaced, 0, 'a name the code assigns one literal is that file, so the trace says it was placed');
  for (const command of READ_ONLY) assert.deepEqual(shellRuling(await handlers.preShell(bash(command), io)),
    ['allow', command.includes('tmp/rspec') ? 'shell-allowed' : 'shell-no-write'], command);
  assert.deepEqual(shellRuling(await handlers.preEdit({ ...bash('rm app/x.rb'), tool_name: 'Bash' }, io)), ['allow', 'gate-not-write-tool'],
    'the Edit gate itself is unchanged');
});

test('[I-5] inside a READY plan every such command is allowed; a file outside it asks, a danger path outside it asks',
  async () => {
  const io = protectedWorld();
  const { id } = await readyOne(io, { plans: ['app/x.rb'] });
  for (const [command, cwd] of WRITES_X) assert.deepEqual(shellRuling(await handlers.preShell(bash(command, cwd), io)), ['allow', 'shell-allowed'], command);
  assert.deepEqual(joined(io, id), [], 'inside the plan: silent, nothing added');
  const danger = await handlers.preShell(bash('echo y > app/db/y.sql && echo x >> app/x.rb'), io);
  assert.deepEqual(shellRuling(danger), ['ask', 'plan-out-of-scope']);
  assert.match(danger.reason,
    /^DecisionBook gate: plan-out-of-scope: app\/db\/y\.sql: a danger path [^\n]* outside the READY plan is the person's, once[^\n]*\nthis shell command writes app\/db\/y\.sql; once the branch's READY plan/);
  const plain = await handlers.preShell(bash('echo y > app/y.rb && echo x >> app/x.rb'), io);
  assert.deepEqual(outside(plain), ['ask', 'plan-outside', 'app/y.rb']);
  assert.match(plain.reason, /\nthis shell command writes app\/y\.rb; /);
  assert.deepEqual(joined(io, id), [], 'an ask joins nothing to the plan, the danger path nothing either');
  const policy = bash(`echo '{"protect":[]}' > .decisionbook/config.json`);
  assert.deepEqual(shellRuling(await handlers.preShell(policy, io)), ['ask', 'policy-narrowed']);
  assert.deepEqual(shellRuling(await handlers.preShell(asMode(policy, 'bypassPermissions'), io)), ['deny', 'policy-narrowed'],
    'where the host asks no one: a deny');
});

test('[I-5] a file another command only reads, lists or globs is never judged',
  async () => {
  const io = protectedWorld();
  const { id } = await readyOne(io, { plans: ['app/x.rb'] });
  const readsAround = `cd ${ROOT}; python3 - <<'EOF'\np='app/x.rb'; s=open(p).read()\nopen(p,'w').write(s)\nEOF\ngit diff --stat app/x.rb; grep -n x app/models/y.rb; ls app/models; grep -rn x app/*.rb`;
  const around = await handlers.preShell(bash(readsAround), io);
  assert.deepEqual([...shellRuling(around), around.context, joined(io, id)], ['allow', 'shell-allowed', undefined, []],
    'the one file written is in the plan; no file only read, listed or globbed joins it');
  const called = (file) => `cd ${ROOT}/app/javascript; python3 - <<'EOF'\ndef edit(p):\n    open(p,'w').write('x')\nedit('${file}')\nEOF`;
  assert.match((await handlers.preShell(bash(called('db/x.sql')), io)).reason, /^DecisionBook gate: plan-out-of-scope: app\/javascript\/db\/x\.sql: /,
    'a function\'s parameter is placed from its call: the danger path it writes is named');
  assert.deepEqual(outside(await handlers.preShell(bash(called('x.ts')), io)), ['ask', 'plan-outside', 'app/javascript/x.ts'],
    'and a plain file it writes is the one named outside the plan');
  const unplaced = `cd ${ROOT}/app/javascript; python3 - <<'EOF'\nfor p in sorted(glob('*.ts')):\n    open(p,'w').write('x')\nEOF`;
  const said = await handlers.preShell(bash(unplaced), io);
  assert.deepEqual([...shellRuling(said), said.reason], ['ask', 'shell-unplaced',
    'DecisionBook gate: shell-unplaced: a write this build cannot place; use Edit for it']);
  assert.deepEqual(lastN(io, 'decisionbook.shell'), { writes: 0, judged: 0, unplaced: 1, decision_ask: 1 }); // the shell gate's verdict counted
  assert.match((await handlers.preShell(bash(`${unplaced}\necho y > ${ROOT}/app/db/y.sql`), io)).reason, /^DecisionBook gate: plan-out-of-scope: app\/db\/y\.sql: /,
    'a placed danger path outside the plan is named first');
  assert.deepEqual(shellRuling(await handlers.preShell(bash(`${unplaced}\necho y > ${ROOT}/app/y.rb`), io)), ['ask', 'plan-outside'],
    'beside a write that cannot be placed, a plain file outside the plan asks by its own name');
  assert.deepEqual(shellRuling(await handlers.preShell(bash(unplaced), bookWorld())), ['allow', 'shell-no-write'], 'nothing protected: nothing to ask');
});

test('[I-5] a repository script a shell runs is read, its writes judged; git merge, pull, rebase and an unread script ask',
  async () => {
  const io = protectedWorld({ files: { 'app/x.rb': 'class X\n', 'tools/fix.sh': 'echo y > app/x.rb\n', 'tools/log.sh': 'echo y > tmp/log\n' } });
  assert.deepEqual(shellRuling(await handlers.preShell(bash('sh tools/fix.sh'), io)), ['deny', 'plan-none']);
  assert.deepEqual(shellRuling(await handlers.preShell(bash('cd tools && bash ./fix.sh', `${ROOT}`), io)), ['allow', 'shell-allowed'],
    'from tools/ the script writes tools/app/x.rb, no protected file');
  assert.deepEqual(shellRuling(await handlers.preShell(bash('bash tools/log.sh'), io)), ['allow', 'shell-allowed']);
  for (const command of ['sh tools/none.sh', 'bash /elsewhere/x.sh', 'git merge feature', 'git pull --rebase', 'git cherry-pick abc', 'git am x.patch',
    'git rebase main']) assert.deepEqual(shellRuling(await handlers.preShell(bash(command), io)), ['ask', 'shell-unplaced'], command);
  const GIT = 'DecisionBook gate: shell-unplaced: git: a git command that changes files it does not name (a merge, rebase, pull, '
    + 'cherry-pick, revert, am, stash, apply or clean), protected ones among them: allow it only if you asked for it, or run it yourself';
  for (const command of ['git merge feature', 'git pull', 'git rebase main', 'git revert HEAD']) {
    assert.equal((await handlers.preShell(bash(command), io)).reason, GIT, `${command}: a sentence that fits git, not "use Edit"`);
  }
  assert.match((await handlers.preShell(bash('sh tools/none.sh'), io)).reason, /use Edit for it$/, 'an unread script keeps its own words');
  assert.deepEqual(shellRuling(await handlers.preShell(bash('git merge feature'), bookWorld())), ['allow', 'shell-no-write'], 'nothing protected');
});

test('[I-5] a folder written is every file under it: where a protect glob reaches under it and the plan does not, it asks',
  async () => {
  const io = protectedWorld({ files: { 'app/x.rb': 'class X\n', 'app/models/y.rb': 'y\n', 'app/javascript/a.ts': 'a\n', 'tmpout/a.txt': 'a\n' } });
  const { id } = await readyOne(io, { plans: ['app/models/**', 'app/javascript/*'] });
  const folderAsk = (folder) => ['ask', 'shell-unplaced',
    `DecisionBook gate: shell-unplaced: ${folder}: a write this build cannot place; use Edit for it\n${LINE(folder)}`];
  const rows = [['rm -rf app', 'app/'], ['npx prettier --write .', './'], ['git checkout -- .', './'], ['bundle exec rubocop -a app/', 'app/'],
    ['cd app && rm -rf .', 'app/'],
    ['npx prettier --write javascript', 'app/javascript/', `${ROOT}/app`], ['rm -rf ..', './', `${ROOT}/app`]];
  for (const [command, folder, cwd] of rows) {
    const said = await handlers.preShell(bash(command, cwd), io);
    assert.deepEqual([...shellRuling(said), said.reason], folderAsk(folder), command);
  }
  assert.deepEqual(lastN(io, 'decisionbook.shell'), { writes: 1, judged: 1, unplaced: 0, folders: 1, decision_ask: 1 }); // counts the verdict
  for (const command of ['rm -rf tmpout', 'rm -rf tmpout/ && npx prettier --write tmpout', 'bundle exec rubocop -a app/models/', 'rm -rf app/models/y.rb']) {
    assert.deepEqual(shellRuling(await handlers.preShell(bash(command), io)), ['allow', 'shell-allowed'],
      `${command}: no glob reaches it, or the plan covers all of it`);
  }
  assert.match((await handlers.preShell(bash('rm -rf app/db/x.sql app'), io)).reason, /^DecisionBook gate: plan-out-of-scope: app\/db\/x\.sql: /,
    'a danger path named outside the plan is asked by its own name first');
  assert.deepEqual(joined(io, id), [], 'a folder written joins nothing to the plan');
  const named = await handlers.preShell(bash('rm -rf app/x.rb app'), io);
  assert.deepEqual([...outside(named), joined(io, id)], ['ask', 'plan-outside', 'app/x.rb', []],
    'a plain file named outside the plan asks by its name and joins nothing');
  assert.deepEqual(shellRuling(await handlers.preShell(bash('rm -rf app'), bookWorld({ files: { 'app/x.rb': 'x\n' } }))), ['allow', 'shell-allowed'],
    'nothing protected: nothing to ask');
});

test('[I-5] a glob is the folder before its first wildcard, and a copy lands each source in its folder',
  async () => {
  const io = protectedWorld({ files: { 'app/x.rb': 'class X\n', 'app/models/y.rb': 'y\n', 'app/javascript/a.ts': 'a\n', 'tmpout/a.txt': 'a\n',
    '.atlasbound/labels/b.door.json': wire({ id: 'b.door', lock: 'firm' }) } });
  await readyOne(io, { plans: ['app/x.rb', 'app/models/**'] });
  const folderAsk = (folder) => ['ask', 'shell-unplaced',
    `DecisionBook gate: shell-unplaced: ${folder}: a write this build cannot place; use Edit for it\n${LINE(folder)}`];
  const rows = [['rm -rf ap*', './'], ['npx prettier --write "**/*.rb"', './'], ["npx eslint --fix 'app/**/*.js'", 'app/'],
    ["sed -i '' 's/a/b/' */models/y.rb", './'], ['rm -rf {app,tmp}', './'],
    ['cp -r /tmp/x/* app/javascript/', 'app/javascript/'], ['cp -r /tmp/app .', 'app/'], [`rm -rf ${ROOT}/..`, './'], ['rm -rf .decisionbook', '.decisionbook/'],
      ['mv .decisionbook /tmp/old', '.decisionbook/'],
    ['git checkout .', './'], ['rsync -a /tmp/new/ .', './'], ['cp -R /tmp/new/ .', './'], ['cp -R /tmp/new/. app', 'app/']]; // a source's contents land in the folder
  for (const [command, folder] of rows) {
    const said = await handlers.preShell(bash(command), io);
    assert.deepEqual([...shellRuling(said), said.reason], folderAsk(folder), command);
  }
  for (const [command, code] of [['rm -rf .decisionbook', 'policy-narrowed']]) {
    assert.deepEqual(shellRuling(await handlers.preShell(asMode(bash(command), 'bypassPermissions'), io)), ['deny', code],
      `${command}: where the host asks no one, the person's deny stands`);
  }
  for (const [command, file] of [['git checkout app/db/a.sql', 'app/db/a.sql'], ['git checkout HEAD~1 app/db/a.sql', 'app/db/a.sql']]) {
    assert.match((await handlers.preShell(bash(command), io)).reason, new RegExp(`^DecisionBook gate: plan-out-of-scope: ${file}: `),
      `${command}: a guarded danger path git brings back`);
  }
  for (const [command, file] of [['git checkout app/javascript/a.ts', 'app/javascript/a.ts'], ['git checkout app/gone.rb', 'app/gone.rb'],
    ['git checkout HEAD~1 app/javascript/b.ts', 'app/javascript/b.ts']]) {
    const said = await handlers.preShell(bash(command), io);
    assert.deepEqual(outside(said), ['ask', 'plan-outside', file], `${command}: a file there, or a guarded one git brings back, is judged: outside the plan`);
  }
  for (const [command, code] of [['rm -rf tmpout/*', 'shell-allowed'], ['rm -rf app/models/*', 'shell-allowed'], ['rm .decisionbook/notes.md', 'shell-allowed'],
    ['git checkout app/x.rb', 'shell-allowed'],
    ['git checkout main', 'shell-no-write'], ['git checkout -b fix origin/main', 'shell-no-write'], ['git checkout docs/guide.md', 'shell-no-write']]) {
    assert.deepEqual(shellRuling(await handlers.preShell(bash(command), io)), ['allow', code],
      `${command}: nothing guarded under it, the plan covers it, or a branch`);
  }
  assert.deepEqual(shellRuling(await handlers.preShell(bash('rm -rf .decisionbook'), bookWorld({ files: { 'app/x.rb': 'x\n' } }))), ['allow', 'shell-allowed'],
    'nothing protected: the store is free');
});

test('[I-5] a parameter rebuilt inside its function never reaches the calls outside it, so two planned files stay silent',
  async () => {
  const io = protectedWorld({ files: { 'app/lib/types/items.ts': 'a\n', 'app/lib/reducers/list.js': 'a\n' } });
  const { id } = await readyOne(io, { plans: ['app/lib/types/items.ts', 'app/lib/reducers/list.js'] });
  const command = `cd ${ROOT}; python3 - <<'EOF'\nimport os\nB='app/lib/'\ndef rep(p,a,b,count=1):\n    p=B+p\n    s=open(p).read()\n    assert s.count(a)==count,(p,a,s.count(a))\n    s=s.replace(a,b); open(p,'w').write(s)\nrep('types/items.ts',"""a""","""b""")\np='reducers/list.js'\nrep(p,"""a""","""b""")\nEOF`;
  const silent = await handlers.preShell(bash(command), io);
  assert.deepEqual([...shellRuling(silent), silent.context, joined(io, id)], ['allow', 'shell-allowed', undefined, []]);
  const { writes, judged, unplaced } = lastN(io, 'decisionbook.shell');
  assert.deepEqual({ writes, judged, unplaced }, { writes: 2, judged: 2, unplaced: 0 }, 'the two files written, each placed and judged');
  assert.deepEqual(outside(await handlers.preShell(bash(command.replace("p='reducers/list.js'", "p='reducers/other.js'")), io)),
    ['ask', 'plan-outside', 'app/lib/reducers/other.js'], 'its near miss: the other file is named, outside the plan');
  assert.match((await handlers.preShell(bash(command.replace("p='reducers/list.js'", "p='db/list.sql'")), io)).reason,
    /^DecisionBook gate: plan-out-of-scope: app\/lib\/db\/list\.sql: /, 'and a danger path there is named and asked');
});

test('[I-5] the step runs within its budget: past it, it asks saying the command was too long to read, never silent',
  async () => {
  // each reading 2 s after the one before: past the budget at once
  const late = (io) => { let ms = 0; io.clock = { ...io.clock, elapsedMs: () => (ms += 2000) }; return io; };
  const io = late(protectedWorld());
  const said = await handlers.preShell(bash('echo y > app/y.rb; rm app/x.rb'), io);
  assert.deepEqual([...shellRuling(said), said.reason], ['ask', 'shell-unplaced',
    'DecisionBook gate: shell-unplaced: too long to read: a write this build cannot place; use Edit for it']);
  assert.deepEqual(lastN(io, 'decisionbook.shell'), { writes: 0, judged: 0, unplaced: 1, unread: 1, decision_ask: 1 });
  assert.deepEqual(shellRuling(await handlers.preShell(bash('echo y > app/y.rb'), late(bookWorld()))), ['allow', 'shell-no-write'],
    'nothing protected: nothing to ask');
  assert.deepEqual(shellRuling(await handlers.preShell(bash('echo y > app/y.rb'), protectedWorld())), ['deny', 'plan-none'],
    'in time, the same command is judged');
});

test('[I-5] an error thrown reading or judging is no verdict: the step rejects with it and its trace row is not ok',
  async () => {
  const failing = (io, err) => Object.assign(io, { fs: { ...io.fs, keyAt: () => { throw err; } } });
  const tooLong = Object.assign(new Error('name too long'), { code: 'ENAMETOOLONG' });
  const io = failing(protectedWorld(), tooLong);
  await assert.rejects(handlers.preShell(bash('rm app/x.rb'), io), { code: 'ENAMETOOLONG' });
  const row = io.fs.readText('.atlasbound/trace/r1.ndjson').trim().split('\n').map((line) => JSON.parse(line)).filter((r) => r.step === 'decisionbook.shell').at(-1);
  assert.deepEqual([row.ok, row.err], [false, { code: 'unexpected-error', msg: 'Error' }]);
  await assert.rejects(handlers.preShell(bash('rm app/x.rb'), failing(protectedWorld(), new TypeError('x'))), TypeError, 'any error, coded or not');
  await assert.rejects(handlers.preShell(bash('rm app/x.rb'), failing(bookWorld(), tooLong)), { code: 'ENAMETOOLONG' },
    'a failure trusts nothing it would read next, the policy included');
  assert.deepEqual(shellRuling(await handlers.preShell(bash('rm app/x.rb'), protectedWorld())), ['deny', 'plan-none'],
    'near miss: the same command, nothing thrown, is judged');
  assert.deepEqual(shellRuling(await handlers.preShell(bash('echo hi'), failing(protectedWorld(), tooLong))), ['allow', 'shell-no-write'],
    'nothing written, nothing to place: nothing fails');
});

test('[I-5] a cd chain is followed only while its folder is a path a disk opens; one past 4096 characters asks instead',
  async () => {
  const io = protectedWorld();
  const deep = (n) => `${`cd ${'a'.repeat(100)}; `.repeat(n)}${'cd ..; '.repeat(n)}rm app/x.rb`;
  const said = await handlers.preShell(bash(deep(50)), io);
  assert.deepEqual([...shellRuling(said), said.reason], ['ask', 'shell-unplaced',
    'DecisionBook gate: shell-unplaced: too long to read: a write this build cannot place; use Edit for it']);
  assert.deepEqual(lastN(io, 'decisionbook.shell'), { writes: 1, judged: 0, unplaced: 0, unread: 1, decision_ask: 1 });
  assert.deepEqual(shellRuling(await handlers.preShell(bash(deep(30)), io)), ['deny', 'plan-none'],
    'near miss: 3,000 characters deep is followed, and lands on app/x.rb');
});

test('[I-26] Stop blocks once on a protected file this session changed with no plan covering it',
  async () => {
  const io = protectedWorld({ changed: ['app/old.rb'], files: { 'app/x.rb': 'class X\n', 'app/old.rb': 'old\n' }, begun: null }); // its own start below
  assert.equal((await handlers.start(starting(), io)).code, 'start-kept');
  assert.deepEqual(shellRuling(await handlers.stop(stopping(), io)), ['allow', 'stop-clean'],
    'dirty when the session began, the same bytes now: not this session\'s');
  Object.assign(io.state, { commits: [{ sha: 'c1', subject: 'poll options', body: '', files: ['app/x.rb', 'README.md'], after: 'h0' }],
    changed: ['app/old.rb', 'app/new.rb'] });
  io.fs.writeAtomic('app/new.rb', 'new\n');
  const blocked = await handlers.stop(stopping(), io);
  assert.deepEqual([...shellRuling(blocked), blocked.files], ['deny', 'stop-unrecorded', ['app/x.rb', 'app/new.rb']]);
  assert.equal(blocked.reason,
    'DecisionBook: stop-unrecorded: app/x.rb, app/new.rb: protected files changed in this session and no READY or closed plan of this branch covers them: record '
      + 'this change in a plan (why, the decisions, the files) before you finish');
  assert.deepEqual(lastN(io, 'decisionbook.stop'), { kept: 1, changed: 3, moved: 2, unrecorded: 2, decision_deny: 1 }); // Stop's block counted
  const stopRow = io.fs.readText('.atlasbound/trace/r1.ndjson').trim().split('\n').map((line) => JSON.parse(line)).findLast((r) => r.step === 'decisionbook.stop');
  assert.equal(stopRow.ref.file, 'app/x.rb', 'the Stop row names its first file, as every hook row does (before: null)');
  assert.deepEqual(shellRuling(await handlers.stop(stopping({ stop_hook_active: true }), io)), ['allow', 'stop-repeat'],
    'the host already continues because of a block: never twice in a row');
  assert.equal(lastN(io, 'decisionbook.stop').unrecorded, 2, 'and the trace says what it saw');
  io.fs.writeAtomic('app/old.rb', 'changed in this session\n');
  assert.deepEqual((await handlers.stop(stopping(), io)).files, ['app/x.rb', 'app/old.rb', 'app/new.rb']);
  assert.equal((await handlers.start(starting(), io)).code, 'start-kept', 'a resumed or compacted session keeps the head it began on');
  assert.deepEqual((await handlers.stop(stopping(), io)).files, ['app/x.rb', 'app/old.rb', 'app/new.rb']);
  await readyOne(io, { plans: ['app/x.rb', 'app/old.rb', 'app/new.rb'] });
  assert.deepEqual(shellRuling(await handlers.stop(stopping(), io)), ['deny', 'stop-unclosed'], 'a READY plan of this branch covers them: the turn is held for its close');
  assert.deepEqual(shellRuling(await handlers.stop(stopping(), io)), ['allow', 'stop-clean'], 'once: the tree is as it was told');
});

test('[I-26] Stop with no start kept reads only uncommitted changes and says so; nothing protected reads no git at all', async () => {
  const io = protectedWorld({ changed: ['app/new.rb'], commits: [{ sha: 'c1', subject: 'x', body: '', files: ['app/x.rb'], after: 'h0' }] });
  assert.deepEqual((await handlers.stop(stopping({ session_id: 's2' }), io)).files, ['app/new.rb']);
  assert.equal(lastN(io, 'decisionbook.stop').kept, 0);
  const bare = bookWorld({ changed: ['app/x.rb'] });
  bare.git.statusZ = async () => assert.fail('no git read where nothing is protected');
  bare.git.head = bare.git.statusZ;
  assert.deepEqual(shellRuling(await handlers.start(starting(), bare)), [undefined, 'gate-off']);
  assert.deepEqual(shellRuling(await handlers.stop(stopping(), bare)), ['allow', 'gate-off']);
});

test('a command that sets, unsets or clears a host session variable is denied, however it is wrapped; one that names it passes', async () => {
  const io = protectedWorld();
  const powershell = (command) => ({ ...bash(command), tool_name: 'PowerShell' });
  const run = 'atlasbound decisionbook add p x';
  const denied = [`CLAUDE_CODE_SESSION_ID=session-a ${run}`, 'env CLAUDE_PID=1 atlasbound decisionbook show', `CLAUDE_CODE_SESSION_ID+=2 ${run}`,
    'export CLAUDE_PROJECT_DIR=/elsewhere; atlasbound decisionbook ready', 'unset CLAUDE_CODE_SESSION_ID && atlasbound debug',
    'declare -x CLAUDE_PID=1; atlasbound debug', 'env -u CLAUDE_CODE_SESSION_ID atlasbound decisionbook show', `export "CLAUDE_PID=1"; ${run}`,
    `sh -c "CLAUDE_CODE_SESSION_ID=other ${run}"`, "bash -c 'export CLAUDE_PROJECT_DIR=/elsewhere; atlasbound decisionbook ready'",
    'eval "CLAUDE_PID=1 atlasbound decisionbook show"', `env -i PATH=/usr/bin:/bin ${run}`, `env - ${run}`, `env -S "CLAUDE_PID=1 ${run}"`,
    `env "CLAUDE_CODE_SESSION_ID=s2" ${run}`, `read CLAUDE_CODE_SESSION_ID <<< s2; ${run}`, `echo \\' ; CLAUDE_PID=2 ${run} ; echo \\'`,
    `echo $(CLAUDE_PID=3 ${run})`, `for CLAUDE_PID in 1; do ${run}; done`, `printf -v CLAUDE_PID 1; ${run}`, powershell(`$env:CLAUDE_CODE_SESSION_ID = 'a'; ${run}`), powershell(`Set-Item env:CLAUDE_PID 1; ${run}`),
    powershell(`Remove-Item Env:\\CLAUDE_PROJECT_DIR; ${run}`), powershell(`[Environment]::SetEnvironmentVariable('CLAUDE_PID', '1'); ${run}`)];
  for (const event of denied.map((one) => (typeof one === 'string' ? bash(one) : one))) {
    const said = await handlers.preShell(event, io);
    assert.deepEqual(shellRuling(said), ['deny', 'shell-host-env'], event.tool_input.command);
    assert.match(said.reason, /CLAUDE_(CODE_SESSION_ID|PID|PROJECT_DIR)/u, event.tool_input.command);
  }
  for (const command of ['echo $CLAUDE_CODE_SESSION_ID', 'echo "${CLAUDE_PROJECT_DIR}"', 'atlasbound decisionbook show', 'declare -p CLAUDE_PID',
    'grep -rn CLAUDE_PROJECT_DIR .claude/', 'git commit -m "the gate denies CLAUDE_CODE_SESSION_ID=a and export CLAUDE_PID"',
    'echo export CLAUDE_PID', 'env LANG=C atlasbound decisionbook show', 'export -p', 'printf %s CLAUDE_PID', 'export PATH="$PATH:/opt/bin"',
    'for f in *.rb; do wc -l "$f"; done', 'export $(cat .env)', 'read -r line < "$FILE"', 'FOO=$BAR make test']) {
    assert.equal((await handlers.preShell(bash(command), io)).verdict, 'allow', command);
  }
});
