// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// repo/file-role: the role cases, the rule and question pins, and the answers recorded in
// fixtures/file-role-golden.json over every path list of it (its $comment says what a row is).
const test = require('node:test');
const assert = require('node:assert/strict');
const { repo: FR } = require('@atlasbound/kit');
const { configs, worlds } = require('../fixtures/file-role-golden.json');
const ROWS = require('../fixtures/file-role-rows.json');

const CASES = {
  'lib/command.js': 'source', 'index.js': 'source', 'typings/index.d.ts': 'source', 'src/click/core.py': 'source',
  'tests/options.test.js': 'test', 'typings/index.test-d.ts': 'test', 'test/app.router.js': 'test', '__tests__/a.js': 'test',
  'tests/test_options.py': 'test', 'tests/conftest.py': 'test', 'pkg/server_test.go': 'test', 'e2e/login.spec.ts': 'test',
  'tests/fixtures/pm-echo.js': 'fixture', 'tests/fixtures-extensions/pm-try-ts.ts': 'fixture', '__mocks__/api.ts': 'fixture',
  'examples/action-this.js': 'example', 'src/Button.stories.tsx': 'example', 'docs/conf.py': 'docs', 'CHANGELOG.md': 'docs',
  'LICENSE': 'docs', '.editorconfig': 'config', '.github/workflows/tests.yml': 'config', 'package.json': 'config',
  'package-lock.json': 'generated', 'uv.lock': 'generated', 'dist/x.js': 'generated', 'node_modules/a/i.js': 'vendored',
  'artwork/logo.png': 'unclassified', 'test.js': 'test',
  'src/config.js': 'source', 'config/settings.py': 'source', 'jest.config.js': 'config', 'eslint.config.js': 'config',
};

test('every path has exactly one role; moduleRoots never decide; residue code is visible source', () => {
  for (const [p, role] of Object.entries(CASES)) assert.equal(FR.fileRole(p, { moduleRoots: ['tests', 'examples'] }).role, role, p);
  assert.deepEqual(FR.fileRole('scripts/release.js'), { role: 'source', rule: 'code', basis: 'residue' });
  assert.equal(FR.fileRole('lib/a.js').basis, 'convention');
  assert.deepEqual(FR.fileRole('examples/app/main.js', { roles: { examples: 'source' } }),
    { role: 'source', rule: 'operator:examples', basis: 'operator' }, 'the operator roles setting decides');
  assert.equal(FR.fileRole('tests/a.test.js', { roles: { 'tests/': 'example' } }).role, 'example');
});

// The code a Ruby application keeps under endings of its own reads source; a manifest reads config; ciphertext is never read, whatever its name.
test('a Ruby task, rack file and view are source; a gemspec is config; an encrypted file is config and a secret by name', () => {
  const source = ['lib/tasks/foo.rake', 'config.ru', 'app/views/users/show.html.erb', 'app/views/users/show.html.haml', 'app/views/users/show.html.slim', 'app/views/users/show.json.jbuilder', 'lib/tasks/secrets.rake', 'lib/tasks/credentials.rake'];
  for (const p of source) assert.equal(FR.fileRole(p).role, 'source', p);
  for (const p of source) assert.equal(FR.isSecretFile(p), false, p);
  assert.equal(FR.fileRole('foo.gemspec').role, 'config');
  assert.equal(FR.isSecretFile('foo.gemspec'), false);
  for (const p of ['config/credentials.yml.enc', 'config/credentials/production.yml.enc', 'config/secrets.yml.enc', 'config/other.yml.enc', 'data/dump.enc', 'x.ENC']) {
    assert.equal(FR.fileRole(p).role, 'config', p);
    assert.equal(FR.isSecretFile(p), true, p);
  }
  assert.deepEqual([FR.fileRole('spec/views/a.html.erb').role, FR.fileRole('spec/tasks/a.rake').role, FR.fileRole('vendor/x.rake').role, FR.fileRole('test/fixtures/a.erb').role], ['test', 'test', 'vendored', 'fixture']);
  assert.equal(FR.fileRole('src/enc').role, 'unclassified', 'a word is no ending');
  assert.equal(FR.isSecretFile('src/enc.rb'), false);
});

// the test folder and file shapes of the languages with no lowercase `tests/`. Rows, no language branch; each answer names the rule that decided.
test('a capitalised, dotted or joined test folder reads test; a word that only ends in those letters stays what it was', () => {
  const tests = ['A.Tests/FooTests.cs', 'src/Foo.Tests/Bar.cs', 'Foo.UnitTests/Bar.cs', 'Foo.Tests.Common/Bar.cs', 'Foo.Test/Bar.cs', 'Tests/a.swift', 'Tests/BarKit/a.swift', 'Test/a.php', 'BarTests/a.swift', 'src/commonTest/a.kt', 'src/integrationTest/a.java',
    'integration_tests/a.py', 'integration-tests/a.rs', 'pkg/foo.test/a.go', 'A.Tests/data.json'];
  for (const p of tests) assert.deepEqual(FR.fileRole(p), { role: 'test', rule: 'test-dir-or-name' }, p);
  const others = [['TESTS/a.js', 'source'], ['TestData/a.js', 'source'], ['Testing/a.js', 'source'], ['Contest/a.js', 'source'], ['src/latest/a.js', 'source'], ['my.latest/a.js', 'source'], ['Tests.txt', 'docs']];
  for (const [p, role] of others) assert.equal(FR.fileRole(p).role, role, p);
});

test('a test file name of a language with no test folder is read by its suffix', () => {
  const tests = ['src/FooTests.cs', 'src/FooTest.java', 'src/Foo.Tests.cs', 'Sources/FooTests.swift', 'lib/FooTest.php', 'src/FooTest.kt', 'src/FooIT.java', 'src/FooSpec.scala', 'src/foo_test.rs', 'src/test.rs', 'lib/foo_test.dart', 'lib/foo_test.exs', 'src/foo_test.cc', 'src/foo_unittest.cc'];
  for (const p of tests) assert.deepEqual(FR.fileRole(p), { role: 'test', rule: 'test-dir-or-name' }, p);
  for (const p of ['src/Latest.cs', 'src/Contest.java', 'src/TestTask.java', 'src/ABTest.java', 'src/SendTestTool.php', 'src/latest.rs', 'src/contest.cc', 'src/Spec.scala', 'src/Visit.java', 'src/AUDIT.java']) assert.equal(FR.fileRole(p).role, 'source', p);
});

// a shared test folder (spec/support) holds the team's helpers, but Rails keeps the specs OF its helpers in spec/helpers
test('a file named as a test is told by its name alone; a support file in a test folder is not', () => {
  const named = ['spec/helpers/admin/notes_helper_spec.rb', 'apps/web/pages/api/token.test.ts', 'tests/test_options.py', 'pkg/server_test.go'];
  for (const p of named) assert.equal(FR.namedAsTest(p), true, p);
  for (const p of ['spec/support/session.rb', 'test/helper.js', 'cypress/support/commands.ts', 'spec/fabricators/tag_fabricator.rb']) {
    assert.equal(FR.namedAsTest(p), false, p);
  }
});

test('an unknown operator role is a named refusal; the rule-based role still applies', () => {
  const { rules, refused } = FR.operatorRoles({ roles: { x: 'banana', lib: 'test' } });
  assert.deepEqual(refused, [{ prefix: 'x', role: 'banana' }]);
  assert.deepEqual(rules, [['lib', 'test']]);
  assert.equal(FR.fileRole('x/a.js', { roles: { x: 'banana' } }).role, 'source');
});

// section 3: every other named case, one row each (the rest are in CASES above). Each row names the rule that decided, not only the role.
test('a directory, an exact name and a generated name are case-sensitive; test, config and extension patterns fold', () => {
  const rows = [
    ['TestData/a.js', 'source', 'code', 'residue'], ['FIXTURES/a.js', 'fixture', 'fixture-dir'], ['__MOCKS__/x.ts', 'source', 'code', 'residue'],
    ['Jest.Config.JS', 'config', 'config-file'], ['makefile', 'unclassified', 'no-rule'], ['Makefile', 'config', 'config-file'],
    ['Docs/a.md', 'docs', 'docs-dir-or-prose'], ['Docs/a.js', 'source', 'code', 'residue'], ['TESTS/a.js', 'source', 'code', 'residue'],
    ['a.TEST.js', 'test', 'test-dir-or-name'], ['x/Conftest.py', 'test', 'test-dir-or-name'], ['src/Foo.Stories.tsx', 'source', 'code', 'convention'],
    ['LIB/a.go', 'source', 'code', 'residue'], ['readme.MD', 'docs', 'docs-dir-or-prose'], ['x.ENV', 'config', 'config-file'],
    ['build.gradle', 'unclassified', 'no-rule'], ['.Github/x.yml', 'config', 'config-file'], ['X.GENERATED.ts', 'source', 'code', 'residue'],
    ['license', 'docs', 'docs-dir-or-prose'], ['license.cc', 'source', 'code', 'residue'], ['license.json', 'config', 'config-file'],['src/history.js', 'source', 'code', 'convention'], ['src/Notice.ts', 'source', 'code', 'convention'],
    ['a.R', 'source', 'code', 'residue'],
  ];
  for (const [p, role, rule, basis] of rows) assert.deepEqual(FR.fileRole(p), basis ? { role, rule, basis } : { role, rule }, p);
});

test('rule 1, Q decision: total, a spelling pathKey refuses is unclassified and the rule names the refusal; nothing throws', () => {
  const rows = [['', 'path-empty'], ['.', 'path-empty'], ['./', 'path-empty'], ['/etc/x.js', 'path-absolute'], ['C:/x.js', 'path-absolute'],
    ['../x.js', 'path-outside-repo'], ['a/../b.js', 'path-outside-repo']];
  for (const [p, rule] of rows) {
    assert.deepEqual(FR.fileRole(p), { role: 'unclassified', rule }, `no config: ${JSON.stringify(p)}`);
    assert.deepEqual(FR.fileRole(p, { roles: { '': 'test' } }), { role: 'unclassified', rule }, `whole-repo operator: ${JSON.stringify(p)}`);
  }
});

test('rule 1: the path goes through pathKey first (NFC, POSIX, no dot segment), same answer for every spelling', () => {
  assert.deepEqual(FR.fileRole('tests\\a.js'), FR.fileRole('tests/a.js'));
  assert.equal(FR.fileRole('./tests//a.js').role, 'test');
  assert.deepEqual(FR.fileRole('tests/cafe\u0301.js', { roles: { 'tests/caf\u00e9.js': 'docs' } }), { role: 'docs', rule: 'operator:tests/caf\u00e9.js' });
  assert.deepEqual(FR.fileRole('tests/caf\u00e9.js', { roles: { 'tests/cafe\u0301.js': 'docs' } }), { role: 'docs', rule: 'operator:tests/caf\u00e9.js' });
});

test('rule 2: every operator prefix form is normalised; the rule names the normalised prefix', () => {
  for (const prefix of ['x', './x', 'x/', 'x\\', './x/', '.\\x\\']) {
    assert.deepEqual(FR.fileRole('x/a.js', { roles: { [prefix]: 'docs' } }), { role: 'docs', rule: 'operator:x' }, prefix);
    assert.deepEqual(FR.operatorRoles({ roles: { [prefix]: 'docs' } }), { rules: [['x', 'docs']], refused: [] }, prefix);
  }
});

test('rule 2: prefix empty or dot is the whole repository, and operator wins over every rule', () => {
  for (const prefix of ['', '.', './']) {
    for (const p of ['node_modules/a.js', 'dist/a.js', 'tests/a.test.js', 'LICENSE', 'artwork/logo.png']) {
      assert.deepEqual(FR.fileRole(p, { roles: { [prefix]: 'example' } }), { role: 'example', rule: 'operator:' }, `${prefix}|${p}`);
    }
  }
});

test('rule 2: longest prefix first whatever the written order; a prefix covers itself and under itself, never a sibling', () => {
  const inner = { role: 'fixture', rule: 'operator:a/b' };
  for (const roles of [{ a: 'docs', 'a/b': 'fixture', '': 'test' }, { '': 'test', 'a/b': 'fixture', a: 'docs' }]) {
    assert.deepEqual(FR.fileRole('a/b/c.js', { roles }), inner);
    assert.deepEqual(FR.fileRole('a/b', { roles }), inner, 'equal to the prefix');
    assert.deepEqual(FR.fileRole('a/bc.js', { roles }), { role: 'docs', rule: 'operator:a' }, 'a/bc is not under a/b');
    assert.deepEqual(FR.fileRole('z.js', { roles }), { role: 'test', rule: 'operator:' });
    assert.deepEqual(FR.operatorRoles({ roles }).rules, [['a/b', 'fixture'], ['a', 'docs'], ['', 'test']]);
  }
  assert.deepEqual(FR.fileRole('ab/c.js', { roles: { a: 'docs' } }), { role: 'source', rule: 'code', basis: 'residue' }, 'ab is not under a');
  assert.deepEqual(FR.fileRole('A/c.js', { roles: { a: 'docs' } }), { role: 'source', rule: 'code', basis: 'residue' }, 'a prefix is exact-case');
});

test('rule 2: role source carries basis operator, every other operator role carries no basis key', () => {
  assert.deepEqual(FR.fileRole('a.png', { roles: { 'a.png': 'source' } }), { role: 'source', rule: 'operator:a.png', basis: 'operator' });
  assert.ok(!('basis' in FR.fileRole('a.js', { roles: { 'a.js': 'test' } })));
  assert.ok(!('basis' in FR.fileRole('tests/a.js')));
});

test('a refused role is never applied and leaves the other rules alone', () => {
  const roles = { lib: 'banana', 'lib/a': 'test', '/abs': 'docs', '../up': 'docs', 'a/../b': 'docs', n: 5 };
  assert.deepEqual(FR.operatorRoles({ roles }), {
    rules: [['lib/a', 'test']],
    refused: [{ prefix: 'lib', role: 'banana' }, { prefix: '/abs', role: 'docs' }, { prefix: '../up', role: 'docs' }, { prefix: 'a/../b', role: 'docs' }, { prefix: 'n', role: 5 }],
  });
  assert.deepEqual(FR.fileRole('lib/b.js', { roles }), { role: 'source', rule: 'code', basis: 'convention' });
  assert.deepEqual(FR.fileRole('b/x.js', { roles }), { role: 'source', rule: 'code', basis: 'residue' });
});

test('rule 3: no roles at all is no rules and no refusals, for every absent spelling', () => {
  for (const config of [undefined, null, {}, { roles: null }, { roles: {} }]) assert.deepEqual(FR.operatorRoles(config), { rules: [], refused: [] });
});

test('rule 4: ORDER IS THE CONTRACT, the first matching row decides when several match', () => {
  const rows = [
    ['node_modules/dist/a.test.js', 'vendored'], ['dist/fixtures/a.js', 'generated'], ['tests/fixtures/a.test.js', 'fixture'],
    ['examples/tests/a.js', 'test'], ['examples/a.md', 'example'], ['docs/x.json', 'docs'], ['.github/a.js', 'config'],
    ['tests/package-lock.json', 'generated'], ['README.test.md', 'test'], ['x.config.md', 'docs'],
  ];
  for (const [p, role] of rows) assert.equal(FR.fileRole(p).role, role, p);
  assert.deepEqual(FR.RULES.map(([role, id]) => [role, id]), [['vendored', 'vendored-dir'], ['generated', 'generated-output'], ['fixture', 'fixture-dir'],
    ['test', 'test-dir-or-name'], ['example', 'example-dir-or-story'], ['docs', 'docs-dir-or-prose'], ['config', 'config-file']]);
});

test('rule 4: a directory rule looks at directories only, a file with that name is not in that directory', () => {
  assert.equal(FR.fileRole('a/vendor').role, 'unclassified');
  assert.equal(FR.fileRole('a/dist.js').role, 'source');
  assert.equal(FR.fileRole('a/tests.js').role, 'source');
  assert.equal(FR.fileRole('a/fixtures.js').role, 'source');
});

// Rule 4 written out: one row per listed name of every vocabulary, so a dropped word is a named failure.
const VOCABULARY = {
  vendored: ['node_modules/a', 'vendor/a', 'third_party/a', 'third-party/a', 'thirdparty/a', 'bower_components/a'],
  generated: ['dist/a', 'build/a', 'out/a', 'coverage/a', 'generated/a', '__generated__/a', 'a.generated.ts', 'a.min.js', 'a.min.css', 'a_pb2.py', 'a_pb2_grpc.py',
    'a.pb.go', 'a.pb.js', 'a.pb.ts', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', 'uv.lock', 'Pipfile.lock', 'Cargo.lock',
    'go.sum', 'Gemfile.lock', 'composer.lock'],
  fixture: ['testdata/a', 'test-data/a', '__mocks__/a', '__snapshots__/a', 'fixture/a', 'fixtures/a', 'fixtures-x/a', 'fixture_x/a', '__fixtures__/a', '__fixture-x__/a', 'Fixture/a'],
  test: ['test/a', 'tests/a', '__tests__/a', 'spec/a', 'specs/a', 'e2e/a', 'cypress/a', 'playwright/a', 'a.test.js', 'a.spec.ts', 'a.test-d.ts', 'a_test.go', 'a_test.py', 'a_test.rb',
    'a_spec.rb', 'test_a.py', 'conftest.py', 'test.js', 'test.jsx', 'test.mjs', 'test.cjs', 'test.ts', 'test.tsx', 'test.mts', 'test.cts', 'test.py'],
  example: ['example/a', 'examples/a', 'demo/a', 'demos/a', 'sample/a', 'samples/a', 'a.stories.js', 'a.stories.jsx', 'a.stories.ts', 'a.stories.tsx'],
  docs: ['docs/a', 'doc/a', 'a.md', 'a.markdown', 'a.mdx', 'a.rst', 'a.adoc', 'a.txt', 'LICENSE', 'LICENCE', 'LICENSE.bin', 'COPYING', 'AUTHORS', 'NOTICE', 'CHANGELOG', 'CHANGES', 'HISTORY', 'CONTRIBUTING'],
  config: ['.github/a', '.circleci/a', '.gitlab/a', '.husky/a', '.vscode/a', '.devcontainer/a', '.idea/a', 'a.json', 'a.yaml', 'a.yml', 'a.toml', 'a.ini', 'a.cfg', 'a.conf', 'a.properties',
    'a.env', 'a.po', 'a.arb', 'a.xlf', 'a.config.js', 'a.xliff', 'a.json5', 'a.jsonc', 'a.pot', '.x', 'Makefile', 'Dockerfile', 'Procfile', 'Vagrantfile', 'setup.py', 'noxfile.py', 'tox.ini', 'Gemfile', 'Rakefile'],
};

test('rule 4: every listed name of every vocabulary reaches its role', () => {
  for (const [role, paths] of Object.entries(VOCABULARY)) for (const p of paths) assert.equal(FR.fileRole(p).role, role, p);
});

test('rule 5: every code extension and source root; a code name outside a root is visible residue, never promoted', () => {
  const exts = ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts', 'py', 'go', 'rb', 'java', 'kt', 'cs', 'php', 'rs', 'swift', 'scala', 'vue', 'svelte', 'css', 'scss', 'sql', 'prisma',
    'graphql', 'gql', 'sh', 'ex', 'exs', 'dart', 'c', 'cc', 'cpp', 'h', 'hpp', 'm', 'lua', 'r', 'pyi', 'kts', 'less', 'sass'];
  for (const e of exts) assert.deepEqual(FR.fileRole(`scripts/a.${e}`), { role: 'source', rule: 'code', basis: 'residue' }, e);
  const roots = ['lib', 'src', 'app', 'apps', 'pkg', 'cmd', 'internal', 'typings', 'types', 'migrations', 'db', 'prisma', 'supabase', 'packages', 'bin', 'server', 'client', 'api'];
  for (const r of roots) {
    assert.deepEqual(FR.fileRole(`${r}/a.js`), { role: 'source', rule: 'code', basis: 'convention' }, r);
    assert.equal(FR.fileRole(`x/${r}/a.js`).basis, 'convention', `any directory, not only the first: ${r}`);
  }
  assert.equal(FR.fileRole('lib.js').basis, 'residue', 'a file named like a root is not under it');
  assert.equal(FR.fileRole('integration/test.sh').role, 'source', 'test.sh is not in the test.<ext> list');
});

test('rule 6: no rule and no code extension is unclassified, under a source root too: a role is never guessed', () => {
  for (const p of ['src/logo.png', 'a.bak', 'noext', 'x/Dockerfile.dev', 'js']) assert.deepEqual(FR.fileRole(p), { role: 'unclassified', rule: 'no-rule' }, p);
});

test('rule 8: a bare config.js is source (it READS config), a tool config is config', () => {
  assert.equal(FR.fileRole('config.js').role, 'source');
  assert.equal(FR.fileRole('config.json').role, 'config');
  assert.equal(FR.fileRole('jest.config.js').role, 'config');
});

test('decision: directory names, exact file names and generated names are case-sensitive; fixture dirs fold, stories do not', () => {
  assert.equal(FR.fileRole('Node_Modules/a.js').role, 'source');
  assert.equal(FR.fileRole('DIST/a.js').role, 'source');
  assert.equal(FR.fileRole('TESTS/a.js').role, 'source');
  assert.equal(FR.fileRole('Tests/a.js').role, 'test', 'the one case this decision no longer holds: a capitalised test folder is how other languages spell it');
  assert.equal(FR.fileRole('YARN.LOCK').role, 'unclassified');
  assert.equal(FR.fileRole('A.MIN.JS').role, 'source');
  assert.equal(FR.fileRole('Fixtures-X/a.js').role, 'fixture');
  assert.equal(FR.fileRole('a.Stories.js').role, 'source');
});

test('decision: EVERY dotfile is config, code suffix or not; a directory starting with a dot is not a dotfile', () => {
  for (const p of ['.eslintrc.js', '.babelrc.js', '.env.example', 'a/.x.py', '.config.js']) assert.deepEqual(FR.fileRole(p), { role: 'config', rule: 'config-file' }, p);
  assert.equal(FR.fileRole('.claude/a.js').role, 'source');
  assert.equal(FR.fileRole('.claude/a.bak').role, 'unclassified');
  assert.equal(FR.fileRole('a.config').role, 'unclassified', 'the suffix alone is no tool config');
});

test('decision: RULES and ROLES stay public as frozen data, each row a', () => {
  assert.ok(Object.isFrozen(FR.ROLES) && Object.isFrozen(FR.RULES) && FR.RULES.every(Object.isFrozen));
  assert.deepEqual([...FR.ROLES], ['source', 'test', 'fixture', 'example', 'generated', 'vendored', 'config', 'docs', 'unclassified']);
  const row = (id) => FR.RULES.find(([, ruleId]) => ruleId === id)[2];
  assert.equal(row('vendored-dir')('vendor/a.js'), true);
  assert.equal(row('vendored-dir')('lib/a.js'), false);
  assert.equal(row('config-file')('package.json'), true);
  assert.ok(FR.RULES.every(([, , predicate]) => predicate.length === 1), 'one argument, the path');
});

test('a dual licence file is docs, at any depth; code, config and every other doc word keep their answer', () => {
  const role = (p) => FR.fileRole(p).role;
  for (const p of ['LICENSE-MIT', 'LICENSE-APACHE', 'crates/core/LICENSE-MIT', 'LICENCE-BSD']) assert.equal(role(p), 'docs', p);
  assert.equal(role('src/license-check.js'), 'source');
  assert.equal(role('license-mode.json'), 'config');
  assert.equal(role('NOTICEboard.js'), 'source');
  assert.equal(role('NOTICE-MIT'), 'unclassified');
  assert.equal(role('LICENSEx'), 'unclassified');
});

test('[I-40] the secret rule names a secret and leaves a template and a public key', () => {
  for (const p of ['.env', 'a/b/.env.local', '.npmrc', 'x/id_rsa']) assert.equal(FR.isSecretFile(p), true, p);
  for (const p of ['.env.example', 'x/id_rsa.pub', 'LICENSE-MIT']) assert.equal(FR.isSecretFile(p), false, p);
});

test('Clojure and ClojureScript code reads source, its tests read test, its build files read config', () => {
  const clojure = {
    'src/foo/core.clj': 'source', 'src/app/ui.cljs': 'source', 'src/shared.cljc': 'source', 'dev/user.clj': 'source', 'scripts/release.bb': 'source',
    'test/foo/core_test.clj': 'test', 'src/foo/core_test.clj': 'test', 'src/app/ui_test.cljs': 'test', 'src/shared_test.cljc': 'test',
    'deps.edn': 'config', 'bb.edn': 'config', 'shadow-cljs.edn': 'config', 'project.clj': 'config', 'build.clj': 'config', 'build.boot': 'config', 'sub/project.clj': 'config',
    'resources/config.edn': 'config', 'resources/data/seed.edn': 'config',
    '.clj-kondo/config.edn': 'vendored', '.clj-kondo/hooks/fire.clj': 'vendored', '.clj-kondo/imports/lib/x.clj': 'vendored',
  };
  for (const [file, role] of Object.entries(clojure)) assert.equal(FR.fileRole(file).role, role, file);
  assert.equal(FR.fileRole('src/foo/core.clj').basis, 'convention');
  assert.equal(FR.fileRole('dev/user.clj').basis, 'residue');
  assert.equal(FR.isSecretFile('resources/secrets.edn'), true, 'a store name in the new data format is still a store');
  assert.equal(FR.isSecretFile('src/app/secrets.clj'), false, 'a code file is judged by its text');
});

test('every extension, directory and name row of fixtures/file-role-rows.json answers as recorded', () => {
  const pathOf = { extensions: (e) => `zz.${e}`, upperExtensions: (e) => `zz.${e}`, dirs: (d) => `${d}/a.js` };
  const wrong = [];
  for (const [group, answers] of Object.entries(ROWS)) {
    if (group === '$comment') continue;
    for (const [answer, names] of Object.entries(answers)) {
      for (const name of names.split(' ')) {
        const p = (pathOf[group] ?? String)(name);
        const got = Object.values(FR.fileRole(p)).join(' ');
        if (got !== answer) wrong.push(`${group} ${p}: ${got} (recorded: ${answer})`);
      }
    }
  }
  assert.deepEqual(wrong, []);
});

test('fileRole answers every recorded path list as recorded, with and without an operator setting', () => {
  let n = 0;
  for (const [world, rows] of Object.entries(worlds)) {
    for (const [p, ...expected] of rows) {
      configs.forEach((config, i) => {
        assert.deepEqual(FR.fileRole(p, config ?? undefined), expected[i], `${world}: ${p} (config ${i})`);
        n += 1;
      });
    }
  }
  assert.equal(n, 1062, 'a dropped row is a lost comparison');
});

test('an example folder is one directly under the repository root or a workspace package root', () => {
  const rows = [['src/main/java/org/springframework/samples/petclinic/owner/OwnerController.java', 'source'], ['src/samples/a.ts', 'source'], ['lib/demo/a.rb', 'source'],
    ['examples/demo/src/App.jsx', 'example'], ['samples/a.go', 'example'], ['packages/web/examples/basic.ts', 'example'], ['apps/site/demo/a.tsx', 'example'],
    ['website/examples/a.js', 'source'], ['packages/examples/a.ts', 'source'], ['examples/a.md', 'example']];
  for (const [p, role] of rows) assert.equal(FR.fileRole(p).role, role, p);
});
