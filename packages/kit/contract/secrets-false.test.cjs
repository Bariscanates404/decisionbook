// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// the false matches on real source, both sides: each form that holds no literal goes, and the same place holding a literal stays refused.
const test = require('node:test');
const assert = require('node:assert/strict');
const { text: { secrets: { find } }, repo: { isSecretFile } } = require('@atlasbound/kit');

const VALUE = 'qx1y2z3x1y2z3x1y2z37';

test('an empty name reads no next line as its value', () => {
  assert.deepEqual(find('AUTH0_CLIENT_SECRET=\nAUTH0_CLIENT_ID=\n'), []);
  assert.deepEqual(find('DB_PASS=\nDB_POOL2=\n'), []);
  assert.deepEqual(find('API_TOKEN =\n\nAPI_URL2=\n'), []);
});

test('a value on its own name\'s line, and a block value indented under its name, stay refused', () => {
  assert.notDeepEqual(find(`DB_PASS=${VALUE}\n`), []);
  assert.notDeepEqual(find(`password:\n  ${VALUE}\n`), [], 'the next-line fixture');
  assert.notDeepEqual(find(`SECRET= ${VALUE} # note\n`), []);
});

test('a placeholder password in an example URL holds no secret; a real one does', () => {
  assert.deepEqual(find('# Example: DATABASE_URL=postgresql://user:password@localhost:5432/app\n'), []);
  assert.deepEqual(find('postgres://root:changeme@db/app\n'), []);
  assert.notDeepEqual(find(`postgres://root:${VALUE}@db/app\n`), []);
  assert.notDeepEqual(find('postgres://root:hunter2@db/app\n'), []);
});

for (const [form, line, real] of [
  ['markup in a message', '"password_change_note": "<0>Note:</0> your password changes",', `"password_change_note": "<0>${VALUE}",`],
  ['a route path', 'tokenEndpoint: "/api/v1/preserved/token",', `tokenEndpoint: "${VALUE}/x",`],
  ['a template of interpolations', 'const unsignedToken = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;', `const unsignedToken = \`\${a}${VALUE}\`;`],
  ['a template over more than one line', 'const unsignedToken = `${base64UrlEncode(header)}.${base64UrlEncode(\n  payload\n)}`;', 'const unsignedToken = `${base64(header)}.${b(\n)}tail`;'],
  ['a route under a host', 'tokenEndpoint: `${auth.instance}/api/v1/preserved/token`,', `tokenEndpoint: \`\${auth.instance}/${VALUE}?x\`,`],
  ['a version range', '"js-tokens": "npm:^3.0.0 || ^4.0.0"', `"js-tokens": "npm:^3.0.0 || ${VALUE}?"`],
  ['a Ruby interpolation', 'password = "#{prefix2}#{suffix}"', `password = "#{a}${VALUE}"`],
  ['a package version', '"@types/jsonwebtoken": "npm:^9.0.5"', `"@types/jsonwebtoken": "npm:${VALUE}"`],
  ['a bare version', '"@aws-sdk/credential-provider-node": "3.470.0-beta",', `"@aws-sdk/credential-provider-node": "${VALUE}",`],
]) {
  test(`${form} holds no literal; the same place with one stays refused`, () => {
    assert.deepEqual(find(line), [], line);
    assert.notDeepEqual(find(real), [], real);
  });
}

test('a template of any environment is judged by its text; a store of real values keeps its name rule', () => {
  for (const name of ['.env.production.sample', '.env.example', 'apps/web/.env.local.template', 'env.sample']) assert.equal(isSecretFile(name), false, name);
  for (const name of ['.env', '.env.production', '.env.local', 'secrets/.env.example', '.env.sample.bak']) assert.equal(isSecretFile(name), true, name);
});

// a match costs its lines, not its file. What a mask shows passes the same find a file with no match passes.
const { masked } = require('@atlasbound/kit').text.secrets;
const AWS_KEY = `AKIA${'D'.repeat(16)}`;

test('a file with no match is the same string, invisible characters and all', () => {
  const text = 'const a​ = 1;\r\n\tb();\n\n';
  assert.equal(masked(text), text);
});

test('a matching line goes whole and every other line keeps its bytes and number', () => {
  const text = `a = 1\r\nkey = "${AWS_KEY}"\r\n\nb = 2\n`;
  assert.deepEqual(masked(text).split('\n'), ['a = 1\r', '█', '', 'b = 2', '']);
  assert.deepEqual(find(masked(text)), []);
});

test('nothing of a value is left beside its match, whatever the row could not reach', () => {
  const tails = [`password = "${VALUE} and more words"`, `dsn: "https://${'a1'.repeat(16)}@o451.example/42",`, `shared_secret: "\\xA7${VALUE}m\\xED\\xEC",`];
  tails.forEach((line) => assert.equal(masked(`${line}\n`), '█\n', line));
});

test('a key spelled through escapes is masked as find reads it, which a scrub cannot', () => {
  const spelled = `k = "\\u0041${AWS_KEY.slice(1)}"`;
  assert.notDeepEqual(find(spelled), []);
  assert.equal(masked(`a\n${spelled}\nb\n`), 'a\n█\nb\n');
});

test('an armour marks a body on lines no row sees, so such a text cannot be masked', () => {
  const body = 'MIIE'.padEnd(64, 'q');
  const armours = ['-----BEGIN RSA PRIVATE KEY-----', '-----begin  private key', `LS0tLS1CRUdJTiBSU0Eg${'q'.repeat(8)}`, 'PuTTY-User-Key-File-2: ssh-rsa', `MII${'q'.repeat(100)}`];
  armours.forEach((armour) => assert.equal(masked(`KEY = <<~PEM\n${armour}\n${body}\nPEM\n`), null, armour));
});

test('a shape no single line holds leaves the text unmasked, never shown', () => {
  const crossing = `Bearer\n${VALUE}abcdef\n`;
  assert.notDeepEqual(find(crossing), []);
  assert.equal(masked(crossing), null);
});
