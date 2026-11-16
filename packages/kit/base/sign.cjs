// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE signature owner: Ed25519 (RFC 8032) through node:crypto only, over ONE domain-separated message, so a signature made for one type of
// record never verifies as another.
// The signed bytes are: CONTEXT, a zero byte, the type, a zero byte, the canonical JSON (RFC 8785) of the value, all UTF-8. Neither the
// context, a type nor canonical JSON can hold a zero byte, so two different (type, value) pairs never give the same bytes. A public key
// travels as its raw 32 bytes in base64url, a private key as PKCS#8 PEM (the form the trace scrub knows), a signature as its 64 bytes in
// base64url. No key text and no engine message enters a refusal.
const crypto = require('node:crypto');
const { fail } = require('./errors.cjs');
const { canonical } = require('./canonical.cjs');

const CONTEXT = 'atlasbound-signed/1';
const TYPE = /^[a-z][a-z0-9-]{0,63}$/;
const SIZE = { publicKey: 32, signature: 64 };

function signedBytes(type, value) {
  if (typeof type !== 'string' || !TYPE.test(type)) throw fail('signed-type-invalid');
  return Buffer.from(`${CONTEXT}\0${type}\0${canonical(value)}`, 'utf8');
}

/** The bytes of base64url text that is exactly `size` bytes in its one spelling (no padding, no unused bit set), else null. */
function exactBytes(text, size) {
  const bytes = typeof text === 'string' ? Buffer.from(text, 'base64url') : Buffer.alloc(0);
  return bytes.length === size && bytes.toString('base64url') === text ? bytes : null;
}

function ed25519Key(make, form) {
  try {
    const key = make();
    if (key.asymmetricKeyType === 'ed25519') return key;
  } catch (err) {
    throw fail('key-invalid', `${form}: ${err.name}`); // the name only: the engine's message may quote what it read
  }
  throw fail('key-invalid', `${form}: not Ed25519`);
}
const privateOf = (pem) => ed25519Key(() => crypto.createPrivateKey({ key: typeof pem === 'string' ? pem : '', format: 'pem' }), 'private key');
const publicOf = (text) => ed25519Key(() => crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: exactBytes(text, SIZE.publicKey) ? text : '' }, format: 'jwk' }), 'public key');

/** keyPair() -> { publicKey, privateKey } in the carried forms. The one function here that is not pure: it asks the system for
 * randomness. */
function keyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return { publicKey: publicKey.export({ format: 'jwk' }).x, privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }) };
}

/** sign(type, value, privateKey) -> the signature, or a coded refusal: signed-type-invalid, canonical's refusals, key-invalid. */
const sign = (type, value, privateKey) => crypto.sign(null, signedBytes(type, value), privateOf(privateKey)).toString('base64url');

/** verify(type, value, { signature, publicKey }) returns nothing when the signature holds; otherwise it throws signature-invalid (or
 * signed-type-invalid, canonical's refusals, key-invalid). */
function verify(type, value, { signature, publicKey }) {
  const bytes = signedBytes(type, value);
  const key = publicOf(publicKey);
  const given = exactBytes(signature, SIZE.signature);
  if (!given || !crypto.verify(null, bytes, key, given)) throw fail('signature-invalid');
}

module.exports = Object.freeze({ keyPair, sign, verify });
