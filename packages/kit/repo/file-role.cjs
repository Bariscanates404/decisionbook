// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE file-role owner: EXACTLY ONE role per repo path, from the path and the operator's `roles` alone. Directory, exact and generated names
// are exact-case; patterns fold.
const { keyOf, foldedKey, nameOf } = require('../base/paths.cjs');
const { visible } = require('../text/safe.cjs');

// The order is part of the contract: a caller that lists roles lists them in this order.
const ROLES = Object.freeze(['source', 'test', 'fixture', 'example', 'generated', 'vendored', 'config', 'docs', 'unclassified']);

const CODE = new RegExp('\\.([cm]?[jt]s|[jt]sx|pyi?|go|rb|rake|ru|erb|haml|slim|jbuilder|java|kts?|cs|php|rs|swift|scala|vue|svelte|s?css|less|sass'
  + '|sql|prisma|graphql|gql|sh|exs?|dart|c|cc|cpp|h|hpp|m|lua|r|clj[sc]?|bb)$', 'i');
const CONFIG_SUFFIX = /\.(json5?|jsonc|edn|yaml|yml|toml|ini|cfg|conf|properties|env|pot?|arb|xlf|xliff|gemspec|enc)$/i;

const dirsOf = (key) => key.split('/').slice(0, -1);
const dirIn = (...names) => (key) => dirsOf(key).some((dir) => names.includes(dir));
const dirLike = (pattern) => (key) => dirsOf(key).some((dir) => pattern.test(dir));
const nameIn = (...names) => (key) => names.includes(nameOf(key));
const nameLike = (pattern) => (key) => pattern.test(nameOf(key));
const either = (...tests) => (key) => tests.some((matches) => matches(key));
const WORKSPACES = ['packages', 'apps', 'libs', 'crates', 'plugins'];
const rootDirIn = (...names) => (key, [top, , third] = dirsOf(key)) => names.includes(top)
  || (WORKSPACES.includes(top) && names.includes(third));

const DOC_WORD = /^(?:(?:LICEN[CS]E|COPYING|AUTHORS|NOTICE|CHANGELOG|CHANGES|HISTORY|CONTRIBUTING)(?:\.|$)|LICEN[CS]E-)/; // LICENSE-MIT too
const DOC_WORD_ANY_CASE = new RegExp(DOC_WORD.source, 'i');
const docName = (key) => {
  const name = nameOf(key);
  return DOC_WORD.test(name) || (DOC_WORD_ANY_CASE.test(name) && !CODE.test(name) && !CONFIG_SUFFIX.test(name));
};

// Case-sensitive on purpose (`Contest`, `Latest.cs`, `TESTS` are not tests). Named limit: a feature folder `src/ABTests/` reads test;
// `roles` decides.
const TEST_DIR = /^(?:[\w.-]*[-_.])?(?:\w*Tests?|tests?)(?:\.[\w.-]+)?$/;
const TEST_NAME = new RegExp('(?:(?:^|[a-z0-9_.])Tests?\\.(?:cs|fs|vb|java|kts?|scala|groovy|swift|php|m)' + '|[a-z0-9]IT\\.(?:java|kts?|scala|groovy)|[a-z0-9]Spec\\.(?:scala|groovy|kts?|swift))$');
// A name that says the file holds tests, whatever its folder (`orders_spec.rb`, `cart.test.ts`, `test_cli.py`, `server_test.go`).
const TEST_FILE_NAME = either(
  nameLike(/\.(test|spec|test-d)\.[^.]+$|_(?:unit)?test\.(go|py|rb|rs|dart|exs|c|cc|cpp|clj[sc]?)$|_spec\.rb$/i),
  nameLike(/^test_.*\.py$|^conftest\.py$|^test\.([cm]?[jt]s|[jt]sx|py|rs)$/i),
  nameLike(TEST_NAME),
);

// ORDER IS THE CONTRACT: the first row that holds decides. (.clj-kondo holds a linter's copied imports.)
const RULES = Object.freeze([
  ['vendored', 'vendored-dir', dirIn('node_modules', 'vendor', 'third_party', 'third-party', 'thirdparty', 'bower_components', 'site-packages', '_vendor', '.clj-kondo')],
  ['generated', 'generated-output', either(
    dirIn('dist', 'build', 'out', 'coverage', 'generated', '__generated__', 'generated-sources', 'generated-test-sources'),
    nameLike(/(^|\.)generated\.|\.min\.(js|css)$|_pb2(_grpc)?\.py$|\.pb\.(go|js|ts)$/),
    nameIn('package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', 'uv.lock', 'Pipfile.lock', 'Cargo.lock', 'go.sum', 'Gemfile.lock', 'composer.lock'),
  )],
  ['fixture', 'fixture-dir', either(dirIn('testdata', 'test-data', '__mocks__', '__snapshots__'), dirLike(/^(__)?fixtures?([-_].*)?$/i))],
  ['test', 'test-dir-or-name', either(dirIn('test', 'tests', '__tests__', 'spec', 'specs', 'e2e', 'cypress', 'playwright'), dirLike(TEST_DIR),
    TEST_FILE_NAME)],
  ['example', 'example-dir-or-story', either(rootDirIn('example', 'examples', 'demo', 'demos', 'sample', 'samples'), nameLike(/\.stories\.([cm]?[jt]s|[jt]sx)$/))],
  ['docs', 'docs-dir-or-prose', either(dirIn('docs', 'doc'), nameLike(/\.(md|markdown|mdx|rst|adoc|txt)$/i), docName)],
  ['config', 'config-file', either( // a bare config.js READS config, so it stays source; jest.config.js is tool config, jest.config.d.ts is not
    dirIn('.github', '.circleci', '.gitlab', '.husky', '.vscode', '.devcontainer', '.idea'),
    nameLike(/^\.|\.config\.[^.]+$/i),
    nameLike(CONFIG_SUFFIX),
    nameIn('Makefile', 'Dockerfile', 'Procfile', 'Vagrantfile', 'setup.py', 'noxfile.py', 'tox.ini', 'Gemfile', 'Rakefile', 'project.clj', 'build.clj', 'build.boot'),
  )],
].map(Object.freeze));

const underSourceRoot = dirIn('lib', 'src', 'app', 'apps', 'pkg', 'cmd', 'internal', 'typings', 'types', 'migrations', 'db', 'prisma', 'supabase', 'packages', 'bin', 'server', 'client', 'api');

const verdict = (role, rule, basis) => (basis ? { role, rule, basis } : { role, rule });

function operatorRoles(config) {
  const rules = [];
  const refused = [];
  for (const [prefix, role] of Object.entries(config?.roles ?? {})) {
    const { key, code } = keyOf(prefix);
    const known = ROLES.includes(role) && (!code || code === 'path-empty');
    if (known) rules.push([key ?? '', role]);
    else refused.push({ prefix, role });
  }
  return { rules: rules.sort(([a], [b]) => b.length - a.length), refused };
}

const covers = (prefix, key) => prefix === '' || key === prefix || key.startsWith(`${prefix}/`);

function fileRole(file, config) {
  const { key, code } = keyOf(file);
  if (code) return verdict('unclassified', code);
  const operator = operatorRoles(config).rules.find(([prefix]) => covers(prefix, key));
  if (operator) return verdict(operator[1], `operator:${operator[0]}`, operator[1] === 'source' ? 'operator' : undefined);
  const row = RULES.find(([, , matches]) => matches(key));
  if (row) return verdict(row[0], row[1]);
  if (!CODE.test(nameOf(key))) return verdict('unclassified', 'no-rule');
  return verdict('source', 'code', underSourceRoot(key) ? 'convention' : 'residue');
}

// Never read, by NAME, whatever the role or case (an operator cannot change it); a key's .pub half is public, a near name (backup suffix)
// counts too.
const BACKUP = '(?:\\.(?:bak|old|orig|backup|save|copy|tmp|\\d+)|~)?';
const SECRET_NAMES = ['\\.env(?![a-z0-9])[\\s\\S]*', '\\.envrc', '.+\\.env', 'kube\\.config', 'wp-config\\.php(?:\\..+)?', `(?:rsa|deploy)_key${BACKUP}`,
  `.+\\.(?:pem|key|p12|pfx|p8|ppk|jks|keystore|jceks|kdbx|enc|tfvars(?:\\.json)?|tfstate(?:\\..+)?|tfplan)${BACKUP}`,
  '\\.?(?:npmrc|pgpass|pypirc|git-credentials|htpasswd|s3cfg|boto|vault-token|dockercfg|my\\.cnf|mylogin\\.cnf|token)', '_?\\.?netrc', '.*_history',
  'o?auth\\.json', 'service-?account.*\\.json', 'serviceaccountkey.*\\.json', 'firebase-adminsdk.*\\.json', 'accesstokens\\.json', 'tokens?\\.txt',
  'pass(?:words?)?\\.(?:txt|csv)'];
const SECRET_NAME = new RegExp(`^(?:${SECRET_NAMES.join('|')})$`, 'i');
// A kubeconfig or an ssh key holds a store only as data: `kubeconfig.go` and `id_ed25519.go` are source, judged by their text.
const DATA_SECRET_NAME = /^(?:kubeconfig.*|id_(?:rsa|dsa|ecdsa|ed25519)(?!.*\.pub$).*)$/i;
// Code named like a store (`src/env.ts`, `secret.service.ts`) is judged by its text; a sourced script keeps the name rule: nothing else
// says what it holds.
const STORE_WORD = /(?:^|[._-])(?:env|dotenv|secrets?|credentials?|creds)(?:[._-]|$)/i;
const STORE_NAME = /^(?:credentials.*|secrets?\..+|api[_-]?keys?(?:\.\w+)?)$/i;
const SOURCED = /\.(?:sh|sql)$/i;
const NOT_A_STORE = new RegExp(`\\.(?:md|markdown|mdx|rst|adoc|html?|hbs|ejs|erb|haml|slim|pug|twig|njk|svg|png|jpe?g|gif|ico|webp|avif|bmp|tiff?`
  + '|mp3|wav|ogg|oga|flac|aac|m4a|mp4|m4v|mov|webm|avi|mkv|woff2?|ttf|otf|eot)$', 'i');
const STORE_DIR = /(?:^|\/)(?:credentials|\.?secrets?)\//i;
const SECRET_PATH = /(?:^|\/)(?:\.docker\/config\.json$|kube\/config(?:[.~]|$)|(?:\.ssh|\.gnupg|\.aws|\.azure|\.auth|\.kube|\.envs?|\.config\/gcloud)\/)/i;
// A template holds names, not values: that excuses its name, never its directory.
const TEMPLATE = /^\.?env(?:\.[\w-]+)?\.(?:example|sample|template)$/i;

const isData = (p) => !CODE.test(p) && !NOT_A_STORE.test(p);
const dataNamed = (p, name) => isData(p) && (STORE_WORD.test(name) || DATA_SECRET_NAME.test(name));
const namedSecret = (p, name = nameOf(p)) => !TEMPLATE.test(name)
  && (SECRET_NAME.test(name) || dataNamed(p, name) || ((isData(p) || SOURCED.test(p)) && STORE_NAME.test(name)));

function isSecretFile(file) {
  const p = visible(foldedKey(file));
  return SECRET_PATH.test(p) || namedSecret(p) || (isData(p) && STORE_DIR.test(p));
}

/** true when a repository path's own name says it holds tests (a key; a spelling pathKey refuses is no test name). */
function namedAsTest(file) {
  const { key } = keyOf(file);
  return Boolean(key) && TEST_FILE_NAME(key);
}

module.exports = { ROLES, RULES, fileRole, operatorRoles, isSecretFile, namedAsTest };
