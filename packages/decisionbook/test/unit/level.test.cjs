// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The level a planned path gives, as a table: a risk area is a folder or a file named for money or for who gets in, whole; a word
// inside a name, a test or a doc is none. A repository's own `risk` list stands in place of the built-in one, and the level says so.
const test = require('node:test');
const assert = require('node:assert/strict');
const { planLevel } = require('../../core/level.cjs');
const { foldPlan } = require('../../core/fold.cjs');

const levelOf = (file, proposed, risk = null) => planLevel(foldPlan([{ id: 'p', level: proposed },
  { t: 'link', rel: 'plans', to: `file:${file}` }]), [], risk);

// [a planned path, the level of normal work on it, the level of a small fix on it]
const PATHS = [
  ['src/pricing/quote.ts', 'normal', 'micro'], ['src/pricing/README.md', 'normal', 'micro'], ['test/pricing/quote.test.ts', 'normal', 'micro'],
  ['src/orders/price-label.ts', 'normal', 'micro'], ['src/ui/SessionList.tsx', 'normal', 'micro'], ['src/session/store.ts', 'normal', 'micro'],
  ['docs/pricing.md', 'normal', 'micro'], ['.github/workflows/ci.yml', 'normal', 'micro'], ['src/precision/x.ts', 'normal', 'micro'],
  ['src/services/authors.ts', 'normal', 'micro'], ['src/prices.ts', 'normal', 'micro'], ['src/Pricing.ts', 'normal', 'micro'],
  ['src/dicing/x.ts', 'normal', 'micro'], ['src/author/x.ts', 'normal', 'micro'], ['src/cicd/x.ts', 'normal', 'micro'],
  ['src/pipeline/x.ts', 'normal', 'micro'], ['src/orders/priceLabel.ts', 'normal', 'micro'], ['src/orders/price_label.ts', 'normal', 'micro'],
  ['src/orders/pricelabel.ts', 'normal', 'micro'], ['src/PRICING/x.ts', 'normal', 'micro'], ['src/orders/authToken.ts', 'normal', 'micro'],
  ['src/ci.ts', 'normal', 'micro'], ['src/lib/session.test.ts', 'normal', 'micro'], ['src/pricing/quote.spec.ts', 'normal', 'micro'],
  ['src/pricing/__fixtures__/q.json', 'normal', 'micro'], ['src/webhooks/README.md', 'normal', 'micro'], ['src/deploy.config.ts', 'normal', 'micro'],
  ['src/orders/XMLPrice.ts', 'normal', 'micro'], ['src/orders/price2.ts', 'normal', 'micro'], ['scripts/ci/run.sh', 'normal', 'micro'],
  ['src/orders/list.ts', 'normal', 'micro'], ['src/pricing/**', 'normal', 'normal'], ['src/orders/**', 'normal', 'normal'],
  ['src/pricing rules/x.ts', 'normal', 'micro'],
  // money, and who gets in: a folder or a file named so, whole
  ['src/auth/token.ts', 'critical', 'critical'], ['src/auth.ts', 'critical', 'critical'], ['src/Auth/Guard.ts', 'critical', 'critical'],
  ['lib/billing/charge.js', 'critical', 'critical'], ['app/payments/refund.rb', 'critical', 'critical'], ['src/checkout/**', 'critical', 'critical'],
  ['app/models/invoice.rb', 'critical', 'critical'], ['services/login/handler.go', 'critical', 'critical'], ['src/permissions.config.ts', 'critical', 'critical'],
  // a word inside a name, a test, a doc: none
  ['src/authors/list.ts', 'normal', 'micro'], ['src/orders/billingAddress.ts', 'normal', 'micro'], ['app/models/LoginSession.rb', 'normal', 'micro'],
  ['src/auth-ui/Button.tsx', 'normal', 'micro'], ['test/auth/login.test.js', 'normal', 'micro'], ['docs/billing.md', 'normal', 'micro'],
  ['src/payment_methods.ts', 'normal', 'micro'],
  // a schema or a migration is critical whatever the list says
  ['db/schema.rb', 'critical', 'critical'], ['src/migrations/001_add.sql', 'critical', 'critical'],
];

test('one path gives one level: a risk area is a folder or file named so, whole; nothing else in a name raises it', () => {
  for (const [file, normal, micro] of PATHS) {
    assert.deepEqual([levelOf(file, 'normal').level, levelOf(file, 'micro').level], [normal, micro], file);
  }
});

test('a repository\'s own risk list stands in place of the built-in one, and the level says what it decided', () => {
  const own = ['pricing', 'session'];
  const quote = levelOf('src/pricing/quote.ts', 'normal', own);
  assert.equal(quote.level, 'critical');
  assert.deepEqual(quote.signals, ['a risk area in a planned path (pricing: src/pricing/quote.ts, named in this repository\'s `risk` list)']);
  assert.deepEqual(quote.left, []);
  assert.equal(levelOf('src/Pricing.ts', 'micro', own).level, 'critical', 'a file named so, in any case');
  assert.equal(levelOf('src/orders/price-label.ts', 'normal', own).level, 'normal', 'a word inside a name is still none');
  const auth = levelOf('src/auth/token.ts', 'normal', own);
  assert.deepEqual([auth.level, auth.code, auth.left], ['normal', null, ['auth: src/auth/token.ts']], 'left out here: it runs as proposed, and the level says what was left out');
  assert.deepEqual(levelOf('src/auth/token.ts', 'micro', []).left, ['auth: src/auth/token.ts'], 'an empty list switches every area off');
  assert.equal(levelOf('db/schema.rb', 'normal', []).level, 'critical', 'never a schema path');
  assert.deepEqual(levelOf('src/auth/token.ts', 'normal').left, [], 'no list of its own: nothing is left out');
});
