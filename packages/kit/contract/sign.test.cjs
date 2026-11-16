// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Ed25519 signatures through node's built-in crypto, over one domain-separated message. The RFC 8032 vectors (section 7.1,
// tests 1 to 3) are each checked three ways against the built-in (seed -> public key, seed + message -> signature,
// verify), so a vector wrong in any one field fails here. Keys live in memory only: no file is written.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { sign: { keyPair, sign, verify }, canonical: { canonical }, text: { secrets }, errors: { isFail } } = require('@atlasbound/kit');

const RFC8032 = [
  { seed: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', pub: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', msg: '',
    sig: 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b' },
  { seed: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb', pub: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c', msg: '72',
    sig: '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00' },
  { seed: 'c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7', pub: 'fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025', msg: 'af82',
    sig: '6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a' },
];
const PKCS8_ED25519 = '302e020100300506032b657004220420'; // RFC 8410: the fixed PKCS#8 header before a 32-byte Ed25519 seed
const keyOfSeed = (seed) => crypto.createPrivateKey({ key: Buffer.from(PKCS8_ED25519 + seed, 'hex'), format: 'der', type: 'pkcs8' });
const pemOfSeed = (seed) => keyOfSeed(seed).export({ format: 'pem', type: 'pkcs8' });
const carried = (hex) => Buffer.from(hex, 'hex').toString('base64url');
const refusedAs = (code, fn) => assert.throws(fn, { code });
/** The signed bytes, built here by hand: the context, a zero byte, the type, a zero byte, the canonical JSON. */
const layoutBytes = (type, value) => Buffer.concat([Buffer.from('atlasbound-signed/1', 'utf8'), Buffer.from([0]), Buffer.from(type, 'utf8'), Buffer.from([0]), Buffer.from(canonical(value), 'utf8')]);
const VALUE = { about: 'c-1', parts: ['t-2', 't-1'], n: 1 };

test('[I-61] Ed25519: node\'s built-in gives the public keys and signatures of RFC 8032 section 7.1, tests 1 to 3', () => {
  for (const { seed, pub, msg, sig } of RFC8032) {
    const key = keyOfSeed(seed);
    assert.equal(Buffer.from(crypto.createPublicKey(key).export({ format: 'jwk' }).x, 'base64url').toString('hex'), pub);
    assert.equal(crypto.sign(null, Buffer.from(msg, 'hex'), key).toString('hex'), sig);
    assert.equal(crypto.verify(null, Buffer.from(msg, 'hex'), crypto.createPublicKey(key), Buffer.from(sig, 'hex')), true);
    assert.equal(crypto.verify(null, Buffer.from(`${msg}00`, 'hex'), crypto.createPublicKey(key), Buffer.from(sig, 'hex')), false);
  }
});

test('[I-61] signature: the built-in\'s Ed25519 over context, zero byte, type, zero byte and the canonical JSON', () => {
  for (const { seed, pub } of RFC8032) {
    const signature = sign('note', VALUE, pemOfSeed(seed));
    assert.equal(signature, crypto.sign(null, layoutBytes('note', VALUE), keyOfSeed(seed)).toString('base64url'));
    assert.equal(Buffer.from(signature, 'base64url').length, 64);
    assert.equal(verify('note', { n: 1, parts: ['t-2', 't-1'], about: 'c-1' }, { signature, publicKey: carried(pub) }), undefined); // key order is not content
  }
});

test('[I-62] signature: one made without the context, or for another type, never verifies', () => {
  const { seed, pub } = RFC8032[0];
  const proof = (signature) => ({ signature, publicKey: carried(pub) });
  const bare = crypto.sign(null, Buffer.from(canonical(VALUE), 'utf8'), keyOfSeed(seed)).toString('base64url');
  refusedAs('signature-invalid', () => verify('note', VALUE, proof(bare)));
  const noContext = crypto.sign(null, Buffer.from(`approval\0${canonical(VALUE)}`, 'utf8'), keyOfSeed(seed)).toString('base64url');
  refusedAs('signature-invalid', () => verify('note', VALUE, proof(noContext)));
  const asApproval = sign('note', VALUE, pemOfSeed(seed));
  refusedAs('signature-invalid', () => verify('memo', VALUE, proof(asApproval)));
  refusedAs('signature-invalid', () => verify('approva', { l: VALUE }, proof(asApproval)));
  assert.equal(verify('note', VALUE, proof(asApproval)), undefined);
});

test('[I-62] signature: a wrong key, one changed byte of content or signature, or a second spelling is refused', () => {
  const [mine, other] = [keyPair(), keyPair()];
  const signature = sign('entry', VALUE, mine.privateKey);
  assert.equal(verify('entry', VALUE, { signature, publicKey: mine.publicKey }), undefined);
  refusedAs('signature-invalid', () => verify('entry', VALUE, { signature, publicKey: other.publicKey }));
  refusedAs('signature-invalid', () => verify('entry', { ...VALUE, n: 2 }, { signature, publicKey: mine.publicKey }));
  const flipped = Buffer.from(signature, 'base64url');
  flipped[10] ^= 1;
  refusedAs('signature-invalid', () => verify('entry', VALUE, { signature: flipped.toString('base64url'), publicKey: mine.publicKey }));
  for (const bad of [signature.slice(0, -1), `${signature}A`, `${signature}=`, signature.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), Buffer.from(signature, 'base64url').toString('base64'), '', null, 7]) {
    if (bad !== signature) refusedAs('signature-invalid', () => verify('entry', VALUE, { signature: bad, publicKey: mine.publicKey }));
  }
});

test('[I-63] keys: a public key travels as its raw 32 bytes in base64url, a private key as a PEM; any other form is refused', () => {
  const { publicKey, privateKey } = keyPair();
  assert.match(publicKey, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(publicKey, 'base64url').length, 32);
  assert.match(privateKey, /^-----BEGIN PRIVATE KEY-----\n[A-Za-z0-9+/=\n]+-----END PRIVATE KEY-----\n$/);
  assert.notEqual(keyPair().publicKey, publicKey);
  const signature = sign('receipt', VALUE, privateKey);
  const secondSpelling = publicKey.replace(/.$/, (c) => String.fromCharCode(c.charCodeAt(0) + 1)); // the same 32 bytes, unused low bits set
  assert.equal(Buffer.from(secondSpelling, 'base64url').equals(Buffer.from(publicKey, 'base64url')), true);
  for (const bad of [secondSpelling, publicKey.slice(1), `${publicKey}AA`, Buffer.from(publicKey, 'base64url').toString('hex'), '', undefined, 7]) {
    refusedAs('key-invalid', () => verify('receipt', VALUE, { signature, publicKey: bad }));
  }
  const x25519 = crypto.generateKeyPairSync('x25519').privateKey.export({ format: 'pem', type: 'pkcs8' });
  for (const bad of [x25519, privateKey.slice(0, 60), publicKey, '', undefined, 7, { key: privateKey }]) refusedAs('key-invalid', () => sign('receipt', VALUE, bad));
});

test('[I-63] signing: a type that is not a short lower-case word, or content with no canonical form, is refused before signing', () => {
  const { privateKey, publicKey } = keyPair();
  for (const bad of ['Approval', '', 'a b', 'a\0b', '9a', 'a'.repeat(65), undefined, 7]) {
    refusedAs('signed-type-invalid', () => sign(bad, VALUE, privateKey));
    refusedAs('signed-type-invalid', () => verify(bad, VALUE, { signature: 'A'.repeat(86), publicKey }));
  }
  refusedAs('json-not-json', () => sign('note', { at: new Date(0) }, privateKey));
  refusedAs('json-lone-surrogate', () => sign('note', { text: '\ud800' }, privateKey));
});

test('[I-64] private key: no refusal carries key text, and the trace scrub replaces a PEM block with a label', () => {
  const { privateKey, publicKey } = keyPair();
  const body = privateKey.split('\n')[1];
  const torn = privateKey.slice(0, privateKey.length - 40);
  const attempts = [
    () => sign('Bad Type', VALUE, privateKey), () => sign('note', { bad: undefined }, privateKey), () => sign('note', VALUE, torn),
    () => sign('note', VALUE, `${privateKey}trailing`), () => sign('note', VALUE, { privateKey }),
    () => verify('note', VALUE, { signature: privateKey, publicKey }), () => verify('note', VALUE, { signature: 'A'.repeat(86), publicKey: privateKey }),
  ];
  let refusals = 0;
  for (const attempt of attempts) {
    try { attempt(); } catch (err) {
      refusals += 1;
      assert.ok(isFail(err), `a coded refusal, not ${err}`);
      for (const part of [body, body.slice(0, 16), body.slice(-16), torn.split('\n')[1]]) assert.equal(`${err.message}\n${err.stack}\n${JSON.stringify(err)}`.includes(part), false);
    }
  }
  assert.ok(refusals >= 5, `${refusals} of ${attempts.length} attempts were refusals`);
  const scrubbed = secrets.scrub(`key: ${privateKey} end`);
  assert.equal(scrubbed.includes(body), false);
  assert.equal(scrubbed.includes(body.slice(0, 16)), false);
});
