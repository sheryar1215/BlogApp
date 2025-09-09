# `@ldapjs/asn1`

`@ldapjs/asn1` is a library for encoding and decoding ASN.1 datatypes in pure
JS. Currently BER encoding is supported.

### Decoding

The following reads an ASN.1 sequence with a boolean.

    var Ber = require('@ldapjs/asn1').Ber;

    var reader = new Ber.Reader(Buffer.from([0x30, 0x03, 0x01, 0x01, 0xff]));

    reader.readSequence();
    console.log('Sequence len: ' + reader.length);
    if (reader.peek() === Ber.Boolean)
      console.log(reader.readBoolean());

### Encoding

The following generates the same payload as above.

    var Ber = require('@ldapjs/asn1').Ber;

    var writer = new Ber.Writer();

    writer.startSequence();
    writer.writeBoolean(true);
    writer.endSequence();

    console.log(writer.buffer);

## Installation

    npm install asn1

## Bugs

See <https://github.com/ldapjs/asn1/issues>.
