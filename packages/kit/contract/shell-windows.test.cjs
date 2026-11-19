// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Black box: the shell owner reads Windows' two shells as it reads bash: a PowerShell or cmd text run from bash (powershell -Command,
// pwsh -c, cmd /c) and the PowerShell tool's own text name the files they write, with a backslash read as a folder's separator; a write it
// cannot place (a variable, a pipeline's items, an unknown parameter, an encoded command, a shell started by Start-Process) is `unplaced`,
// never silence. Every answer below is a person's, written by hand from the command alone. Windows itself is not run here.
const test = require('node:test');
const assert = require('node:assert/strict');
const kit = require('@atlasbound/kit');

const { writtenBy } = kit.text.shell;
const winWrites = (command, lang) => writtenBy(command, undefined, { lang }).writes.map(({ path, cd }) => [...cd, path].join(' > '));
const placedAs = (rows, lang) => rows.forEach(([command, files, unplaced = false]) => assert.deepEqual([winWrites(command, lang),
  writtenBy(command, undefined, { lang }).unplaced], [files, unplaced], command));

test('[I-57] a PowerShell or cmd text that bash runs names the files it writes, a backslash read as a folder separator', () => {
  placedAs([
    ["powershell -NoProfile -Command \"Set-Content ortak/zz-ps.js 'x'\"", ['ortak/zz-ps.js']],
    ['powershell.exe -NoProfile -ExecutionPolicy Bypass -c "Add-Content -Path ortak\\a.js -Value x"', ['ortak/a.js']],
    ["pwsh -c 'Out-File -FilePath ortak/b.js -InputObject x'; powershell -Command New-Item ortak/c.js -Value x", ['ortak/b.js', 'ortak/c.js']],
    ['cmd.exe /C "echo hi > ortak\\y.js"; cmd /c move a.js ortak/z.js; cmd /c "del /q ortak\\old.js"', ['ortak/y.js', 'a.js', 'ortak/z.js', 'ortak/old.js']],
    ['powershell -Command "Get-Content ortak/a.js"; cmd /c "type ortak\\a.js"; powershell -File build.ps1', []],
  ]);
  assert.deepEqual(writtenBy('cmd //c "copy /y a.js ortak\\x.js"').writes, [{ path: 'ortak/x.js', cd: [], by: 'copy', from: ['a.js'] }],
    'a copy names its source, so a folder destination can be placed');
});

test('[I-57] a cmd variable, an encoded PowerShell command and a shell Start-Process starts are unplaced, never no write', () => {
  placedAs([
    ['cmd /c "echo %X% > ortak\\%NAME%.js"', [], true],
    ['powershell -EncodedCommand ZQBjAGgAbwA=', [], true],
  ]);
  assert.deepEqual(writtenBy('powershell -enc ZQBjAGgAbwA=').why, [{ code: 'shell-unparsed', word: '-enc' }]);
  assert.equal(writtenBy("Start-Process cmd -ArgumentList '/c copy a.js b.js'", undefined, { lang: 'powershell' }).unplaced, true);
});

test('[I-57] each word that hands cmd or PowerShell a text is read in every language; cmd words with no run word are unplaced', () => {
  for (const lang of ['sh', 'powershell', 'cmd']) {
    placedAs([
      ['cmd /r del a.txt', ['a.txt']],
      ['cmd /q/c del a.txt', ['a.txt']],
      ['cmd.exe /d/s/c "del a.txt"', ['a.txt']],
      ['CMD /E:ON/V:ON/K del a.txt', ['a.txt']],
      ['cmd /q /R "del a.txt"', ['a.txt']],
      ['cmd /cdel a.txt', ['a.txt']],
      ['powershell /c "Remove-Item a.txt"', ['a.txt']],
      ['pwsh /NoProfile /Command "Remove-Item a.txt"', ['a.txt']],
      ['cmd /d /q', []],
      ['powershell -NoProfile', []],
      ['cmd /x del a.txt', [], true],
    ], lang);
    assert.deepEqual(writtenBy('cmd /x del a.txt', undefined, { lang }).why, [{ code: 'shell-unparsed', word: 'del' }], lang);
  }
  assert.deepEqual(writtenBy('cmd $OPT del a.txt').why, [{ code: 'shell-unparsed', word: '$OPT' }], 'an option no one can read');
});

test('[I-57] the PowerShell tool\'s text: each cmdlet that writes, its aliases, short and colon parameters, redirections', () => {
  placedAs([
    ["Set-Content -Path ortak\\zz.js -Value 'x'; set-content ortak/a.js x; ac ortak/b.js y", ['ortak/zz.js', 'ortak/a.js', 'ortak/b.js']],
    ["'x' | Out-File ortak/c.js -Encoding utf8; Get-Date > ortak/d.js; Get-Date 2>&1 >> ortak/e.js", ['ortak/c.js', 'ortak/d.js', 'ortak/e.js']],
    ["New-Item -Path ortak -Name f.js -ItemType File -Value 'x'; ni ortak/g.js", ['ortak/f.js', 'ortak/g.js']],
    ['Set-Content -Pat ortak/h.js -Va x; Set-Content -Path:ortak/i.js -Value:x', ['ortak/h.js', 'ortak/i.js']],
    ['Move-Item -Path a.js,b.js ortak/; Remove-Item -Recurse -Force ortak/old; Rename-Item ortak/a.js b.js', ['a.js', 'b.js', 'ortak/', 'ortak/old',
      'ortak/a.js', 'ortak/b.js']],
    ['Get-Date | tee ortak/x.js; Invoke-WebRequest https://example.com/w -OutFile ortak/w.js; Expand-Archive a.zip -DestinationPath ortak',
      ['ortak/x.js', 'ortak/w.js', 'ortak/']],
    ["[IO.File]::WriteAllText('ortak/o.js', 'x'); Invoke-Expression \"Set-Content ortak/p.js x\"", ['ortak/o.js', 'ortak/p.js']],
    ['if ($true) { Set-Content ortak/r.js x }; cmd /c copy a.js ortak\\q.js', ['ortak/r.js', 'ortak/q.js']],
    ["& \"C:\\Program Files\\Git\\bin\\bash.exe\" -c 'echo x > ortak/s.js'; node -e \"require('fs').writeFileSync('ortak/t.js', 'x')\"", ['ortak/s.js',
      'ortak/t.js']],
    ["cd ortak; Set-Content i.js x; Set-Location -Path sub; sc j.js x", ['ortak > i.js', 'ortak > sub > j.js']],
  ], 'powershell');
  assert.deepEqual(writtenBy('Copy-Item a.js -Destination ortak\\', undefined, { lang: 'powershell' }).writes, [{ path: 'ortak/', cd: [], by: 'copy-item',
    from: ['a.js'] }]);
});

test('[I-57] the words a command hands the programs it runs are read in its language, after the cds its write reader follows', () => {
  const reads = (command, lang) => kit.text.shell.readBy(command, { lang }).map(({ word, cd }) => [...cd, word].join(' > '));
  assert.deepEqual(reads('cat src/a.js; cd app && grep -n x b.rb < c.rb'), ['src/a.js', 'app > x', 'app > b.rb', 'app > c.rb']);
  assert.deepEqual(reads('Get-Content src\\a.js; Set-Location -Path app; gc b.rb, c.rb', 'powershell'), ['src/a.js', 'app > b.rb', 'app > c.rb']);
  assert.deepEqual(reads('type src\\a.js & cd app & type b.rb', 'cmd'), ['src/a.js', 'app > b.rb']);
  assert.deepEqual(reads('cd -P app; cat a.rb; cd "$DIR"; cat b.rb'), ['app > a.rb'], 'after a cd no one can follow, no word is placed');
  assert.deepEqual(reads('if true; then cd app; fi; cat a.rb'), ['app > a.rb'], 'the command is found past a shell word, as for a write');
});

test('[I-57] in PowerShell a read, a device, -WhatIf and a here-string write nothing; an unknown target is unplaced', () => {
  placedAs([
    ['Get-Content ortak/a.js | Select-String foo; git status; Write-Output x > $null; Remove-Item ortak/m.js -WhatIf', []],
    ["@'\nSet-Content ortak/u.js x\n'@ | Set-Content ortak/v.js", ['ortak/v.js']],
    ["Get-ChildItem ortak | ForEach-Object { Set-Content $_.FullName 'x' }", [], true],
    ['Get-ChildItem ortak -Filter *.js | Remove-Item', [], true],
    ["$p = 'ortak/k.js'; Set-Content $p 'x'; Set-Content (Join-Path ortak l.js) x", [], true],
    ['Set-Content -Bogus 1 ortak/n.js x', [], true],
    ['Set-Content -Pa ortak/n.js x', [], true], // -Pa starts both -Path and -PassThru: PowerShell refuses it as ambiguous
    ['iex $code', [], true],
  ], 'powershell');
});

test('[I-57] a package script run (npm run, npm test, yarn run) is read from the scripts the caller names, else unplaced', () => {
  const pkg = { prew: 'echo a > ortak/pre.js', w: "node -e \"require('fs').writeFileSync('ortak/zz-npm.js','x')\"", test: 'node --test', lint: 'eslint .' };
  const asked = [];
  const scripts = (cd) => asked.push(cd.join('/')) && pkg;
  const read = (command, known = scripts) => writtenBy(command, undefined, { scripts: known });
  assert.deepEqual(read('npm run w').writes.map((w) => w.path), ['ortak/pre.js', 'ortak/zz-npm.js'], 'its pre script runs first');
  assert.deepEqual([read('npm test; npm run -s lint; yarn run lint; npm run missing').writes, read('npm test').unplaced], [[], false]);
  assert.deepEqual(read('cd web && npm run w').writes.map((w) => [...w.cd, w.path].join(' > ')), ['web > ortak/pre.js', 'web > ortak/zz-npm.js']);
  assert.ok(asked.includes('web'), 'the scripts are asked for where the cds leave the command');
  assert.deepEqual(read('npm run build', () => null).why, [{ code: 'shell-writes-unnamed', word: 'build' }], 'no package.json known: unplaced');
  assert.deepEqual(read('npm test', () => null).unplaced, true);
  assert.deepEqual(read('npm run "$TASK"').why.map((w) => w.code), ['shell-word-expands']);
  assert.deepEqual(writtenBy('npm run build').unplaced, true, 'a caller that names no scripts knows none');
  assert.deepEqual(writtenBy('cmd //c "type nul > ortak\\x.js"').writes.map((w) => w.path), ['ortak/x.js']);
});

test('on Windows Git Bash\'s /c/... path is the drive\'s own, in the host\'s spelling; elsewhere /c is a folder of its own', () => {
  const { hostPath } = kit.paths;
  assert.deepEqual(['/c/Users/ana/toy/ortak/x.js', '/D', 'C:/Users/ana/x.js', 'ortak/x.js', '/cx/a'].map((p) => hostPath(p, true)),
    ['c:\\Users\\ana\\toy\\ortak\\x.js', 'D:\\', 'C:\\Users\\ana\\x.js', 'ortak\\x.js', '\\cx\\a']);
  assert.equal(hostPath('/c/Users/ana/x.js', false), '/c/Users/ana/x.js');
});
