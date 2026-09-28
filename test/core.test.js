import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, encodeBytes, decodeToBytes, BASE62_ALPHABET } from '../src/index.js';

test('encode: zero returns "0", not empty', () => {
  assert.equal(encode(0), '0');
});

test('encode/decode round-trips small integers', () => {
  for (const n of [0, 1, 7, 61, 62, 63, 3843, 3844, 123456789]) {
    assert.equal(decode(encode(n)), BigInt(n), `round trip failed for ${n}`);
  }
});

test('encode produces the documented alphabet ordering', () => {
  // 0..9 then A..Z then a..z
  assert.equal(encode(0), '0');
  assert.equal(encode(9), '9');
  assert.equal(encode(10), 'A');
  assert.equal(encode(35), 'Z');
  assert.equal(encode(36), 'a');
  assert.equal(encode(61), 'z');
  assert.equal(encode(62), '10');
});

test('encode accepts bigint beyond safe integer range', () => {
  const big = 2n ** 63n + 7n;
  const s = encode(big);
  assert.equal(decode(s), big);
});

test('encode rejects negative numbers', () => {
  assert.throws(() => encode(-1), RangeError);
});

test('encode rejects non-integers', () => {
  assert.throws(() => encode(1.5), TypeError);
});

test('encode rejects numbers beyond safe integer range (use bigint instead)', () => {
  assert.throws(() => encode(Number.MAX_SAFE_INTEGER + 2), RangeError);
});

test('encode rejects other types', () => {
  assert.throws(() => encode('42'), TypeError);
  assert.throws(() => encode(null), TypeError);
  assert.throws(() => encode(undefined), TypeError);
});

test('decode rejects empty string', () => {
  assert.throws(() => decode(''), RangeError);
});

test('decode rejects characters outside the alphabet', () => {
  assert.throws(() => decode('abc-def'), RangeError);
  assert.throws(() => decode(' '), RangeError);
  assert.throws(() => decode('ABC+def'), RangeError);
});

test('decode rejects non-ASCII characters', () => {
  assert.throws(() => decode('ABCß'), RangeError);
});

test('decode returns bigint', () => {
  assert.equal(typeof decode('10'), 'bigint');
  assert.equal(decode('10'), 62n);
});

test('encodeBytes/decodeToBytes round-trip arbitrary bytes', () => {
  const cases = [
    new Uint8Array([0]),
    new Uint8Array([255]),
    new Uint8Array([1, 2, 3, 4, 5]),
    new Uint8Array([0, 0, 1]),
    new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff]),
  ];
  for (const bytes of cases) {
    const s = encodeBytes(bytes);
    const back = decodeToBytes(s);
    assert.deepEqual(back, bytes, `round trip failed for [${bytes.join(',')}]`);
  }
});

test('encodeBytes preserves leading zero bytes', () => {
  // Without explicit handling, leading 0x00 would vanish after the bigint conversion.
  const s = encodeBytes(new Uint8Array([0, 0, 5]));
  assert.equal(s.startsWith('00'), true);
  assert.deepEqual(decodeToBytes(s), new Uint8Array([0, 0, 5]));
});

test('encodeBytes rejects non-Uint8Array input', () => {
  assert.throws(() => encodeBytes([1, 2, 3]), TypeError);
  assert.throws(() => encodeBytes('abc'), TypeError);
});

test('decodeToBytes rejects empty string', () => {
  assert.throws(() => decodeToBytes(''), RangeError);
});

test('decodeToBytes rejects invalid characters', () => {
  assert.throws(() => decodeToBytes('abc!'), RangeError);
});

test('BASE62_ALPHABET has exactly 62 unique characters', () => {
 assert.equal(BASE62_ALPHABET.length, 62);
  assert.equal(new Set(BASE62_ALPHABET).size, 62);
});

test('alphabet is URL-safe (no +, /, or =)', () => {
  assert.equal(BASE62_ALPHABET.includes('+'), false);
  assert.equal(BASE62_ALPHABET.includes('/'), false);
  assert.equal(BASE62_ALPHABET.includes('='), false);
});
