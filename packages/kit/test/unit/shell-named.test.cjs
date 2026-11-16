// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// kit's reader of a command's text: a product's verb is named bare or through any wrapper; a command that names neither passes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { text: { shell: { verbNamed } } } = require('@atlasbound/kit');

const NAMES = ['atlasbound', 'atlasbound.cjs'];
const ROWS = [{ words: ['modules', 'off'] }, { words: ['uninstall'] }, { words: ['protect'], when: ['--none'] },
  { words: ['toy', 'sweep'], when: ['--yes'] }, { words: ['handoff', 'drop'] }];
const verbIn = (command) => (verbNamed(command, NAMES, ROWS) || { words: [] }).words.join(' ');

test('a verb is named bare, by a path, in any case of the name, and with a flag before or after its words', () => {
  const bare = ['atlasbound modules off decisionbook', '/usr/local/bin/atlasbound modules off db', 'node packages/cli/bin/atlasbound.cjs modules off x',
    'ATLASBOUND modules off x', 'atlasbound --target /repo modules off x', 'npx atlasbound modules --json off x'];
  for (const command of bare) assert.equal(verbIn(command), 'modules off', command);
  assert.equal(verbIn('atlasbound protect --none'), 'protect');
  assert.equal(verbIn('atlasbound --none protect'), 'protect', 'the flag that narrows the row may stand before its words');
  assert.equal(verbIn('atlasbound toy sweep --yes=1'), 'toy sweep');
  assert.equal(verbIn('atlasbound uninstall --purge'), 'uninstall');
});

test('a verb is named through a wrapper: a multiplexer, a detached shell, an interpreter, a heredoc, a file written and run', () => {
  const wrapped = [
    'tmux -L x new-session -d "env -u CLAUDECODE -u AI_AGENT atlasbound modules off decisionbook"',
    'screen -dmS s sh -c \'atlasbound modules off decisionbook\'',
    'nohup sh -c "sleep 4; atlasbound modules off decisionbook" >/dev/null 2>&1 &',
    'setsid bash -c "env -i PATH=$PATH atlasbound modules off decisionbook"',
    'script -q /dev/null atlasbound modules off decisionbook',
    'osascript -e \'tell application "Terminal" to do script "atlasbound modules off decisionbook"\'',
    'launchctl submit -l x -- /bin/sh -c "atlasbound modules off decisionbook"',
    'echo "atlasbound modules off decisionbook" | at now',
    'python3 -c "import os; os.system(\'atlasbound modules off decisionbook\')"',
    'node -e "require(\'child_process\').execSync(\'atlasbound modules off decisionbook\')"',
    'bash <<EOF\natlasbound modules off decisionbook\nEOF',
    'cat > /tmp/x.sh <<EOF\natlasbound modules off decisionbook\nEOF\ntmux new -d "bash /tmp/x.sh"',
    'tmux send-keys -t s "atlasbound modules" Space "off decisionbook" Enter',
    'A=atlasbound; $A modules off decisionbook',
    'at""lasbound mod\'\'ules o\\ff decisionbook',
  ];
  for (const command of wrapped) assert.equal(verbIn(command), 'modules off', command);
  // a verb or its flag glued to an interpreter's code is still a word
  const glued = [['python3 -c "import pty; pty.spawn(\'atlasbound protect --none\'.split())"', 'protect'],
    ['python3 -c "import pty; pty.spawn(\'atlasbound uninstall\'.split())"', 'uninstall'], ['ruby -e "exec(%w[atlasbound modules off])"', 'modules off'],
    ['node -e "spawnSync(\'atlasbound\',[\'toy\',\'sweep\',\'--yes\'])"', 'toy sweep'], ['sh -c atlasbound:handoff:drop', 'handoff drop']];
  for (const [command, verb] of glued) assert.equal(verbIn(command), verb, command);
});

test('a command that names no verb of the product, or the product with another verb, names none', () => {
  const free = ['atlasbound status', 'atlasbound modules', 'atlasbound modules on handoff', 'atlasbound protect --source', 'atlasbound toy sweep --dry-run',
    'npm uninstall left-pad', 'git commit -m "turn the modules off"', 'grep -rn "modules off" docs', 'atlasbound handoff keep', '', null];
  for (const command of free) assert.equal(verbIn(command), '', String(command));
  assert.equal(verbIn(`atlasbound status ${'x '.repeat(12)}modules off`), '', 'a verb word further than the reach from the name is another command\'s');
});

test('the named limit: a name or a verb the text never holds is not seen', () => {
  assert.equal(verbIn('B=atlas; ${B}bound modules off x'), '', 'the name is built when the command runs');
  assert.equal(verbIn('atlasbound $(echo bW9kdWxlcw== | base64 -d) off x'), '', 'the verb is decoded when the command runs');
});
