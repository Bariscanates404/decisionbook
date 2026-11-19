// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The port's seal and the disk: a name the disk cannot hold names no file of the product's, any other disk error is the port's to note.
const test = require('node:test');
const assert = require('node:assert/strict');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io: kitIo } = require('@atlasbound/kit');
const { portGates } = require('../../steps/sealed.cjs');

const HOST_FILES = { settings: '.claude/settings.local.json', ignore: '.gitignore', marks: ['# begin', '# end'],
  whole: () => ['.claude/settings.json', '.claude/commands/decide.md'] };
const USER = require('../../contracts/host.json').hostUser;
const throwingIo = (code) => ({ root: '/repo', home: null, run: 'r1', sessionWrites: () => [], host: { ownFiles: HOST_FILES, user: USER }, env: { get: () => null },
  packages: { declared: () => ({ manifests: [] }) }, clock: { elapsedMs: () => 0 }, machine: { bin: '/x/atlasbound.cjs' }, catalog: { verbs: [] },
  fs: { keyAt: () => { throw Object.assign(new Error(code), { code }); } } });
const WRITE = { tool_name: 'Write', tool_input: { file_path: '/repo/lib/a.cjs', content: 'x' } };
const SHELL = { tool_name: 'Bash', tool_input: { command: 'rm lib/a.cjs' } };

// A repository and a home on the real disk, wired as setup leaves them: hook rows in the local settings file, one command file placed.
const WIRED = `${JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'atlasbound hook PreToolUse' }] }] } }, null, 2)}\n`;
function wiredIo({ configDir = null } = {}) {
  const [repo, home, config] = ['repo', 'home', 'config'].map((name) => nodeFs.realpathSync(nodeFs.mkdtempSync(path.join(os.tmpdir(), `cli-sealed-${name}-`))));
  const io = { root: repo, fs: kitIo.createFs(repo), home: kitIo.createFs(home), run: 'r1', sessionWrites: () => [], host: { ownFiles: HOST_FILES, user: USER },
    env: { get: (name) => (name === USER.env && configDir ? config : null) }, machine: { bin: '/x/atlasbound.cjs', fsAt: kitIo.createFs },
    catalog: { verbs: [] }, clock: { elapsedMs: () => 0 }, trace: { event: () => {} } };
  io.fs.writeAtomic('.claude/settings.local.json', WIRED);
  return { io, repo, home, config };
}
const OFF = '{"disableAllHooks": true}';
const toolAt = (file, name) => ({ Write: { file_path: file, content: OFF }, Edit: { file_path: file, old_string: '{', new_string: '{"disableAllHooks": true,' },
  MultiEdit: { file_path: file, edits: [{ old_string: '{', new_string: '{"disableAllHooks": true,' }] } }[name]);
/** The seal's answer to one tool call -> [verdict, the file it names], or null where it says nothing. */
function sealAnswer(io, tool, input, mode = 'default') {
  const [found] = portGates(io, 'PreToolUse', { tool_name: tool, tool_input: input, cwd: io.root, permission_mode: mode }, [{ sealed: ['.decisionbook/'] }]);
  return found ? [found.verdict, /^atlasbound: own-file: (.*?): AtlasBound's own file, or a host settings file/.exec(found.reason)?.[1] ?? found.reason] : null;
}

test('every write path asks before a file that can switch the gate off: host settings here and in the home, a placed command', () => {
  const { io, repo, home } = wiredIo();
  const files = [[`${repo}/.claude/settings.json`, '.claude/settings.json'], [`${home}/.claude/settings.json`, '~/.claude/settings.json'],
    [`${home}/.claude/settings.local.json`, '~/.claude/settings.local.json'], [`${repo}/.claude/commands/decide.md`, '.claude/commands/decide.md'],
    [`${repo}/.claude/settings.local.json`, '.claude/settings.local.json']]; // the last: the wired file, its hook rows kept and the off switch added
  const byTool = files.flatMap(([file, said]) => ['Write', 'Edit', 'MultiEdit'].map((tool) => [`${tool} ${said}`, sealAnswer(io, tool, toolAt(file, tool)), said]));
  const shells = [['Bash', `echo '${OFF}' > .claude/settings.json`, '.claude/settings.json'], ['Bash', `echo '${OFF}' > ${home}/.claude/settings.json`, '~/.claude/settings.json'],
    ['Bash', `echo '${OFF}' > ~/.claude/settings.json`, '.claude/settings.json'], ['Bash', `sed -i 's/{/{"disableAllHooks":true,/' "$HOME/.claude/settings.local.json"`, '.claude/settings.local.json'],
    ['Bash', `cd ~/.claude && echo '${OFF}' > settings.json`, '.claude/settings.json'], ['Bash', `rm -rf ${home}/.claude`, '~/.claude/'],
    ['Bash', 'echo x >> .claude/commands/decide.md', '.claude/commands/decide.md'],
    ['PowerShell', `Set-Content -Path .claude\\settings.json -Value '${OFF}'`, '.claude/settings.json'],
    ['PowerShell', `Set-Content "$env:USERPROFILE\\.claude\\settings.json" '${OFF}'`, '.claude/settings.json'],
    ['PowerShell', `$p=".claude\\settings.local.json"; Set-Content $p '${OFF}'`, '.claude/settings.local.json'],
    ['PowerShell', 'Add-Content .claude\\commands\\decide.md x', '.claude/commands/decide.md']]
    .map(([tool, command, said]) => [`${tool} ${command}`, sealAnswer(io, tool, { command }), said]);
  const paths = [...byTool, ...shells];
  assert.deepEqual(paths.map(([name, got]) => [name, got]), paths.map(([name, , said]) => [name, ['ask', said]]));
  assert.deepEqual(sealAnswer(io, 'Write', toolAt(`${home}/.claude/settings.json`, 'Write'), 'bypassPermissions'), ['deny', '~/.claude/settings.json'],
    'where no one is asked, the ask is a refusal');
  const free = [['Write', { file_path: `${repo}/.claude/commands/mine.md`, content: 'my own command\n' }], ['Write', { file_path: `${home}/.claude/CLAUDE.md`, content: 'x' }],
    ['Write', { file_path: `${repo}/.claude/settings.local.json`, content: WIRED.replace('{', '{"env": {"MINE": "1"},') }], ['Write', { file_path: `${repo}/lib/a.cjs`, content: 'x' }],
    ['Bash', { command: 'cat ~/.claude/settings.json .claude/commands/decide.md' }], ['Bash', { command: `echo x > ${home}/notes.txt` }]];
  assert.deepEqual(free.map(([tool, input]) => sealAnswer(io, tool, input)), free.map(() => null), 'a person\'s own command, any other file, a read: no answer');
});

test('a settings file spelled in another case, there or not yet, is the host\'s file on a disk that folds case', () => {
  const { io, repo, home } = wiredIo();
  const asked = [['Write', toolAt(`${repo}/.claude/Settings.json`, 'Write'), '.claude/Settings.json'], ['Write', toolAt(`${home}/.claude/Settings.Local.json`, 'Write'), '~/.claude/Settings.Local.json'],
    ['Write', toolAt(`${home}/.Claude/SETTINGS.json`, 'Write'), '~/.Claude/SETTINGS.json'], ['Write', toolAt(`${repo}/.claude/Commands/Decide.md`, 'Write'), '.claude/Commands/Decide.md'],
    ['Bash', { command: `echo '${OFF}' > .claude/Settings.json` }, '.claude/Settings.json'], ['Bash', { command: `cd ~/.claude && echo '${OFF}' > Settings.json` }, '.claude/settings.json'],
    ['PowerShell', { command: `Set-Content .claude\\SETTINGS.JSON '${OFF}'` }, '.claude/SETTINGS.JSON']];
  assert.deepEqual(asked.map(([tool, input]) => sealAnswer(io, tool, input)), asked.map(([, , said]) => ['ask', said]));
  assert.equal(sealAnswer(io, 'Write', { file_path: `${repo}/.claude/Settings.md`, content: 'x' }), null, 'another name is another file');
});

test('a shell command that copies into the repository folder, or a folder\'s contents over it, is judged where it lands', () => {
  const { io, home } = wiredIo();
  const asked = [['cp -R /tmp/evil/.claude .', '.claude/'], ['mv /tmp/evil/.claude .', '.claude/'], ['cp /tmp/evil/settings.json .claude/', '.claude/settings.json'],
    ['cp /tmp/evil/settings.json /tmp/evil/x.txt .claude', '.claude/settings.json'], ['cp -R /tmp/evil/commands .claude/', '.claude/commands/'],
    ['cp -R /tmp/evil/ .', './'], ['rsync -a /tmp/evil/ .', './'], ['cp -R /tmp/evil/. .', './'],
    [`cp -R /tmp/evil/.claude ${home}`, '~/.claude/'], [`rsync -a /tmp/evil/ ${home}`, '~/./']];
  assert.deepEqual(asked.map(([command]) => [command, sealAnswer(io, 'Bash', { command })]), asked.map(([command, said]) => [command, ['ask', said]]));
  assert.deepEqual(sealAnswer(io, 'PowerShell', { command: 'Copy-Item -Recurse C:\\evil\\.claude .' }), ['ask', '.claude/']);
  const free = ['cp /tmp/x.txt .', 'cp /tmp/x.txt /tmp/y.txt lib/', 'mv /tmp/a.txt /tmp/b.txt .', 'cp -R /tmp/evil/src .', 'rm -rf lib', 'cp /tmp/x.txt .claude/',
    'mv /tmp/evil/build/ .', 'git checkout .', 'npx prettier --write .']; // a move lands the folder by its name; a rewrite in place brings nothing in
  assert.deepEqual(free.map((command) => [command, sealAnswer(io, 'Bash', { command })]), free.map((command) => [command, null]));
});

test('where the host keeps the user\'s settings in a folder its env names, those are the files asked for', () => {
  const { io, home, config } = wiredIo({ configDir: true });
  assert.deepEqual(['settings.json', 'settings.local.json'].map((name) => sealAnswer(io, 'Write', toolAt(`${config}/${name}`, 'Write'))),
    [['ask', `${config}/settings.json`], ['ask', `${config}/settings.local.json`]]);
  assert.equal(sealAnswer(io, 'Write', toolAt(`${home}/.claude/settings.json`, 'Write')), null, 'the home\'s is not the host\'s there');
});

test('the seal answers nothing for a name the disk cannot hold, and lets every other disk error reach the port', () => {
  for (const payload of [WRITE, SHELL]) {
    assert.deepEqual(portGates(throwingIo('ENAMETOOLONG'), 'PreToolUse', payload, []), [], `${payload.tool_name}: no own file is named so`);
    assert.throws(() => portGates(throwingIo('EIO'), 'PreToolUse', payload, []), { code: 'EIO' }, `${payload.tool_name}: a disk error is never silence`);
  }
});
