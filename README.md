# Base62

Encode integers and byte strings into Base62 — an alphabet of `0-9A-Za-z` that is safe to put in a URL without percent-encoding. Intended for short ID generation in URL shorteners and similar services.

```js
import { encode, decode, encodeBytes, decodeToBytes } from 'base62';

const id = encode(123456789n);        // "8M0kX"
const back = decode(id);              // 123456789n (bigint)

const slug = encodeBytes(new Uint8Array([0, 0, 0xDE, 0xAD]));
const bytes = decodeToBytes(slug);    // Uint8Array [0, 0, 0xDE, 0xAD]
```

## Why

URL shorteners need identifiers that are compact, unambiguous in a path segment, and survive copy-paste through email and chat clients. Base64url nearly fits but `+`, `/`, and `=` either need encoding or invite bugs when someone hand-copies a link. Base62 trades a slightly larger output (~5% longer) for an alphabet that needs no escaping at all.

This library uses `bigint` internally so 64-bit primary keys round-trip exactly. `decode` returns a `bigint` rather than a `number` for the same reason; coerce with `Number(...)` only when you know the value is small.

## Edge cases

- `encode(0)` returns `"0"`, not the empty string. An empty identifier is a bug waiting to happen in a routing layer.
- `encodeBytes` preserves leading zero bytes by emitting leading `"0"` characters. Fixed-width binary IDs (e.g. 16-byte hashes truncated to 8) that happen to begin with `0x00` will therefore survive a round trip, at the cost of those strings looking shorter-than-expected when inspected.
- `encode` accepts `number` only within the safe integer range (`-(2^53 - 1)` to `2^53 - 1`, non-negative half). For larger values pass a `bigint` explicitly; mixing precision would silently corrupt IDs.

## Exports

- `encode(value: number | bigint): string`
- `decode(str: string): bigint`
- `encodeBytes(bytes: Uint8Array): string`
- `decodeToBytes(str: string): Uint8Array`
- `BASE62_ALPHABET: string` — the 62-character alphabet, `0-9A-Za-z`
- `MAX_SAFE_BYTES: number` — 7; byte arrays up to this length fit in a safe `number` (informational; the bigint path handles any length)

## Running the tests

```sh
node --test
```
