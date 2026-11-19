// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// the oracle is the real shells. Each generated command runs in bash, zsh and dash in an empty folder, and what they create is
// held against writtenBy. A seeded generator, so a failure names the same command every run.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const kit = require('@atlasbound/kit');

// Each fragment is one word a shell reads whole; `@` becomes a fresh file name. Quotes inside double quotes, $'…', ${…} and command substitutions mixed.
const WORDS = ['a', 'x$', '"q$"', '"$\'"', "'s'", "$'e\\'s'", '"${M:-can\'t}"', "${X:-'}'}", '"${X:-$\'z\'}"', '$"d"', '"a\\$"', '"b\\\\"', '"$X"',
  '"$(touch @)"', '$(touch @)', '"${X:-\'$(touch @)\'}"', "'$(touch @)'", "$'$(touch @)'", '"${X:-"$(touch @)"}"', '`touch @`', '${X:-$(touch @)}',
  '"\\"$(touch @)\\""', '"$\'$(touch @)\'"'];
const SHELLS = ['bash', 'zsh', 'dash'].filter((sh) => !spawnSync(sh, ['-c', 'exit 0']).error);
const COUNT = 120;

function generator(seed) {
  let t = seed;
  const next = () => { // mulberry32
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  return (list) => list[Math.floor(next() * list.length)];
}

function commandOf(pick) {
  let n = 0;
  const named = (text) => text.replace(/@/g, () => `f${(n += 1)}`);
  const one = () => {
    const words = Array.from({ length: pick([1, 2, 3]) }, () => pick(WORDS)).join(' ');
    return named(pick([`echo ${words}`, `echo ${words} > @`, `grep -c ${words} /dev/null > @`, 'touch @']));
  };
  return Array.from({ length: pick([1, 2, 3]) }, one).join('; ');
}

const created = (sh, command) => new Promise((resolve) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-shells-'));
  spawn(sh, ['-c', command], { cwd: dir, timeout: 10000, stdio: 'ignore', env: { PATH: '/usr/bin:/bin' } }).on('close', () => {
    const names = fs.readdirSync(dir);
    kit.testing.trash(dir);
    resolve(names);
  });
});
// Kit reads a ' inside a double-quoted ${…} as bash 3.2 and zsh do, a letter; bash 5.2 and later read it as a quote, so they are no oracle there.
const BASH_QUOTES = SHELLS.includes('bash') && Number(spawnSync('bash', ['-c', 'echo $((BASH_VERSINFO[0] * 10 + BASH_VERSINFO[1]))']).stdout) >= 52;
const oracles = (command) => SHELLS.filter((sh) => (sh !== 'dash' || !command.includes("$'")) // dash has no $'…'
  && (sh !== 'bash' || !BASH_QUOTES || !/"[^"]*\$\{[^}]*'/.test(command)));
const madeBy = async (command) => (oracles(command).length ? (await Promise.all(oracles(command).map((sh) => created(sh, command)))).flat() : null);

test('[I-57] generated commands against the real shells: every file a shell creates is named, or the answer is unplaced', { skip: SHELLS.length ? false : 'no bash, zsh or dash here' }, async () => {
  const pick = generator(4011);
  const commands = Array.from({ length: COUNT }, () => commandOf(pick));
  const made = [];
  for (let k = 0; k < COUNT; k += 10) made.push(...await Promise.all(commands.slice(k, k + 10).map(madeBy)));
  for (const [k, command] of commands.entries()) {
    const read = kit.text.shell.writtenBy(command);
    const named = new Set(read.writes.map((w) => w.path));
    const missed = [...new Set(made[k] || [])].filter((file) => !named.has(file));
    assert.ok(read.unplaced || !missed.length, `${command}: the shells create ${missed} that kit does not name`);
    if (made[k]) assert.deepEqual([...named].filter((file) => !made[k].includes(file)), [], `${command}: kit names a file no shell creates`);
  }
});

test('against the real shells an unquoted heredoc body\'s substitutions are read, a quoted one\'s are not', { skip: SHELLS.length ? false : 'no bash, zsh or dash here' }, async () => {
  const cases = [['cat <<E\n$(touch h1)\nE', ['h1']], ['cat <<E\n`touch h2`\nE', ['h2']], ['cat <<\'E\'\n$(touch h3)\nE', []], ['cat <<"E"\n$(touch h3)\nE', []],
    ['echo $(( 2 > 3 ))', []], ['echo "$(( 2 > 3 ))"', []], ['echo $(( $(touch h4; echo 1) > 0 ))', ['h4']], ['echo $( (touch h5) )', ['h5']],
    ['echo $((touch h6) && (touch h7))', ['h6', 'h7']], ['x=$((touch h8) && (touch h9))', ['h8', 'h9']], ['echo $((echo x > h10); (echo y > h11))', ['h10', 'h11']]]; // the last three: a write inside a subshell inside an arithmetic-looking $((
  for (const [command, files] of cases) {
    assert.deepEqual([...new Set(await madeBy(command))].sort(), files, `${command}: the oracle`);
    const read = kit.text.shell.writtenBy(command);
    assert.deepEqual([read.writes.map((w) => w.path), read.unplaced], [files, false], `${command}: the heredoc writes its file and $(( 2 > 3 )) writes none`);
  }
});
