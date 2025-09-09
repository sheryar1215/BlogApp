'use strict'

const tap = require('tap')
const { Writable } = require('stream')
const BerReader = require('./reader')

// A sequence (0x30), 5 bytes (0x05) long, which consists of
// a string (0x04), 3 bytes (0x03) long, representing "foo".
const fooSequence = [0x30, 0x05, 0x04, 0x03, 0x66, 0x6f, 0x6f]

// ClientID certificate request example from
// https://web.archive.org/web/20221008202056/https://learn.microsoft.com/en-us/windows/win32/seccertenroll/about-object-identifier?redirectedfrom=MSDN
const microsoftOID = [
  0x06, 0x09, // OID; 9 bytes
  0x2b, 0x06, 0x01, 0x04, 0x01, 0x82, 0x37, 0x15, 0x14, // 1.3.6.1.4.1.311.21.20
  0x31, 0x4a, // Set; 4 bytes
  0x30, 0x48, // Sequence; 48 bytes
  0x02, 0x01, 0x09, // Integer; 1 bytes; 9
  0x0c, 0x23, // UTF8 String; 23 bytes
  0x76, 0x69, 0x63, 0x68, 0x33, 0x64, 0x2e, 0x6a, // vich3d.j
  0x64, 0x64, 0x6d, 0x63, 0x73, 0x63, 0x23, 0x6e, // domcsc.n
  0x74, 0x74, 0x65, 0x73, 0x74, 0x2e, 0x6d, 0x69, // ttest.mi
  0x63, 0x72, 0x6f, 0x73, 0x6f, 0x66, 0x74, 0x23, // crosoft.
  0x63, 0x64, 0x6d, // com
  0x0c, 0x15, // UTF8 String; 15 bytes
  0x4a, 0x44, 0x4f, 0x4d, 0x43, 0x53, 0x43, 0x5c, // JDOMCSC\
  0x61, 0x64, 0x6d, 0x69, 0x6e, 0x69, 0x73, 0x74, // administ
  0x72, 0x61, 0x74, 0x6f, 0x72, // rator
  0x0c, 0x07, // UTF8 String; 7 bytes
  0x63, 0x65, 0x72, 0x74, 0x72, 0x65, 0x71 // certreq
]

tap.test('must supply a buffer', async t => {
  const expected = TypeError('Must supply a Buffer instance to read.')
  t.throws(
    () => new BerReader(),
    expected
  )
  t.throws(
    () => new BerReader(''),
    expected
  )
})

tap.test('has toStringTag', async t => {
  const reader = new BerReader(Buffer.from('foo'))
  t.equal(Object.prototype.toString.call(reader), '[object BerReader]')
})

tap.test('buffer property returns buffer', async t => {
  const fooBuffer = Buffer.from(fooSequence)
  const reader = new BerReader(fooBuffer)

  t.equal(
    fooBuffer.compare(reader.buffer),
    0
  )
})

tap.test('peek reads but does not advance', async t => {
  const reader = new BerReader(Buffer.from([0xde]))
  const byte = reader.peek()
  t.equal(byte, 0xde)
  t.equal(reader.offset, 0)
})

tap.test('readBoolean', t => {
  t.test('read boolean true', async t => {
    const reader = new BerReader(Buffer.from([0x01, 0x01, 0xff]))
    t.equal(reader.readBoolean(), true, 'wrong value')
    t.equal(reader.length, 0x01, 'wrong length')
  })

  t.test('read boolean false', async t => {
    const reader = new BerReader(Buffer.from([0x01, 0x01, 0x00]))
    t.equal(reader.readBoolean(), false, 'wrong value')
    t.equal(reader.length, 0x01, 'wrong length')
  })

  t.end()
})

tap.test('readByte', t => {
  t.test('reads a byte and advances offset', async t => {
    const reader = new BerReader(Buffer.from([0xde]))
    t.equal(reader.offset, 0)
    t.equal(reader.readByte(), 0xde)
    t.equal(reader.offset, 1)
  })

  t.test('returns null if buffer exceeded', async t => {
    const reader = new BerReader(Buffer.from([0xde]))
    reader.readByte()
    t.equal(reader.readByte(), null)
  })

  t.test('peek does not advance offset', async t => {
    const reader = new BerReader(Buffer.from([0xde]))
    const byte = reader.readByte(true)
    t.equal(byte, 0xde)
    t.equal(reader.offset, 0)
  })

  t.end()
})

tap.test('readEnumeration', t => {
  t.test('read enumeration', async t => {
    const reader = new BerReader(Buffer.from([0x0a, 0x01, 0x20]))
    t.equal(reader.readEnumeration(), 0x20, 'wrong value')
    t.equal(reader.length, 0x01, 'wrong length')
  })

  t.end()
})

tap.test('readInt', t => {
  t.test('read 1 byte int', async t => {
    const reader = new BerReader(Buffer.from([0x02, 0x01, 0x03]))
    t.equal(reader.readInt(), 0x03, 'wrong value')
    t.equal(reader.length, 0x01, 'wrong length')
  })

  t.test('read 2 byte int', async t => {
    const reader = new BerReader(Buffer.from([0x02, 0x02, 0x7e, 0xde]))
    t.equal(reader.readInt(), 0x7ede, 'wrong value')
    t.equal(reader.length, 0x02, 'wrong length')
  })

  t.test('read 3 byte int', async t => {
    const reader = new BerReader(Buffer.from([0x02, 0x03, 0x7e, 0xde, 0x03]))
    t.equal(reader.readInt(), 0x7ede03, 'wrong value')
    t.equal(reader.length, 0x03, 'wrong length')
  })

  t.test('read 4 byte int', async t => {
    const reader = new BerReader(Buffer.from([0x02, 0x04, 0x7e, 0xde, 0x03, 0x01]))
    t.equal(reader.readInt(), 0x7ede0301, 'wrong value')
    t.equal(reader.length, 0x04, 'wrong length')
  })

  t.test('read 1 byte negative int', async t => {
    const reader = new BerReader(Buffer.from([0x02, 0x01, 0xdc]))
    t.equal(reader.readInt(), -36, 'wrong value')
    t.equal(reader.length, 0x01, 'wrong length')
  })

  t.test('read 2 byte negative int', async t => {
    const reader = new BerReader(Buffer.from([0x02, 0x02, 0xc0, 0x4e]))
    t.equal(reader.readInt(), -16306, 'wrong value')
    t.equal(reader.length, 0x02, 'wrong length')
  })

  t.test('read 3 byte negative int', async t => {
    const reader = new BerReader(Buffer.from([0x02, 0x03, 0xff, 0x00, 0x19]))
    t.equal(reader.readInt(), -65511, 'wrong value')
    t.equal(reader.length, 0x03, 'wrong length')
  })

  t.test('read 4 byte negative int', async t => {
    const reader = new BerReader(Buffer.from([0x02, 0x04, 0x91, 0x7c, 0x22, 0x1f]))
    t.equal(reader.readInt(), -1854135777, 'wrong value')
    t.equal(reader.length, 0x04, 'wrong length')
  })

  t.test('read 4 byte negative int (abandon request tag)', async t => {
    // Technically, an abandon request shouldn't ever have a negative
    // number, but this lets us test the feature completely.
    const reader = new BerReader(Buffer.from([0x80, 0x04, 0x91, 0x7c, 0x22, 0x1f]))
    t.equal(reader.readInt(0x80), -1854135777, 'wrong value')
    t.equal(reader.length, 0x04, 'wrong length')
  })

  t.test('correctly advances offset', async t => {
    const reader = new BerReader(Buffer.from([
      0x30, 0x06, // sequence; 6 bytes
      0x02, 0x04, 0x91, 0x7c, 0x22, 0x1f // integer; 4 bytes
    ]))
    const seqBuffer = reader.readTag(0x30)
    t.equal(
      Buffer.compare(
        seqBuffer,
        Buffer.from([0x02, 0x04, 0x91, 0x7c, 0x22, 0x1f]
        )
      ),
      0
    )

    t.equal(reader.readInt(), -1854135777, 'wrong value')
    t.equal(reader.length, 0x04, 'wrong length')
    t.equal(reader.offset, 8)
  })

  t.end()
})

tap.test('readLength', t => {
  t.test('reads from specified offset', async t => {
    const reader = new BerReader(Buffer.from(fooSequence))
    const offset = reader.readLength(1)
    t.equal(offset, 2)
    t.equal(reader.length, 5)
  })

  t.test('returns null if offset exceeds buffer', async t => {
    const reader = new BerReader(Buffer.from(fooSequence))
    const offset = reader.readLength(10)
    t.equal(offset, null)
    t.equal(reader.offset, 0)
  })

  t.test('reads from current offset', async t => {
    const reader = new BerReader(Buffer.from(fooSequence))
    const byte = reader.readByte()
    t.equal(byte, 0x30)

    const offset = reader.readLength()
    t.equal(offset, 2)
    t.equal(reader.length, 5)
  })

  t.test('throws for indefinite length', async t => {
    // Buffer would indicate a string of indefinite length.
    const reader = new BerReader(Buffer.from([0x04, 0x80]))
    t.throws(
      () => reader.readLength(1),
      Error('Indefinite length not supported.')
    )
  })

  t.test('throws if length too long', async t => {
    // Buffer would indicate a string whose length should be indicated
    // by the next 5 bytes (omitted).
    const reader = new BerReader(Buffer.from([0x04, 0x85]))
    t.throws(
      () => reader.readLength(1),
      Error('Encoding too long.')
    )
  })

  t.test('reads a long (integer) from length', async t => {
    const reader = new BerReader(Buffer.from([0x81, 0x94]))
    const offset = reader.readLength()
    t.equal(offset, 2)
    t.equal(reader.length, 148)
  })

  t.test(
    'returns null if long (integer) from length exceeds buffer',
    async t => {
      const reader = new BerReader(Buffer.from([0x82, 0x03]))
      const offset = reader.readLength(0)
      t.equal(offset, null)
      t.equal(reader.length, 0)
    })

  t.end()
})

tap.test('readOID', t => {
  t.test('returns null for bad buffer', async t => {
    const reader = new BerReader(Buffer.from([0x06, 0x03, 0x0a]))
    t.equal(reader.readOID(), null)
  })

  t.test('reads an OID', async t => {
    const input = Buffer.from(microsoftOID.slice(0, 11))
    const reader = new BerReader(input)
    t.equal(reader.readOID(), '1.3.6.1.4.1.311.21.20')
  })

  t.end()
})

tap.test('readRawBuffer', t => {
  t.test('requires number tag', async t => {
    const reader = new BerReader(Buffer.from([]))
    t.throws(
      () => reader.readRawBuffer(),
      Error('must specify an integer tag')
    )
  })

  t.test('throws if tag does not match', async t => {
    const reader = new BerReader(Buffer.from([0x04, 0x00]))
    t.throws(
      () => reader.readRawBuffer(0x05),
      Error('Expected 0x05: got 0x04')
    )
  })

  t.test('reads empty string buffer', async t => {
    const buffer = Buffer.from([0x04, 0x00])
    const reader = new BerReader(buffer)
    const readBuffer = reader.readRawBuffer(0x04)
    t.equal(buffer.compare(readBuffer), 0)
    t.equal(reader.offset, 2)
  })

  t.test('returns null for no value byte', async t => {
    const reader = new BerReader(Buffer.from([0x04]))
    const buffer = reader.readRawBuffer(0x04)
    t.equal(buffer, null)
    t.equal(reader.offset, 0)
  })

  t.test('returns null if value length exceeds buffer length', async t => {
    const reader = new BerReader(Buffer.from([0x04, 0x01]))
    const buffer = reader.readRawBuffer(0x04)
    t.equal(buffer, null)
    t.equal(reader.offset, 0)
  })

  t.test('return only next buffer', async t => {
    const buffer = Buffer.from([
      0x04, 0x03, 0x66, 0x6f, 0x6f,
      0x04, 0x03, 0x62, 0x61, 0x72,
      0x04, 0x03, 0x62, 0x61, 0x7a
    ])
    const reader = new BerReader(buffer)
    reader.readString()

    const readBuffer = reader.readRawBuffer(0x04)
    t.equal(reader.offset, 10)
    t.equal(readBuffer.compare(buffer.subarray(5, 10)), 0)
  })

  t.test('does not advance offset', async t => {
    const buffer = Buffer.from([
      0x04, 0x03, 0x66, 0x6f, 0x6f,
      0x04, 0x03, 0x62, 0x61, 0x72,
      0x04, 0x03, 0x62, 0x61, 0x7a
    ])
    const reader = new BerReader(buffer)
    reader.readString()

    const readBuffer = reader.readRawBuffer(0x04, false)
    t.equal(reader.offset, 5)
    t.equal(readBuffer.compare(buffer.subarray(5, 10)), 0)
  })

  t.test('reads buffer with multi-byte length', async t => {
    // 0x01b3 => 110110011 => 00000001 + 10110011 => 0x01 + 0xb3 => 435 bytes
    const bytes = [
      0x02, 0x01, 0x00, // simple integer
      0x04, 0x82, 0x01, 0xb3 // begin string sequence
    ]
    for (let i = 1; i <= 435; i += 1) {
      // Create a long string of `~` characters
      bytes.push(0x7e)
    }
    // Add a null sequence terminator
    Array.prototype.push.apply(bytes, [0x30, 0x00])

    const buffer = Buffer.from(bytes)
    const reader = new BerReader(buffer)
    t.equal(reader.readInt(), 0)
    t.equal(reader.readString(), '~'.repeat(435))
    t.equal(reader.readSequence(0x30), 0x30)
    reader.setOffset(0)

    // Emulate what we would do to read the filter value from an LDAP
    // search request that has a very large filter:
    reader.readInt()
    const tag = reader.peek()
    t.equal(tag, 0x04)
    const rawBuffer = reader.readRawBuffer(tag)
    t.equal(rawBuffer.compare(buffer.subarray(3, bytes.length - 2)), 0)
  })

  t.end()
})

tap.test('readSequence', t => {
  t.test('throws for tag mismatch', async t => {
    const reader = new BerReader(Buffer.from([0x04, 0x00]))
    t.throws(
      () => reader.readSequence(0x30),
      Error('Expected 0x30: got 0x04')
    )
  })

  t.test('returns null when read length is null', async t => {
    const reader = new BerReader(Buffer.from([0x30, 0x84, 0x04, 0x03]))
    t.equal(reader.readSequence(), null)
  })

  t.test('return read sequence and advances offset', async t => {
    const reader = new BerReader(Buffer.from(fooSequence))
    const result = reader.readSequence()
    t.equal(result, 0x30)
    t.equal(reader.offset, 2)
  })

  // Original test
  t.test('read sequence', async t => {
    const reader = new BerReader(Buffer.from([0x30, 0x03, 0x01, 0x01, 0xff]))
    t.ok(reader)
    t.equal(reader.readSequence(), 0x30, 'wrong value')
    t.equal(reader.length, 0x03, 'wrong length')
    t.equal(reader.readBoolean(), true, 'wrong value')
    t.equal(reader.length, 0x01, 'wrong length')
  })

  t.end()
})

tap.test('readString', t => {
  t.test('throws for tag mismatch', async t => {
    const reader = new BerReader(Buffer.from([0x30, 0x00]))
    t.throws(
      () => reader.readString(),
      Error('Expected 0x04: got 0x30')
    )
  })

  t.test('returns null when read length is null', async t => {
    const reader = new BerReader(Buffer.from([0x04, 0x84, 0x03, 0x0a]))
    t.equal(reader.readString(), null)
  })

  t.test('returns null when value bytes too short', async t => {
    const reader = new BerReader(Buffer.from([0x04, 0x03, 0x0a]))
    t.equal(reader.readString(), null)
  })

  t.test('returns empty buffer for zero length string', async t => {
    const reader = new BerReader(Buffer.from([0x04, 0x00]))
    const result = reader.readString(0x04, true)
    t.type(result, Buffer)
    t.equal(Buffer.compare(result, Buffer.alloc(0)), 0)
  })

  t.test('returns empty string for zero length string', async t => {
    const reader = new BerReader(Buffer.from([0x04, 0x00]))
    const result = reader.readString()
    t.type(result, 'string')
    t.equal(result, '')
  })

  t.test('returns string as buffer', async t => {
    const reader = new BerReader(Buffer.from(fooSequence.slice(2)))
    const result = reader.readString(0x04, true)
    t.type(result, Buffer)

    const expected = Buffer.from(fooSequence.slice(4))
    t.equal(Buffer.compare(result, expected), 0)
  })

  t.test('returns string as string', async t => {
    const reader = new BerReader(Buffer.from(fooSequence.slice(2)))
    const result = reader.readString()
    t.type(result, 'string')
    t.equal(result, 'foo')
  })

  // Original test
  t.test('read string', async t => {
    const dn = 'cn=foo,ou=unit,o=test'
    const buf = Buffer.alloc(dn.length + 2)
    buf[0] = 0x04
    buf[1] = Buffer.byteLength(dn)
    buf.write(dn, 2)
    const reader = new BerReader(buf)
    t.ok(reader)
    t.equal(reader.readString(), dn, 'wrong value')
    t.equal(reader.length, dn.length, 'wrong length')
  })

  // Orignal test
  t.test('long string', async t => {
    const buf = Buffer.alloc(256)
    const s =
      '2;649;CN=Red Hat CS 71GA Demo,O=Red Hat CS 71GA Demo,C=US;' +
      'CN=RHCS Agent - admin01,UID=admin01,O=redhat,C=US [1] This is ' +
      'Teena Vradmin\'s description.'
    buf[0] = 0x04
    buf[1] = 0x81
    buf[2] = 0x94
    buf.write(s, 3)
    const ber = new BerReader(buf.subarray(0, 3 + s.length))
    t.equal(ber.readString(), s)
  })

  t.end()
})

tap.test('readTag', t => {
  t.test('throws error for null tag', async t => {
    const expected = Error('Must supply an ASN.1 tag to read.')
    const reader = new BerReader(Buffer.from(fooSequence))

    t.throws(
      () => reader.readTag(),
      expected
    )
  })

  t.test('returns null for null byte tag', { skip: true })

  t.test('throws error for tag mismatch', async t => {
    const expected = Error('Expected 0x40: got 0x30')
    const reader = new BerReader(Buffer.from(fooSequence))

    t.throws(
      () => reader.readTag(0x40),
      expected
    )
  })

  t.test('returns null if field length is null', async t => {
    const reader = new BerReader(Buffer.from([0x05]))
    t.equal(reader.readTag(0x05), null)
  })

  t.test('returns null if field length greater than available bytes', async t => {
    const reader = new BerReader(Buffer.from([0x30, 0x03, 0x04, 0xa0]))
    t.equal(reader.readTag(0x30), null)
  })

  t.test('returns null if field length greater than available bytes', async t => {
    const reader = new BerReader(Buffer.from(fooSequence))
    const expected = Buffer.from([0x04, 0x03, 0x66, 0x6f, 0x6f])
    const result = reader.readTag(0x30)
    t.equal(Buffer.compare(result, expected), 0)
  })

  t.end()
})

tap.test('remain', t => {
  t.test('returns the size of the buffer if nothing read', async t => {
    const reader = new BerReader(Buffer.from(fooSequence))
    t.equal(7, reader.remain)
  })

  t.test('returns accurate remaining bytes', async t => {
    const reader = new BerReader(Buffer.from(fooSequence))
    t.equal(0x30, reader.readSequence())
    t.equal(5, reader.remain)
  })

  t.end()
})

tap.test('setOffset', t => {
  t.test('throws if not an integer', async t => {
    const expected = Error('Must supply an integer position.')
    const reader = new BerReader(Buffer.from(fooSequence))

    t.throws(
      () => reader.setOffset(1.2),
      expected
    )
    t.throws(
      () => reader.setOffset('2'),
      expected
    )
  })

  t.test('sets offset', async t => {
    const reader = new BerReader(Buffer.from(fooSequence))
    t.equal(reader.offset, 0)

    reader.setOffset(2)
    t.equal(reader.offset, 2)
    t.equal(reader.peek(), 0x04)
  })

  t.end()
})

tap.test('sequenceToReader', t => {
  t.test('returns new reader with full sequence', async t => {
    const multiSequence = [
      0x30, 14,
      ...fooSequence,
      ...fooSequence
    ]
    const reader = new BerReader(Buffer.from(multiSequence))

    // Read the intial sequence and verify current position.
    t.equal(0x30, reader.readSequence())
    t.equal(2, reader.offset)

    // Advance the buffer to the start of the first sub-sequence value.
    t.equal(0x30, reader.readSequence())
    t.equal(4, reader.offset)
    t.equal(12, reader.remain)

    // Get a new reader the consists of the first sub-sequence and verify
    // that the original reader's position has not changed.
    const fooReader = reader.sequenceToReader()
    t.equal(fooReader.remain, 7)
    t.equal(fooReader.offset, 0)
    t.equal(reader.offset, 4)
    t.equal(0x30, fooReader.readSequence())
    t.equal('foo', fooReader.readString())

    // The original reader should advance like normal.
    t.equal('foo', reader.readString())
    t.equal(0x30, reader.readSequence())
    t.equal('foo', reader.readString())
    t.equal(0, reader.remain)
    t.equal(16, reader.offset)
  })

  t.end()
})

tap.test('toHexDump', t => {
  t.test('dumps buffer', t => {
    const reader = new BerReader(
      Buffer.from([0x00, 0x01, 0x02, 0x03])
    )
    const expected = '00010203'

    let found = ''
    const destination = new Writable({
      write (chunk, encoding, callback) {
        found += chunk.toString()
        callback()
      }
    })

    destination.on('finish', () => {
      t.equal(found, expected)
      t.end()
    })

    reader.toHexDump({
      destination,
      closeDestination: true
    })
  })

  t.end()
})

// Original test
tap.test('anonymous LDAPv3 bind', async t => {
  const BIND = Buffer.alloc(14)
  BIND[0] = 0x30 // Sequence
  BIND[1] = 12 // len
  BIND[2] = 0x02 // ASN.1 Integer
  BIND[3] = 1 // len
  BIND[4] = 0x04 // msgid (make up 4)
  BIND[5] = 0x60 // Bind Request
  BIND[6] = 7 // len
  BIND[7] = 0x02 // ASN.1 Integer
  BIND[8] = 1 // len
  BIND[9] = 0x03 // v3
  BIND[10] = 0x04 // String (bind dn)
  BIND[11] = 0 // len
  BIND[12] = 0x80 // ContextSpecific (choice)
  BIND[13] = 0 // simple bind

  // Start testing ^^
  const ber = new BerReader(BIND)
  t.equal(ber.readSequence(), 48, 'Not an ASN.1 Sequence')
  t.equal(ber.length, 12, 'Message length should be 12')
  t.equal(ber.readInt(), 4, 'Message id should have been 4')
  t.equal(ber.readSequence(), 96, 'Bind Request should have been 96')
  t.equal(ber.length, 7, 'Bind length should have been 7')
  t.equal(ber.readInt(), 3, 'LDAP version should have been 3')
  t.equal(ber.readString(), '', 'Bind DN should have been empty')
  t.equal(ber.length, 0, 'string length should have been 0')
  t.equal(ber.readByte(), 0x80, 'Should have been ContextSpecific (choice)')
  t.equal(ber.readByte(), 0, 'Should have been simple bind')
  t.equal(null, ber.readByte(), 'Should be out of data')
})
