// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Black box: kit's one shell owner names the files a command writes, as spelled, with the `cd`s the command ran before each, so a gate places
// them where the host writes; only a write is named; a target it cannot tell (a variable, a loop, code that builds a path) is `unplaced`, and the caller says
// so (`named`, every literal read as written, named files other commands only read). Pure: no disk, no language case in code (the tables are text/shell.json).
// every answer below is a person's, written by hand from the command alone, never what writtenBy said before.
const test = require('node:test');
const assert = require('node:assert/strict');
const kit = require('@atlasbound/kit');
const DENIALS = require('../test/fixtures/shell-denials.json');

const { writtenBy, setBy, word } = kit.text.shell;
/** The written spellings, each after the cds before it: 'app/x.rb' or 'app > x.rb'; 'main?' a word that is a file only where the disk holds one. */
const writes = (command) => writtenBy(command).writes.map(({ path, cd, maybe }) => `${[...cd, path].join(' > ')}${maybe ? '?' : ''}`);
const placing = (command) => [writes(command), writtenBy(command).unplaced];
const against = (rows) => rows.forEach(([command, files, unplaced = false]) => assert.deepEqual(placing(command), [files, unplaced], command));

test('[I-57] redirections, a heredoc fed to cat or tee, and the cd before them name the files written', () => {
  assert.deepEqual(writes("cat > app/x.rb <<'EOF'\nclass X\n  echo > app/inside.rb\nEOF\n"), ['app/x.rb']);
  assert.deepEqual(writes('echo a >> app/a.rb; printf b >| app/b.rb && ls &> app/c.log 2>&1'), ['app/a.rb', 'app/b.rb', 'app/c.log']);
  assert.deepEqual(writes('cd app && cat > x.rb <<EOF\nx\nEOF'), ['app > x.rb']);
  assert.deepEqual(writes('cat <<-EOF | tee -a app/a.rb "app/b c.rb"\n\tx\n\tEOF\necho done > app/d.rb'), ['app/a.rb', 'app/b c.rb', 'app/d.rb']);
  assert.deepEqual(writes('bash -c "echo hi > app/x.rb"'), ['app/x.rb'], 'a shell given a command string: its command is read the same way');
  assert.equal(writtenBy('echo hi > app/x.rb').unplaced, false);
  assert.deepEqual(placing('grep -q x app/a.rb 2>/dev/null >/dev/null; echo x | tee /dev/stderr'), [[], false], 'a device holds nothing, so it is no file written');
  assert.deepEqual(writes("python3 - <<'EOF' >/dev/null 2>&1\nopen('app/x.rb', 'w')\nEOF"), ['app/x.rb'], 'output thrown away is no content: the heredoc is still the code it runs');
});

test('[I-57] an option\'s own argument and a script operand are never files', () => {
  against([
    ["sed -i '' 's/a/b/' app/x.rb", ['app/x.rb']],
    ["cd app/models; sed -i '' 's/a/b/' status.rb", ['app/models > status.rb']],
    ["sed -i -e 's/a/b/' -e 's/c/d/' app/x.rb app/y.rb", ['app/x.rb', 'app/y.rb']],
    ["sed -i.bak 's/a/b/' app/x.rb && sed --in-place -f /tmp/fix.sed app/y.rb", ['app/x.rb', 'app/y.rb']],
    ["perl -pi -e 's/a/b/' app/x.rb; perl -i -pe 's/a/b/' app/y.rb", ['app/x.rb', 'app/y.rb']],
    ['perl -pi.orig fix.pl app/x.rb', ['app/x.rb'], false],
    ["sed 's/a/b/' app/x.rb; sed -n -e '1,5p' app/x.rb; perl -ne 'print' app/x.rb", []],
    ['rm -f app/a.rb && truncate -s 0 app/b.rb && touch app/c.rb', ['app/a.rb', 'app/b.rb', 'app/c.rb']],
    ['touch -r app/ref.rb app/c.rb; touch -t 202601010000 app/d.rb; truncate --reference app/ref.rb app/e.rb', ['app/c.rb', 'app/d.rb', 'app/e.rb']],
    ['sudo install -m 644 build/x app/x && ln -sf ../x app/y', ['app/x', 'app/y']],
    ['sudo -u deploy rm app/a.rb; env -u HOME FOO=1 rm app/b.rb; nice -n 5 rm app/c.rb', ['app/a.rb', 'app/b.rb', 'app/c.rb']],
  ]);
  assert.deepEqual(writtenBy('cp -r tmp/new.rb app/').writes, [{ path: 'app/', cd: [], by: 'cp', from: ['tmp/new.rb'] }], 'a copy names its sources so a folder destination can be placed');
  assert.deepEqual(writtenBy('install -m 644 build/x app/').writes, [{ path: 'app/', cd: [], by: 'install', from: ['build/x'] }], 'the mode is no source');
  assert.deepEqual(writes('mv app/a.rb app/b.rb'), ['app/a.rb', 'app/b.rb'], 'a move changes its source too');
});

test('[I-57] git, find, xargs, dd, curl and the formatters that rewrite in place name the files they write', () => {
  against([
    ['git checkout -- app/a.rb; git checkout HEAD~1 -- app/b.rb app/c.rb', ['app/a.rb', 'HEAD~1?', 'app/b.rb', 'app/c.rb']],
    ['git checkout -b feature; git checkout -b fix origin/main; git checkout main; git restore --staged app/a.rb; git apply --check /tmp/x.diff', ['origin/main?', 'main?']],
    ['git restore app/a.rb && git restore --source HEAD~2 app/b.rb', ['app/a.rb', 'app/b.rb']],
    ['git apply /tmp/change.diff', [], true],
    ["find app -name '*.rb' -exec sed -i '' 's/a/b/' {} +", [], true],
    ["find app -name '*.rb' -exec grep -l x {} \\; ; find app -type f | head", []],
    ["find app -name '*.orig' -delete", [], true],
    ["grep -l a app/*.rb | xargs sed -i '' 's/a/b/'", [], true],
    ['ls app | xargs -I {} cat {}; git ls-files | xargs grep -n x', []],
    ['dd if=/tmp/x of=app/a.rb bs=1k; dd if=app/a.rb of=/dev/null', ['app/a.rb']],
    ['curl -s -o app/a.rb https://example.com/a; curl -sSLo app/b.rb https://example.com/b; curl --output=app/c.rb https://example.com/c', ['app/a.rb', 'app/b.rb', 'app/c.rb']],
    ['curl -s https://example.com/a | head; wget -q -O app/d.rb https://example.com/d', ['app/d.rb']],
    ['bundle exec rubocop -a app/a.rb; bundle exec rubocop -A -c config/rubocop.yml app/b.rb', ['app/a.rb', 'app/b.rb']],
    ['bundle exec rubocop app/a.rb; rubocop --only Layout app/b.rb', []],
    ['bundle exec rubocop -a', ['.']],
    ['npx prettier --write --parser typescript src/a.ts; npx prettier@3 -w src/b.ts; npx prettier --check src/c.ts', ['src/a.ts', 'src/b.ts']],
    ['npx eslint --fix --ext .ts src/a.ts; npx eslint src/b.ts', ['src/a.ts']],
    ["gofmt -w cmd/main.go; gofmt -l cmd/other.go; gofmt -r 'a -> b' -w cmd/x.go", ['cmd/main.go', 'cmd/x.go']],
    ['black --line-length 100 scripts/tool.py; black --check scripts/other.py', ['scripts/tool.py']],
  ]);
});

test('[I-57] an option is read the getopt way: a value after an equals sign or glued to its letter is that option\'s', () => {
  against([
    ["sed -i --expression='s/a/b/' app/x.rb; sed -i -es/a/b/ app/y.rb", ['app/x.rb', 'app/y.rb']],
    ["perl -pi -e's/a/b/' app/x.rb; sed -i --file=/tmp/s.sed app/y.rb; sed -i -E -e's/a/b/' app/z.rb", ['app/x.rb', 'app/y.rb', 'app/z.rb']],
    ["sed -i.before 's/a/b/' app/x.rb; perl -pi.ref -e 's/a/b/' app/y.rb", ['app/x.rb', 'app/y.rb']],
    ["sed -i --expr='s/a/b/' app/x.rb", ['app/x.rb']],
    ["sed -i --posix 's/a/b/' app/x.rb", ['s/a/b/', 'app/x.rb']],
    ["sed --expression='s/a/b/' app/x.rb; sed -n -es/a/b/p app/x.rb; perl -ne'print' app/x.rb; grep -e'x' app/x.rb", []],
    ['curl -sSLo app/a.rb https://example.com/a; curl --output=app/b.rb https://example.com/b; wget -qO- https://example.com/c; curl -o - https://example.com/d', ['app/a.rb', 'app/b.rb']],
    ['timeout 10 sed -i -e s/a/b/ app/x.rb; timeout -k 5 10 rm app/y.rb', ['app/x.rb', 'app/y.rb']],
    [`ruby -e'File.write("app/x.rb", "x")'; node -e"require('fs').writeFileSync('app/y.js','y')"; python3 -c"open('app/z.py','w')"`, ['app/x.rb', 'app/y.js', 'app/z.py']],
    [`python3 -c"print(open('app/z.py').read())"; ruby -Ilib -e'puts 1'; git -C app commit -C HEAD`, []],
  ]);
});

test('[I-57] an option that moves where files land is a cd for that command only, or the folder its sources land in', () => {
  against([
    ['git -C app checkout -- models/user.rb; git -C app -C models restore user.rb', ['app > models/user.rb', 'app > models > user.rb']],
    ["env -C app/models sed -i '' 's/a/b/' user.rb; env --chdir=app rm x.rb; sudo -D app rm y.rb", ['app/models > user.rb', 'app > x.rb', 'app > y.rb']],
    ['git -C app status; rm x.rb; env GIT_TRACE=1 git -C app checkout -- y.rb', ['x.rb', 'app > y.rb']],
    ['env -C app/models cat user.rb; git -C app diff -- models/user.rb', []],
    ['git -C "$D" checkout -- x.rb', ['x.rb'], true],
  ]);
  assert.deepEqual(writtenBy('cp -t app/models /tmp/user.rb').writes, [{ path: 'app/models/', cd: [], by: 'cp', from: ['/tmp/user.rb'] }], 'cp -t: the operand is the source');
  assert.deepEqual(writtenBy('mv --target-directory=app a.rb b.rb').writes.map(({ path, from }) => [path, from]), [['a.rb', undefined], ['b.rb', undefined], ['app/', ['a.rb', 'b.rb']]]);
  assert.deepEqual(writtenBy('rsync -t a.rb app/').writes, [{ path: 'app/', cd: [], by: 'rsync', from: ['a.rb'] }], 'rsync -t keeps times: no target option');
});

test('[I-57] git rm, mv and restore of the work tree name the files they write; the index alone or a dry run writes none', () => {
  against([
    ['git rm app/a.rb; git rm -rf app/b.rb; git mv app/c.rb app/d.rb', ['app/a.rb', 'app/b.rb', 'app/c.rb', 'app/d.rb']],
    ['git restore --staged --worktree app/a.rb; git restore -SW app/b.rb; git restore -W --staged app/c.rb', ['app/a.rb', 'app/b.rb', 'app/c.rb']],
    ['git rm --cached app/a.rb; git rm -rn app/b.rb; git mv -n app/c.rb app/d.rb; git restore --staged app/e.rb; git restore -S app/f.rb', []],
  ]);
});

test('[I-57] an interpreter fed inline code: the path a write call opens is named, a read writes nothing', () => {
  assert.deepEqual(writes("python3 - <<'EOF'\nwith open('app/x.rb', 'w') as f:\n    f.write('x')\nEOF"), ['app/x.rb']);
  assert.deepEqual(writes(`ruby -e 'File.write("app/x.rb", "x")'`), ['app/x.rb']);
  assert.deepEqual(writes(`node -e "require('fs').writeFileSync('app/x.js', 'x')"`), ['app/x.js']);
  assert.deepEqual(placing("python3 - <<EOF\np = 'app/validators/poll.rb'\nopen(p, 'w').write(body)\nEOF"), [['app/validators/poll.rb'], false], 'assigned once, to one literal');
  assert.deepEqual(placing(`php -r '$p = "app/x.php"; file_put_contents($p, "x");'`), [['app/x.php'], false], 'a sigil is part of the name');
  assert.deepEqual(placing(`python3 -c "print(open('app/x.rb').read())"`), [[], false], 'a read opens nothing for writing');
  assert.deepEqual(writes(`lua -e 'io.open("app/x.lua", "w"):write("x")'`), ['app/x.lua'], 'no interpreter is named anywhere: code is known by its shape');
  assert.deepEqual(writes(`bundle exec ruby -e 'File.write("app/x.rb", "x")'; sudo node -e "require('fs').writeFileSync('app/y.js', 'y')"`), ['app/x.rb', 'app/y.js'], 'code under a runner is read once, as its inner command\'s');
  assert.deepEqual(writes("cat > app/w.py <<'EOF'\nopen('app/other.rb', 'w')\nEOF"), ['app/w.py'], 'a heredoc that is a file\'s content is not code');
});

test('[I-57] a name is read where the write stands, with the values its block gave it; anything else is unplaced', () => {
  const code = (body) => `python3 - <<'EOF'\n${body}\nEOF`;
  against([
    [code("p = 'app/a.rb'\nopen(p, 'w')\np = 'app/b.rb'\nopen(p, 'w')"), ['app/a.rb', 'app/b.rb']],
    [code("def f(p):\n    open(p, 'w')\nf('app/a.rb')"), ['app/a.rb']],
    [code("B = 'app/'\ndef rep(p, a, count=1):\n    p = B + p\n    open(p, 'w').write(a)\nrep('x.rb', 1)\np = 'y.rb'\nrep(p, 2, count=2)\nrep(p, 3)"), ['app/x.rb', 'app/y.rb']],
    [`node -e "const save = (p, s) => require('fs').writeFileSync(p, s); save('app/a.js', 'x')"`, ['app/a.js']],
    [`ruby -e 'def put(p) File.write(p, "x") end; put("app/a.rb")'`, ['app/a.rb']],
    [`php -r 'function put($p) { file_put_contents($p, "x"); } put("app/a.php");'`, ['app/a.php']],
    [code("def r(p):\n    return open(p).read()\nr('app/a.rb')"), []],
  ]);
  against([
    [code("def f(p):\n    open(p, 'w')"), [], true],
    [code("def f(p):\n    open(p, 'w')\nf(base + 'a.rb')"), [], true],
    [code("p = 'app/a.rb'\nfor p in files:\n    open(p, 'w')"), ['app/a.rb'], true],
    [code("p = 'app/a.rb'\np += '.bak'\nopen(p, 'w')"), ['app/a.rb'], true],
    [code("p = base + 'a.rb'\nopen(p, 'w')"), [], true],
    [code("d = 'app'\nopen(f'{d}/a.rb', 'w')"), [], true],
    [`ruby -e 'd = "app"; File.write("#{d}/a.rb", "x")'`, [], true],
    ['for f in app/a.rb app/b.rb; do echo x > "$f"; done', [], true],
  ]);
});

test('[I-57] an assignment in a branch, a try or a shadow adds a value: a write is placed at every value its name may hold', () => {
  const code = (body) => `python3 - <<'EOF'\n${body}\nEOF`;
  against([
    [code("p = 'app/a.rb'\nif len(sys.argv) > 5:\n    p = 'spec/a_spec.rb'\nopen(p, 'w')"), ['app/a.rb', 'spec/a_spec.rb']],
    [code("p = 'app/a.rb'\ntry:\n    import nothing\n    p = 'spec/a_spec.rb'\nexcept ImportError:\n    pass\nopen(p, 'w')"), ['app/a.rb', 'spec/a_spec.rb']],
    [`node -e "const p='app/a.js'; function f(){ const p='spec/a.js'; return p } require('fs').writeFileSync(p,'x')"`, ['app/a.js', 'spec/a.js']],
    [`ruby -e 'p = "app/a.rb"; p = "spec/a.rb" if ENV["X"]; File.write(p, "x")'`, ['app/a.rb'], true],
    [code("p = 'spec/a_spec.rb'\nfor i, p in enumerate(files):\n    open(p, 'w')"), ['spec/a_spec.rb'], true],
    [code("p = 'spec/a_spec.rb'\np, q = 'app/a.rb', 'x'\nopen(p, 'w')"), ['spec/a_spec.rb'], true],
    [`ruby -e 'p = "spec/a.rb"; files.each { |i, p| File.write(p, "x") }'`, ['spec/a.rb'], true],
    [code("def rep(p):\n    open(p, 'w')\nrep('app/a.rb')\np = 'app/b.rb'\nrep(p)"), ['app/a.rb', 'app/b.rb']],
    [code("p = 'app/a.rb'\nif len(sys.argv) > 5: p = 'spec/a_spec.rb'\nopen(p, 'w')"), ['app/a.rb', 'spec/a_spec.rb']],
    [`node -e "let p='app/a.js'; if (process.argv[2]) p='spec/a.js'; require('fs').writeFileSync(p,'x')"`, ['app/a.js', 'spec/a.js']],
    [`node -e "let p='app/a.js'; if (process.argv[2]) { p='spec/a.js' } require('fs').writeFileSync(p,'x')"`, ['app/a.js', 'spec/a.js']],
    [code("p = 'tmp/x'\ndoc = \"\"\"\np = 'app/a.rb'\n\"\"\"\nopen(p, 'w')"), ['tmp/x', 'app/a.rb'], false],
  ]);
});

test('[I-57] an assignment that begins its statement sets its name for the rest of its block; a parameter shadows outside', () => {
  const code = (body) => `python3 - <<'EOF'\n${body}\nEOF`;
  against([ // ordinary writes: each writes only tmp/ or spec/, and the shape of a session's command
    [code("def read(path):\n    return open(path).read()\ndef write(path, s):\n    open(path, 'w').write(s)\ns = read('config/locales/en.yml')\nwrite('tmp/out.yml', s)"), ['tmp/out.yml']],
    [`node -e "const fs=require('fs'); const file='config/locales/en.yml'; const s=fs.readFileSync(file,'utf8'); function save(file, t){ fs.writeFileSync(file, t) } save('tmp/en.yml', s)"`, ['tmp/en.yml']],
    [code("p = 'config/locales/en.yml'\ns = open(p).read()\np = 'tmp/en.yml'\nopen(p, 'w').write(s)"), ['tmp/en.yml']],
    [`node -e "const fs=require('fs'); function read(p){ return fs.readFileSync(p,'utf8') } function write(p, s){ fs.writeFileSync(p, s) } const s = read('config/x.yml'); write('tmp/o.txt', s)"`, ['tmp/o.txt']],
    [code("path = 'app/models/user.rb'\ntext = open(path).read()\npath = 'spec/models/user_spec.rb'\nopen(path, 'w').write(text)"), ['spec/models/user_spec.rb']],
    [code("def check(f):\n    return 'x' in open(f).read()\ndef fix(f):\n    open(f, 'w').write('y')\ncheck('config/locales/en.yml')\nfix('spec/models/user_spec.rb')"), ['spec/models/user_spec.rb']],
    [code("B='app/js/'\ndef rep(p,a,b,count=1):\n    p=B+p\n    s=open(p).read()\n    s=s.replace(a,b); open(p,'w').write(s)\nrep('api/a.ts',\"\"\"a\"\"\",\"\"\"b\"\"\")\np='reducers/b.js'\nrep(p,\"\"\"a\"\"\",\"\"\"b\"\"\")"), ['app/js/api/a.ts', 'app/js/reducers/b.js']],
  ]);
  against([ // near misses: what the function or block can still see
    [code("def f(p):\n    def g():\n        open(p, 'w')\n    g()\nf('app/a.rb')"), ['app/a.rb']],
    [`node -e "let p='tmp/x'; function f(){ p='app/a.js' } f(); require('fs').writeFileSync(p,'')"`, ['tmp/x', 'app/a.js']],
    [code("p = 'app/a.rb'\ndef f(p):\n    return p\nopen(p, 'w')\nf('tmp/x')"), ['app/a.rb']],
    [code("def f(p,\n      q):\n    x = 1\n# a comment at the margin ends no block\n    open(p, 'w')\nf('app/a.rb', 1)"), ['app/a.rb']],
    [`ruby - <<'EOF'\ndef put(p)\n  File.write(p, 'x')\nend\nput('app/a.rb')\nEOF`, ['app/a.rb']],
    [code("def f(p):\n    open(p, 'w')\n    f(B + p)\nf('app/a.rb')"), ['app/a.rb'], true],
    [code("p = 'tmp/x'\nfor i in range(2):\n    open(p, 'w')\n    p = 'spec/y.rb'"), ['tmp/x']],
  ]);
});

test('[I-57] an assignment the language may skip never replaces: the name keeps both values', () => {
  const [py, rb] = [(body) => `python3 - <<'EOF'\n${body}\nEOF`, (body) => `ruby - <<'EOF'\n${body}\nEOF`];
  const js = (body) => `node - <<'EOF'\nconst fs = require('fs')\n${body}\nEOF`;
  const BOTH = ['app/a.rb', 'tmp/x']; // each, run for real, writes app/a.rb: the reassignment never runs
  against([
    [py("p = 'app/a.rb'\nif 0: pass; p = 'tmp/x'\nopen(p, 'w')"), BOTH],
    [`ruby -e "p='app/a.rb'; if false; p='tmp/x'; end; File.write(p,'x')"`, BOTH],
    [rb("p = 'app/a.rb'\nif false\np = 'tmp/x'\nend\nFile.write(p, 'x')"), BOTH],
    [js("let p = 'app/a.rb'\nif (process.argv.length > 9)\np = 'tmp/x'\nfs.writeFileSync(p, 'x')"), BOTH],
    [`ruby -e "p='app/a.rb'; unless true; p='tmp/x'; end; File.write(p,'x')"`, BOTH],
    [rb("p = 'app/a.rb'\nwhile false\np = 'tmp/x'\nend\nFile.write(p, 'x')"), BOTH],
    [rb("p = 'app/a.rb'\nbegin\nraise 'stop'\np = 'tmp/x'\nrescue\nend\nFile.write(p, 'x')"), BOTH],
    [rb("p = 'app/a.rb'\n[].each do |f|\np = 'tmp/x'\nend\nFile.write(p, 'x')"), BOTH],
    [rb("p = 'app/a.rb'\ncase 1\nwhen 2\np = 'tmp/x'\nend\nFile.write(p, 'x')"), BOTH],
    [py("p = 'app/a.rb'\ntry: raise SystemError('x'); p = 'tmp/x'\nexcept Exception: pass\nopen(p, 'w')"), BOTH],
    [js("let p = 'app/a.rb'\nif (a) { b() } else if (c)\np = 'tmp/x'\nfs.writeFileSync(p, 'x')"), BOTH],
  ]);
  against([ // near misses: the reassignment always runs, so only it is written
    [`ruby -e "p='app/a.rb'; s=File.read(p); p='tmp/x'; File.write(p,s)"`, ['tmp/x']],
    [py("p = 'app/a.rb'\nif len(sys.argv) > 5:\n    print(p)\np = 'tmp/x'\nopen(p, 'w')"), ['tmp/x']],
    [js("let p = 'app/a.rb'; if (process.argv.length > 9) { console.log(p) } p = 'tmp/x'; fs.writeFileSync(p, 'x')"), ['tmp/x']],
    [py("p = 'app/a.rb'\n# if the file is there, copy it, else try again\ns = open(p).read()\np = 'tmp/x'\nopen(p, 'w').write(s)"), ['tmp/x']],
    [`ruby -e "p='app/a.rb'; puts 'if you do this while that'; p='tmp/x'; File.write(p,'x')"`, ['tmp/x']],
    [js("let p = 'app/a.rb'; Promise.resolve().then(() => 1).catch(() => 2); p = 'tmp/x'; fs.writeFileSync(p, 'x')"), ['tmp/x']],
    [rb("p = 'app/a.rb'\n[1].each do |f|\n  puts f\nend\np = 'tmp/x'\nFile.write(p, 'x')"), ['tmp/x']],
    [py("p = 'app/a.rb'\nfor f in [1]:\n\n    # a blank line and a comment first\n    print(f)\np = 'tmp/x'\nopen(p, 'w')"), ['tmp/x']],
  ]);
});

test('[I-57] an assignment replaces only after statements read in full; after a suite or a heredoc it adds', () => {
  const [py, rb] = [(body) => `python3 - <<'EOF'\n${body}\nEOF`, (body) => `ruby - <<'EOF'\n${body}\nEOF`];
  const js = (body) => `node - <<'EOF'\nconst fs = require('fs')\n${body}\nEOF`;
  const BOTH = ['app/a.rb', 'tmp/x']; // each, run for real, writes app/a.rb
  against([
    [py("p = 'app/a.rb'\nclass C: pass; p = 'tmp/x'\nopen(p, 'w')"), BOTH],
    [py("p = 'app/a.rb'\ndef f(): pass; p = 'tmp/x'\nopen(p, 'w')"), BOTH],
    [`ruby -e "p='app/a.rb'; class C; p='tmp/x'; end; File.write(p,'x')"`, BOTH],
    [rb("p = 'app/a.rb'\nmodule M\np = 'tmp/x'\nend\nFile.write(p, 'x')"), BOTH],
    [rb("p = 'app/a.rb'\ndef f\np = 'tmp/x'\nend\nFile.write(p, 'x')"), BOTH],
    [rb("p = 'app/a.rb'\ns = <<~T\np = 'tmp/x'\nT\nFile.write(p, 'x')"), BOTH],
    [rb("p = 'app/a.rb'\ns = \"\np = 'tmp/x'\n\"\nFile.write(p, 'x')"), BOTH],
    [rb("p = 'app/a.rb'\ns = %q|\np = 'tmp/x'\n|\nFile.write(p, 'x')"), BOTH],
    [`php -r '$p = "app/a.rb";\n$s = <<<T\n$p = "tmp/x";\nT;\nfile_put_contents($p, "x");'`, BOTH],
    [rb("p = 'app/a.rb'\nx = begin\nraise 'stop'\np = 'tmp/x'\nrescue\nend\nFile.write(p, 'x')"), BOTH],
    [js("let p = 'app/a.rb'\nif(process.argv.length > 9)\np = 'tmp/x'\nfs.writeFileSync(p, 'x')"), BOTH],
    [rb("p = 'app/a.rb'\nunless 'x'\np = 'tmp/x'\nend\nFile.write(p, 'x')"), BOTH],
    [rb("p = 'app/a.rb'\nputs p\np = 'tmp/x'\nFile.write(p, 'x')"), BOTH, false], // a name beside a name: the reader cannot tell it from `def f`, so it adds (a false ask, never a silent pass)
  ]);
  against([ // near misses: every statement before the overwrite is read in full, so only tmp/x is written
    [py("p = 'app/a.rb'\np = 'tmp/x'\nopen(p, 'w')"), ['tmp/x']],
    [js("let p = 'app/a.rb'\np = 'tmp/x'\nfs.writeFileSync(p, 'x')"), ['tmp/x']],
    [py("p = 'app/a.rb'\nprint('if while try')\np = 'tmp/x'\nopen(p, 'w')"), ['tmp/x']],
    [py("def f(a):\n    return a\np = 'app/a.rb'\np = 'tmp/x'\nopen(p, 'w')"), ['tmp/x']],
    [js("let p = 'app/a.rb';\n['a'].forEach((f) => {\n  console.log(f);\n});\np = 'tmp/x';\nfs.writeFileSync(p, 'x');"), ['tmp/x']],
    [js("let p = 'app/a.rb'\nfs.mkdirSync('tmp', { recursive: true })\np = 'tmp/x'\nfs.writeFileSync(p, 'x')"), ['tmp/x']],
    [js("let p = 'app/a.rb'\nfunction f() {\n  return 1\n}\np = 'tmp/x'\nfs.writeFileSync(p, 'x')"), ['tmp/x']],
    [`ruby -e "p='app/a.rb'; require 'json'; p='tmp/x'; File.write(p,'x')"`, ['tmp/x']],
    [py("import os, sys\nfrom os import path as q\np = 'app/a.rb'\nimport json\np = 'tmp/x'\nopen(p, 'w')"), ['tmp/x']],
    [`node -e "import('fs'); let p='app/a.js'; p='tmp/x'; require('fs').writeFileSync(p,'x')"`, ['tmp/x']],
    [rb("p = 'app/a.rb'\nif ARGV.empty?\n  puts p\nelse\n  puts 1\nend\np = 'tmp/x'\nFile.write(p, 'x')"), ['tmp/x']],
    [py("p = 'app/a.rb'\nn = len(p) + 1 if p else 0\np = 'tmp/x'\nopen(p, 'w')"), BOTH, false], // a conditional expression: a name beside a name, so it adds (a false ask)
  ]);
});

test('[I-57] a program is read in any case: a disk that folds case runs RM as rm, TEE as tee', () => {
  against([
    ["RM -f app/a.rb; /bin/RM app/b.rb; Sed -i '' 's/a/b/' app/c.rb", ['app/a.rb', 'app/b.rb', 'app/c.rb']],
    ['echo x | TEE app/d.rb; BASH -c "echo hi > app/e.rb"; Python3 -c "open(\'app/f.rb\', \'w\')"', ['app/d.rb', 'app/e.rb', 'app/f.rb']],
    ['LS app/a.rb; CAT app/b.rb', []],
  ]);
});

test('[I-57] a trap\'s command is a command string; a changed mode or owner is a write of the files after its first word', () => {
  against([
    ["trap 'rm app/a.rb' EXIT", ['app/a.rb']],
    ['trap "cd app && rm a.rb" EXIT INT; echo done', ['app > a.rb']],
    ['trap - EXIT; trap -l', []],
    ['chmod 000 .atlasbound', ['.atlasbound']],
    ['chmod -R a-r .atlasbound .decisionbook', ['.atlasbound', '.decisionbook']],
    ['chmod -w app/a.rb', ['app/a.rb']],
    ['chmod --reference=x.rb app/a.rb', ['app/a.rb']],
    ['chown -R me:staff app/a.rb', ['app/a.rb']],
    ['chgrp staff app/a.rb', ['app/a.rb']],
    ['chflags uchg app/a.rb', ['app/a.rb']],
    ['setfacl -m u:me:r app/a.rb', ['app/a.rb']],
    ['xattr -d com.example.k app/a.rb; xattr -w com.example.k v app/b.rb; xattr -rc app/c.rb', ['app/a.rb', 'app/b.rb', 'app/c.rb']],
    ['xattr -l app/a.rb; xattr -p com.example.k app/a.rb', []],
  ]);
  against([["trap \"rm $F\" EXIT", [], true]]);
});

test('[I-57] a command string is read from the cds of the command that holds it, so 2000 cds and 2000 writes stay linear', () => {
  against([
    ['cd a; cd b; echo $(cd c; touch x y)', ['a > b > c > x', 'a > b > c > y']],
    ["cd a && sh -c 'cd b && rm x' && rm y", ['a > b > x', 'a > y']],
    ['cd "$D"; echo $(touch x)', ['x'], true],
  ]);
  const many = writtenBy(`${'cd a; '.repeat(2000)}echo $(touch ${Array.from({ length: 2000 }, (_, i) => `t${i}`).join(' ')})`).writes;
  assert.deepEqual([many.length, many[0].cd.length, many[1999].path, many.every((w) => w.cd === many[0].cd)], [2000, 2000, 't1999', true], 'one cd list, held by every write');
});

test('[I-57] a path built by a call is a write no one can place, never a write unseen', () => {
  against([
    [`python3 -c "open(os.path.join('app','x.rb'), 'w').write('x')"`, [], true],
    [`node -e "require('fs').writeFileSync(require('path').join('app','x.js'), 'x')"`, [], true],
    [`ruby -e 'File.write(File.join("app","x.rb"), "x"); File.write dir + "/y.rb", "y"'`, [], true],
    [`ruby -e 'File.write "app/x.rb", "x"'; ruby -e'File.write("app/y.rb", "y")\nputs 1'`, ['app/x.rb', 'app/y.rb']],
    [`python3 -c "print(open(os.path.join('app','x.rb')).read())"; node -e "require('fs').readFileSync(require('path').join('app','x.js'))"`, []],
  ]);
});

/** The best of three runs of writtenBy, in ms (a first run pays the compiler; a catastrophic pattern costs seconds every time). */
const timed = (command) => Math.min(...[0, 1, 2].map(() => {
  const started = process.hrtime.bigint();
  writtenBy(command);
  return Number(process.hrtime.bigint() - started) / 1e6;
}));

test('[I-57] every code pattern is read in linear time, and its write is still named', () => {
  const code = (tail) => `python3 - <<'EOF'\nopen('app/models/user.rb', 'w').write('x')\n${tail}\nEOF`;
  const rowsAt = (N) => [['870 chars (for)', code(`for${' '.repeat(400)}p${' '.repeat(400)}x`)], ['6.5 KB (tuple)', code(`\n${' '.repeat(3200)}a,b${' '.repeat(3200)}x`)],
    ...Object.entries({ open: `open(${' '.repeat(N)}x`, mode: `open(p, '${'w'.repeat(N)}`, nested: `open(${'a(b)'.repeat(N / 4)}`, writeFile: `writeFileSync(${' '.repeat(N)}`,
      'File.write': `File.write ${' '.repeat(N)}x`, 'File.write x, many': 'File.write x '.repeat(N / 12), write_text: `.write_text${' '.repeat(N)}x`, perl: `open my $f${' '.repeat(N)}x`,
      for: `for p${' '.repeat(N)}x`, 'for names': `for ${'a , '.repeat(N / 4)}x`, block: `|${'a , '.repeat(N / 4)}x`, as: `as ${'a =>'.repeat(N / 4)}`, tuple: `\na, b${' '.repeat(N)}x`,
      'tuple tabs': `\n${'\t'.repeat(N)}a,b x`, 'tuple ;': `${';'.repeat(N / 2)}${' '.repeat(N / 2)}`, assign: `a${' '.repeat(N)}x`, 'assign chain': 'a='.repeat(N / 2),
      join: `p = ${"'x' + ".repeat(N / 6)}'y'`, def: `def${' '.repeat(N)}x`, 'function many': 'f = function x '.repeat(N / 15), 'lambda many': 'f = lambda x '.repeat(N / 13),
      param: `def f(${' '.repeat(N)})`, literal: `p = '${'x'.repeat(N)}`, 'triple quotes': '"""'.repeat(N / 3), 'block comments': '/* '.repeat(N / 3), regex: '= /x '.repeat(N / 5),
      braces: '{}'.repeat(N / 2), 'braces deep': `${'{'.repeat(64)}${'}{'.repeat(N / 2)}`, brackets: '('.repeat(N) }).map(([name, tail]) => [name, code(tail)])];
  // A ratio, not a time: the two sizes run in turns so a load spike hits both; the floor keeps sub-millisecond noise from reading as growth.
  const grows = (small, big) => {
    const turns = [0, 1, 2, 3, 4].map(() => [timed(small), timed(big)]);
    return Math.min(...turns.map(([, b]) => b)) / Math.max(Math.min(...turns.map(([s]) => s)), 1);
  };
  const [small, big] = [rowsAt(30000), rowsAt(120000)];
  big.forEach(([name, command], i) => {
    assert.deepEqual(writes(command), ['app/models/user.rb'], name);
    const ratio = grows(small[i][1], command);
    assert.ok(ratio < 10, `${name}: ${ratio.toFixed(1)} times the time for four times the text`);
  });
  const glued = (N) => `ruby "-${'e'.repeat(N)}\nFile.write('app/x.rb', 'x')"`;
  const long = (N) => `sed --${'x'.repeat(N)}=y f`;
  assert.ok(grows(glued(30000), glued(120000)) < 10 && grows(long(30000), long(120000)) < 10, 'a code option glued to its code, and a long option, read in linear time too');
});

test('the reader names the variables a command sets for what it runs, through every wrapper; one it only reads is none', () => {
  const sets = (command, lang = 'sh') => writtenBy(command, undefined, { lang }).sets;
  for (const [command, names] of [['A=1 B+=2 run', ['A', 'B']], ['export A=1 B; unset C', ['A', 'B', 'C']], ['read -r A <<< x', ['A']],
    ['sh -c "A=1 run"', ['A']], ['eval "export A"', ['A']], ['echo $(A=1 run)', ['A']], ['env A=1 run', ['A']], ['env -u A run', ['A']],
    ['env --unset=A run', ['A']], ['env -S "A=1 run"', ['A']], ['env -i run', ['*']], ['env - run', ['*']], ['export A=$B:/x "C=$D"', ['A', 'C']], ['export "$NAME" $(cat .env)', []],
    ['for f in *.txt "$@"; do run; done', ['f', 'in']],
    ['for A in 1 2; do run; done', ['A', 'in']], ['printf -v A %s x', ['A']], ['let A=1', ['A']], ['mapfile A < f', ['A']],
    ['echo $A; echo A=1; declare -p A; export -p; git commit -m "A=1"; printf %s A; echo for A in 1', []]]) assert.deepEqual(sets(command), names, command);
  assert.deepEqual(sets('set A=1', 'cmd'), ['A'], 'cmd sets a variable so');
  for (const [command, names] of [["$env:A = 'x'", ['A']], ['Set-Item env:A x', ['A']], ['Remove-Item env:A', ['A']], ['New-Item -Path Env:\\A -Value x', ['A']],
    ["[Environment]::SetEnvironmentVariable('A', 'x')", ['A']], ['Write-Output $env:A', []]]) assert.deepEqual(sets(command, 'powershell'), names, command);
  assert.deepEqual(setBy(writtenBy('env -i run'), ['A', 'B']), ['A', 'B'], 'an emptied environment sets every name asked about');
  assert.deepEqual(setBy(writtenBy('B=1 run'), ['A', 'B']), ['B']);
});

test('[I-57] the reader stops where the caller\'s time is up, or at a text too long or deep to read, and says so', () => {
  const values = Array.from({ length: 64 }, (_, i) => `if x: p = 'f${i}'`).join('\n'); // p may hold 64 values, so each `p + p` joins 4096
  const slow = `python3 - <<'EOF'\nopen('app/models/user.rb', 'w')\n${values}\n${'q = p + p\n'.repeat(5000)}EOF`;
  const budget = (ms, start = Date.now()) => () => Date.now() - start > ms;
  let started = Date.now();
  const cut = writtenBy(slow, budget(100));
  assert.deepEqual([cut.writes.map((w) => w.path), cut.unplaced, cut.unread], [['app/models/user.rb'], true, true]);
  assert.ok(Date.now() - started < 1000, `stopped at the budget: ${Date.now() - started} ms (the whole text takes seconds)`);
  started = Date.now();
  const short = [{ code: 'shell-cut-short', word: null }];
  assert.deepEqual(Object.values(writtenBy(`echo x > app/a.rb; ${'rm b.rb; '.repeat(20000)}`, budget(-1))), [[], [], true, true, short], 'past at once: nothing read, and it says so');
  const long = `python3 -c "${'#'.repeat(200001)}"; echo x > app/a.rb`;
  assert.deepEqual(Object.values(writtenBy(long)), [[{ path: 'app/a.rb', cd: [], by: '>' }], [], true, true, short], 'a code text too long is unread; the rest of the command is still read');
  assert.ok(Date.now() - started < 500, `${Date.now() - started} ms`);
  assert.deepEqual(Object.values(writtenBy(`python3 -c "${'#'.repeat(199000)}\nopen('app/x.rb', 'w')"`)), [[{ path: 'app/x.rb', cd: [], by: 'python' }], [], false, false, []], 'one under the cap is read');
  assert.deepEqual(Object.values(writtenBy(`node -e "${'{'.repeat(65)}require('fs').writeFileSync('app/x.js', 'x')"`)), [[], [], true, true, short], 'too deep to read');
  assert.deepEqual(Object.values(writtenBy(`node -e "${'{'.repeat(60)}require('fs').writeFileSync('app/x.js', 'x')"`)), [[{ path: 'app/x.js', cd: [], by: 'node' }], [], false, false, []], 'deep but read');
});

test('[I-57] write forms: an option that writes what the text does not show, beside one that does not', () => {
  against([
    ['git reset --hard', [], true],
    ['git reset --soft HEAD~1; git reset -q; git reset HEAD app/a.rb', []],
    ['git checkout --detach -f -q main', ['main?'], true],
    ['git checkout --merge main', ['main?'], true],
    ['git checkout --detach -q main; git checkout -b feature', ['main?']],
    ['git switch -f main', [], true],
    ['git switch --discard-changes main', [], true],
    ['git switch -m main', [], true],
    ['git switch main; git switch -c feature; git switch --detach v1', []],
    ['git stash -q -u', [], true],
    ['git stash pop', [], true],
    ['git stash list; git stash show -p; git stash drop', []],
    ['git clean -fdq -e tmp', [], true],
    ['git clean -n; git clean -fd --dry-run', []],
    ['patch -p1 < /tmp/fix.patch', [], true],
    ['patch -p1 --dry-run < /tmp/fix.patch', []],
    ['pushd spec && bundle exec rspec && popd && rm app/a.rb', ['spec > app/a.rb'], true],
    ['tar xzf /tmp/a.tgz -C app; tar -x -C /tmp/x -f /tmp/a.tar', ['app > .', '/tmp/x > .']],
    ['tar -xzf /tmp/a.tgz app/a.rb', ['app/a.rb']],
    ['tar -tzf /tmp/a.tgz; tar -czf /tmp/b.tgz app', []],
    ['unzip -o -q /tmp/a.zip -d app; unzip /tmp/b.zip app/a.rb', ['app > .', 'app/a.rb']],
    ['unzip -l /tmp/a.zip; unzip -p /tmp/a.zip x; unzip -tq /tmp/a.zip', []],
    ['sort -u -o app/a.rb tmp/x; sort -u app/b.rb', ['app/a.rb']],
    ['openssl enc -d -in /tmp/a.enc -out app/a.rb -pass pass:x; openssl enc -d -in app/b.rb -pass pass:x', ['app/a.rb']],
    ['ffmpeg -i /tmp/in.mp4 -frames:v 1 -y app/a.png; ffmpeg -i app/b.mp4', ['app/a.png']],
    ['pdftoppm -png -r 50 /tmp/a.pdf app/page; pdftoppm -v', ['app/page']],
    ['sips -c 100 200 app/a.png; sips -g pixelWidth app/b.png', ['app/a.png']],
    ['xxd -r -p /tmp/hex app/a.rb; xxd -l 64 app/b.rb; xxd app/c.rb', ['app/a.rb']],
    ['split -l 100 /tmp/big app/part_; split -l 100 app/a.rb', ['app/part_']],
    ['docker cp web:/srv/a.rb app/a.rb; docker exec web ls', ['app/a.rb']],
    ['git checkout-index -a --prefix=app/', ['app/']],
    ['git checkout-index -a -f', [], true],
    ["python3 -c \"import os; os.chmod('app/a.rb', 0o644)\"; node -e \"require('fs').chmodSync('app/b.rb', 0o755)\"", ['app/a.rb', 'app/b.rb']],
  ]);
});

test('[I-57] a script written from a heredoc is found where it lands, however the run spells it', () => {
  against([
    ["cat > fix.sh <<'EOF'\n#!/bin/bash\nrm app/a.rb\nEOF\nchmod +x fix.sh && ./fix.sh", ['fix.sh', 'fix.sh', 'app/a.rb']],
    ["cat > fix.py <<'EOF'\nopen('app/a.rb', 'w')\nEOF\npython3 ./fix.py", ['fix.py', 'app/a.rb']],
    ["cat > ./fix.py <<'EOF'\nopen('app/a.rb', 'w')\nEOF\npython3 fix.py", ['./fix.py', 'app/a.rb']],
    ["cat > /tmp/fix.py <<'EOF'\nopen('/w/app/a.rb', 'w')\nEOF\ncd /tmp && python3 fix.py", ['/tmp/fix.py', '/tmp > /w/app/a.rb']],
    ["cat > tools/fix.py <<'EOF'\nopen('models/a.rb', 'w')\nEOF\ncd app && python3 ../tools/fix.py", ['tools/fix.py', 'app > models/a.rb']],
    ["cat > notes.sh <<'EOF'\n#!/bin/bash\nrm app/a.rb\nEOF\n./other.sh", ['notes.sh']],
    ["cat > fix.py <<'EOF'\nopen('../app/a.rb', 'w')\nEOF\ncd spec && python3 fix.py", ['fix.py']],
  ]);
});

test('[I-57] git merge, rebase, cherry-pick, revert, am and pull write files their text does not show; fetch and log none', () => {
  for (const command of ['git merge feature', 'git rebase main', 'git cherry-pick abc123', 'git revert HEAD', 'git am x.patch', 'git pull',
    'git -C app pull --rebase']) assert.deepEqual(placing(command), [[], true], command);
  assert.deepEqual(placing('git fetch origin; git log --oneline -3'), [[], false]);
});

test('[I-57] a shell given a script file reads the text the caller hands for it; a script no one hands is unplaced', () => {
  const files = { 'run.sh': 'echo y > src/a.js\n', 'app/fix.sh': "sed -i '' 's/a/b/' ../src/b.js\n", 'tools/inner.sh': 'sh run.sh\n' };
  const file = (cd, name) => files[[...cd, name].join('/')] ?? null;
  const read = (command) => writtenBy(command, undefined, { file });
  const placed = (command) => [read(command).writes.map(({ path, cd }) => [...cd, path].join(' > ')), read(command).unplaced];
  assert.deepEqual(placed('sh run.sh'), [['src/a.js'], false]);
  assert.deepEqual(placed('bash -e run.sh arg'), [['src/a.js'], false], 'an option before it and an argument after it');
  assert.deepEqual(placed('cd app && sh fix.sh'), [['app > ../src/b.js'], false], 'read where the cd leaves it, its writes from there');
  assert.deepEqual(placed('zsh tools/inner.sh'), [['src/a.js'], false], 'a script that runs a script');
  assert.deepEqual(read('sh nope.sh').why, [{ code: 'shell-writes-unnamed', word: 'nope.sh' }]);
  assert.deepEqual(placed('bash "$S"'), [[], true]);
  assert.deepEqual(placing('sh run.sh'), [[], true], 'a caller that hands no file: unplaced, never passed');
  assert.deepEqual(placed("cat > run.sh <<'EOF'\nrm app/x\nEOF\nsh run.sh"), [['run.sh', 'app/x'], false], 'a script written first is the text written');
});

test('[I-57] finding a written script is bounded: a cd past the path limit cuts the command short, never a silent miss', () => {
  const script = "cat > /tmp/f.py <<'EOF'\nopen('/w/app/a.rb', 'w')\nEOF\n";
  const folder = `${'a'.repeat(99)}/`.repeat(50);
  assert.deepEqual(writtenBy(`${script}cd ${folder}; python3 /tmp/f.py`), { writes: [{ path: '/tmp/f.py', cd: [], by: '>' }], sets: [], unplaced: true, unread: true, why: [{ code: 'shell-cut-short', word: null }] });
  assert.deepEqual(placing(`${script}cd app; python3 /tmp/f.py`), [['/tmp/f.py', 'app > /w/app/a.rb'], false], 'a short cd: the script is found and read');
  let ticks = 0;
  const clock = () => (ticks += 1) > 1000; // time passes as the reader works
  assert.equal(writtenBy(`${script}cd ${folder.slice(0, 4000)}; python3 ${'a '.repeat(5000)}/tmp/f.py`, clock).unread, true, 'the time ran out among 5,000 words');
});

test('[I-57] a target it cannot tell is unplaced, and only a write is ever named: a read, list, glob or cd operand never is', () => {
  for (const command of ['echo hi > "$OUT"', 'F=app/x.rb; echo hi > "$F"']) assert.deepEqual(placing(command), [[], true], command);
  assert.deepEqual(writes(`echo a > $'app/a.rb' && echo b > $"app/b.rb" && eval 'cat > app/c.rb'`), ['app/a.rb', 'app/b.rb', 'app/c.rb'], "$'' and $\"\" are quotes; eval runs its words");
  assert.deepEqual(placing(`echo a > $'\\x61pp/a.rb'`), [[], true], "an escape inside $'' cannot be told");
  for (const command of ['cat app/x.rb', 'grep -rn foo app | head -5', 'git diff -- app', 'bundle exec rspec spec/x_spec.rb 2>&1 | tail -3', 'ls app # > app/x.rb', 'cd app/models && ls', 'grep -n x app/*.rb']) {
    assert.deepEqual(placing(command), [[], false], command);
  }
  assert.deepEqual(writtenBy("cd app; grep x app/a.rb; python3 - <<EOF\nopen(p, 'w')\nEOF"), { writes: [], sets: [], unplaced: true, unread: false, why: [{ code: 'shell-code-path', word: 'python' }] },
    'no list of every literal: nothing but what is written, and why it cannot be placed');
  assert.deepEqual(writes('bundle exec rspec > /tmp/out.txt 2>&1'), ['/tmp/out.txt'], 'a file outside the repository is named; the caller places it');
  assert.equal(word("it's"), "'it'\\''s'", 'word is unchanged');
});

test('[I-57] a command inside a ${…} word is read like a $(…) one: its write is named; a ${…} with no command in it writes nothing', () => {
  against([
    ['echo ${X:-$(echo hi > protected/b.txt)}', ['protected/b.txt']],
    ['echo "${X:-$(touch evil.txt)}"', ['evil.txt']],
    ['echo ${X:-`touch evil.txt`}', ['evil.txt']],
    [': ${X:=$(rm -f protected/a.txt)}', ['protected/a.txt']],
    ['echo ${X:-${Y:-$(touch app/n.txt)}}', ['app/n.txt']],
    ['echo ${X:-a b} ${#Y} "${Z/b/c}" > app/out.txt', ['app/out.txt']],
  ]);
});

test('[I-57] inside double quotes a single quote in a brace expansion is a plain character', () => {
  against([
    ["echo \"${X:-'$(touch sq.txt)'}\"", ['sq.txt']],
    ["echo \"a ${X:-'$(echo x > app/q.txt)'} b\"", ['app/q.txt']],
    ["echo ${X:-'$(touch sq.txt)'}", []], // unquoted, the single quotes keep the command literal: it never runs
  ]);
});

test('[I-57] a backslash-quote inside a brace or command expansion within double quotes is escaped, as bash reads it', () => {
  against([
    ['echo "${X:-\\"}" > f4', ['f4']],
    ['echo "$(echo \\") > f5" > f6', ['f6']], // the substitution ends at its `)`, so ` > f5` is text inside the quotes
    ['echo "$(echo "a\\"b" > in.txt)" > out.txt', ['in.txt', 'out.txt']],
  ]);
});

test('[I-57] inside double quotes a dollar before the closing quote is itself, so the rest of the command is still read', () => {
  against([
    ['grep "error$" log.txt > errors.txt', ['errors.txt']],
    ['grep -E "^v[0-9]+$" tags.txt; touch done.txt', ['done.txt']],
    ['echo "$\'" > b4.txt', ['b4.txt']],
    ['echo hi > "a$\'b"; echo hi > "c$"', ['a$\'b', 'c$']], // the `$` is part of the name
    ['echo "$\'$(touch b1)\'"', ['b1']],
    ['echo "${X:-$\'$(touch a3)\'}"', ['a3']],
    ['echo $\'$(touch b)\'', []], // negative: outside double quotes $'…' is a string, its command never runs
    ['echo $"x" > l.txt', ['l.txt']], // negative: outside double quotes $"…" is a string
  ]);
});

test('[I-57] a single quote in a double-quoted brace expansion is plain to the end of the braces, as the shells read it', () => {
  against([
    ['echo "${MSG:-can\'t build}" > out.txt', ['out.txt']],
    ['echo "${X:-\'}"; touch b1.txt; echo "\'"', ['b1.txt']],
    ["echo $'it\\'s' > out.txt", ['out.txt']],
    ["echo $'\\'$(touch x)' > o.txt", ['o.txt']], // a $(…) inside $'…' never runs
    ["echo ${X:-'}'} > o.txt", ['o.txt']], // negative: outside double quotes a `'` in ${…} is a quote, so its `}` ends nothing
  ]);
});

test('[I-57] an unplaced answer says why, each cause once with its code; each write says what wrote it', () => {
  const why = (command) => writtenBy(command).why.map(({ code, word: cause }) => `${code} ${cause}`);
  assert.deepEqual(why('echo a > "$OUT"; echo b > "$OUT"'), ['shell-word-expands "$OUT"']);
  assert.deepEqual(why('ls | xargs rm; git apply x.diff; git checkout --force main; cd $D && touch a'),
    ['shell-handed item', 'shell-writes-unnamed git', 'shell-writes-unnamed --force', 'shell-cd-lost a']);
  assert.deepEqual(why('bash -c "$X"; eval $Y; python3 -c "open(p, \'w\')"'), ['shell-word-expands "$X"', 'shell-word-expands $Y', 'shell-code-path python']);
  assert.deepEqual(why(Array.from({ length: 6 }).reduce((inner) => `bash -c ${word(inner)}`, 'touch x')), ['shell-too-deep null']);
  assert.deepEqual(writtenBy('grep "x$" a > b; sed -i s/a/b/ app/x.rb').why, [], 'negative: a placed answer has no why');
  assert.deepEqual(writtenBy('grep "x$" a > b; sed -i s/a/b/ app/x.rb').writes.map((w) => w.by), ['>', 'sed']);
  assert.deepEqual(kit.text.shell.readWords('grep "x$" a > b; echo $X'), [
    { words: [{ word: 'grep', literal: true }, { word: '"x$"', literal: true }, { word: 'a', literal: true }], redirs: [{ op: '>', word: 'b' }] },
    { words: [{ word: 'echo', literal: true }, { word: '$X', literal: false }], redirs: [] }]);
});

test('[I-57] 15 real commands, from their text only: each names exactly the files it writes, never a path only read', () => {
  for (const { from, command, writes: wanted, unplaced } of DENIALS.commands) assert.deepEqual(placing(command), [wanted, unplaced], from);
});
