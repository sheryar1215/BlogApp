# `@ldapjs/asn1`

`@ldapjs/asn1` is a library for encoding and decoding ASN.1 datatypes in pure
JS. Currently BER encoding is supported.

### Decoding

The following reads an ASN.1 sequence with a boolean.

```js
const { BerReader, BerTypes } = require('@ldapjs/asn1')
const reader = new BerReader(Buffer.from([0x30, 0x03, 0x01, 0x01, 0xff]))

reader.readSequence()
console.log('Sequence len: ' + reader.length)
if (reader.peek() === BerTypes.Boolean)
console.log(reader.readBoolean())
```

### Encoding

The following generates the same payload as above.

```js
const { BerWriter } = require('@ldapjs/asn1');
const writer = new BerWriter();

writer.startSequence();
writer.writeBoolean(true);
writer.endSequence();

console.log(writer.buffer);
```

## Installation

```sh
npm install @ldapjs/asn1
```

## Bugs

See <https://github.com/ldapjs/asn1/issues>.
