/**
 * Base62 encoding for URL-safe short identifiers.
 *
 * The alphabet is ordered 0-9, A-Z, a-z. This is the natural radix-62 ordering
 * and makes encoded values lexicographically sortable when they have equal
 * length — important when these strings are used as URL slugs displayed or
 * sorted in lists. The alternative (RFC 4648-style Base64url) uses '+/=' which
 * are not safe unencoded in URLs.
 */

export const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const ALPHABET_BYTES = BASE62_ALPHABET.length; // 62

// Precompute lookup table once at module load — avoids per-call indexOf on a 62-char string.
const CHAR_TO_VAL = (() => {
  const map = new Uint8Array(128); // covers ASCII
 map.fill(255); // 255 = sentinel for invalid chars
  for (let i = 0; i < ALPHABET_BYTES; i++) {
    map[BASE62_ALPHABET.charCodeAt(i)] = i;
  }
  return map;
})();

const INVALID = 255;

/**
 * Highest byte length at which encode/decode round-trips exactly under the
 * plain JS `number` API. Larger inputs must use the BigInt / Uint8Array paths.
 * 2^53 - 1 is 0x1F FFFF FFFF FFFF; dividing by 8 and flooring gives 7 bytes
 * with headroom, so 7 is the safe cutoff for the number variant.
 */
export const MAX_SAFE_BYTES = 7;

/**
 * Encode a non-negative integer into a Base62 string.
 *
 * We use BigInt internally because the integer type in JS (`number`) is
 * only safely integral up to 2^53. URL shorteners routinely handle IDs
 * larger than that (e.g. 64-bit primary keys), so rejecting big inputs would
 * defeat the purpose. Calling with a `number` is fine as long as it is a
 * non-negative integer within the safe range; we convert via BigInt.
 *
 * Zero returns "0", not the empty string. This keeps decode(encode(x)) === x
 * trivially true and avoids the ambiguity of an empty identifier.
 *
 * @param {number|bigint} value
 * @returns {string}
 */
export function encode(value) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new TypeError('encode: value must be an integer');
    }
    if (value < 0) {
      throw new RangeError('encode: value must be non-negative');
    }
    if (!Number.isSafeInteger(value)) {
      throw new RangeError('encode: number exceeds safe integer range; pass a BigInt instead');
    }
    value = BigInt(value);
  } else if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new RangeError('encode: value must be non-negative');
    }
  } else {
    throw new TypeError('encode: value must be a number or bigint');
  }

  if (value === 0n) return '0';

  let chars = [];
  let v = value;
  while (v > 0n) {
    const rem = v % 62n;
    chars.push(BASE62_ALPHABET[Number(rem)]);
    v = v / 62n;
  }
  return chars.reverse().join('');
}

/**
 * Decode a Base62 string back into a bigint.
 *
 * Returns a bigint rather than a number so that values above 2^53 survive
 * the round trip. Callers who know their IDs are small can coerce with
 * `Number(decode(s))`.
 *
 * Each character is validated against the alphabet; any byte outside it
 * (including lowercase in the wrong position, whitespace, '-') throws.
 *
 * @param {string} str
 * @returns {bigint}
 */
export function decode(str) {
  if (typeof str !== 'string') {
    throw new TypeError('decode: expected a string');
  }
  if (str.length === 0) {
    throw new RangeError('decode: empty string is not a valid Base62 value');
  }

  let result = 0n;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Reject non-ASCII up front so the lookup table's fixed 128 slots are enough.
    if (code > 127) {
      throw new RangeError(`decode: character '${str[i]}' is not in the Base62 alphabet`);
    }
    const val = CHAR_TO_VAL[code];
    if (val === INVALID) {
      throw new RangeError(`decode: character '${str[i]}' is not in the Base62 alphabet`);
    }
    result = result * 62n + BigInt(val);
  }
  return result;
}

/**
 * Encode an arbitrary byte string (Uint8Array) into Base62.
 *
 * Treats the bytes as a big-endian unsigned integer. This is the natural
 * representation for hash digests or raw IDs and matches how most Base62
 * libraries handle binary. Leading zero bytes are preserved by emitting a
 * leading '0' per zero byte — without that, decode would lose them and the
 * round trip would break for fixed-width IDs that happen to start with 0x00.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function encodeBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('encodeBytes: expected a Uint8Array');
  }
  if (bytes.length === 0) return '0';

  // Count and preserve leading zero bytes as leading '0' chars.
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) {
    leadingZeros++;
  }

  // Build the bigint from the non-zero prefix.
  let v = 0n;
  for (let i = leadingZeros; i < bytes.length; i++) {
    v = (v << 8n) + BigInt(bytes[i]);
  }

  let body = '';
  if (v > 0n) {
    const chunks = [];
    while (v > 0n) {
      chunks.push(BASE62_ALPHABET[Number(v % 62n)]);
      v = v / 62n;
    }
    body = chunks.reverse().join('');
  }

  return '0'.repeat(leadingZeros) + (body === '' ? '' : body);
}

/**
 * Decode a Base62 string into the original byte sequence.
 *
 * Mirrors `encodeBytes`: leading '0' characters map back to leading 0x00
 * bytes one-for-one, and the remainder is decoded into a big-endian byte
 * array of minimal width (no leading zero bytes beyond those implied by
 * the leading '0' chars).
 *
 * @param {string} str
 * @returns {Uint8Array}
 */
export function decodeToBytes(str) {
  if (typeof str !== 'string') {
    throw new TypeError('decodeToBytes: expected a string');
  }
  if (str.length === 0) {
    throw new RangeError('decodeToBytes: empty string is not a valid Base62 value');
  }

  // Leading '0' chars decode to leading 0x00 bytes.
  let leadingZeros = 0;
  while (leadingZeros < str.length && str[leadingZeros] === '0') {
    leadingZeros++;
  }

  // Decode the remainder.
  let v = 0n;
  for (let i = leadingZeros; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code > 127) {
      throw new RangeError(`decodeToBytes: character '${str[i]}' is not in the Base62 alphabet`);
    }
    const val = CHAR_TO_VAL[code];
    if (val === INVALID) {
      throw new RangeError(`decodeToBytes: character '${str[i]}' is not in the Base62 alphabet`);
    }
    v = v * 62n + BigInt(val);
  }

  // Convert bigint to big-endian bytes of minimal width.
  const bodyBytes = [];
  while (v > 0n) {
    bodyBytes.unshift(Number(v & 0xffn));
    v = v >> 8n;
  }

  const out = new Uint8Array(leadingZeros + bodyBytes.length);
  for (let i = 0; i < bodyBytes.length; i++) {
    out[leadingZeros + i] = bodyBytes[i];
  }
  return out;
}
