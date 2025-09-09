'use strict'

const tap = require('tap')
const { Writable } = require('stream')
const BerWriter = require('./writer')

tap.test('has toStringTag', async t => {
  const writer = new BerWriter()
  t.equal(Object.prototype.toString.call(writer), '[object BerWriter]')
})

tap.test('#ensureBufferCapacity', t => {
  t.test('does not change buffer size if unnecessary', async t => {
    const writer = new BerWriter({ size: 1 })
    t.equal(writer.size, 1)

    writer.writeByte(0x01)
    t.equal(writer.size, 1)
  })

  t.test('expands buffer to accomodate write skipping growth factor', async t => {
    const writer = new BerWriter({ size: 0 })
    t.equal(writer.size, 0)

    writer.writeByte(0x01)
    t.equal(writer.size, 1)
    t.equal(Buffer.compare(writer.buffer, Buffer.from([0x01])), 0)
  })

  t.test('expands buffer to accomodate write with growth factor', async t => {
    const writer = new BerWriter({ size: 1 })
    t.equal(writer.size, 1)

    writer.writeByte(0x01)
    writer.writeByte(0x02)
    t.equal(writer.size, 8)
    t.equal(Buffer.compare(writer.buffer, Buffer.from([0x01, 0x02])), 0)
  })

  t.end()
})

tap.test('appendBuffer', t => {
  t.test('throws if input not a buffer', async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.appendBuffer('foo'),
      Error('buffer must be an instance of Buffer')
    )
  })

  t.test('appendBuffer appends a buffer', async t => {
    const expected = Buffer.from([0x04, 0x03, 0x66, 0x6f, 0x6f, 0x66, 0x6f, 0x6f])
    const writer = new BerWriter()
    writer.writeString('foo')
    writer.appendBuffer(Buffer.from('foo'))
    t.equal(Buffer.compare(writer.buffer, expected), 0)
  })

  t.end()
})

tap.test('endSequence', t => {
  t.test('ends a sequence', async t => {
    const writer = new BerWriter({ size: 25 })
    writer.startSequence()
    writer.writeString('hello world')
    writer.endSequence()

    const ber = writer.buffer
    const expected = Buffer.from([
      0x30, 0x0d, // sequence; 13 bytes
      0x04, 0x0b, // string; 11 bytes
      0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x20, // 'hello '
      0x77, 0x6f, 0x72, 0x6c, 0x64 // 'world'
    ])
    t.equal(Buffer.compare(ber, expected), 0)
  })

  t.test('ends sequence of two byte length', async t => {
    const value = Buffer.alloc(0x81, 0x01)
    const writer = new BerWriter()

    writer.startSequence()
    writer.writeBuffer(value, 0x04)
    writer.endSequence()

    const ber = writer.buffer
    t.equal(
      Buffer.from([0x30, 0x81, 0x84, 0x04, 0x81, value.length])
        .compare(ber.subarray(0, 6)),
      0
    )
  })

  t.test('ends sequence of three byte length', async t => {
    const value = Buffer.alloc(0xfe, 0x01)
    const writer = new BerWriter()

    writer.startSequence()
    writer.writeBuffer(value, 0x04)
    writer.endSequence()

    const ber = writer.buffer
    t.equal(
      Buffer.from([0x30, 0x82, 0x01, 0x01, 0x04, 0x81, value.length])
        .compare(ber.subarray(0, 7)),
      0
    )
  })

  t.test('ends sequence of four byte length', async t => {
    const value = Buffer.alloc(0xaaaaaa, 0x01)
    const writer = new BerWriter()

    writer.startSequence()
    writer.writeBuffer(value, 0x04)
    writer.endSequence()

    const ber = writer.buffer
    t.equal(
      Buffer.from([0x30, 0x83, 0xaa, 0xaa, 0xaf, 0x04, 0x83, value.length])
        .compare(ber.subarray(0, 8)),
      0
    )
  })

  t.test('throws if sequence too long', async t => {
    const value = Buffer.alloc(0xaffffff, 0x01)
    const writer = new BerWriter()

    writer.startSequence()
    writer.writeByte(0x04)
    // We can't write the length because it is too long. However, this
    // still gives us enough data to generate the error we want to generate.
    writer.appendBuffer(value)
    t.throws(
      () => writer.endSequence(),
      Error('sequence too long')
    )
  })

  t.end()
})

tap.test('startSequence', t => {
  t.test('throws if tag not a number', async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.startSequence('30'),
      Error('tag must be a Number')
    )
  })

  t.test('starts a sequence', async t => {
    const writer = new BerWriter({ size: 1 })
    writer.startSequence()
    t.equal(writer.size, 8)

    const expected = Buffer.from([0x30, 0x00, 0x00, 0x00])
    t.equal(Buffer.compare(writer.buffer, expected), 0)
  })

  t.end()
})

tap.test('toHexDump', t => {
  t.test('dumps buffer', t => {
    const writer = new BerWriter()
    writer.appendBuffer(Buffer.from([0x00, 0x01, 0x02, 0x03]))
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

    writer.toHexDump({
      destination,
      closeDestination: true
    })
  })

  t.end()
})

tap.test('writeBoolean', t => {
  t.test('throws if input not a boolean', async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.writeBoolean(1),
      Error('boolValue must be a Boolean')
    )
  })

  t.test('throws if tag not a number', async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.writeBoolean(true, '5'),
      Error('tag must be a Number')
    )
  })

  t.test('writes true', async t => {
    const writer = new BerWriter({ size: 1 })
    writer.writeBoolean(true)
    t.equal(writer.size, 8)
    t.equal(Buffer.compare(writer.buffer, Buffer.from([0x01, 0x01, 0xff])), 0)
  })

  t.test('writes false', async t => {
    const writer = new BerWriter({ size: 1 })
    writer.writeBoolean(false)
    t.equal(writer.size, 8)
    t.equal(Buffer.compare(writer.buffer, Buffer.from([0x01, 0x01, 0x00])), 0)
  })

  t.test('writes with custom tag', async t => {
    const writer = new BerWriter({ size: 1 })
    writer.writeBoolean(true, 0xff)
    t.equal(writer.size, 8)
    t.equal(Buffer.compare(writer.buffer, Buffer.from([0xff, 0x01, 0xff])), 0)
  })

  // Original test
  t.test('write boolean', async t => {
    const writer = new BerWriter()

    writer.writeBoolean(true)
    writer.writeBoolean(false)
    const ber = writer.buffer

    t.equal(ber.length, 6, 'Wrong length')
    t.equal(ber[0], 0x01, 'tag wrong')
    t.equal(ber[1], 0x01, 'length wrong')
    t.equal(ber[2], 0xff, 'value wrong')
    t.equal(ber[3], 0x01, 'tag wrong')
    t.equal(ber[4], 0x01, 'length wrong')
    t.equal(ber[5], 0x00, 'value wrong')
  })

  t.end()
})

tap.test('writeBuffer', t => {
  t.test('throws if tag not a number', async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.writeBuffer(Buffer.alloc(0), '1'),
      Error('tag must be a Number')
    )
  })

  t.test('throws if buffer not a Buffer', async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.writeBuffer([0x00], 0x01),
      Error('buffer must be an instance of Buffer')
    )
  })

  t.test('write buffer', async t => {
    const writer = new BerWriter()
    // write some stuff to start with
    writer.writeString('hello world')
    let ber = writer.buffer
    const buf = Buffer.from([0x04, 0x0b, 0x30, 0x09, 0x02, 0x01, 0x0f, 0x01, 0x01,
      0xff, 0x01, 0x01, 0xff])
    writer.writeBuffer(buf.subarray(2, buf.length), 0x04)
    ber = writer.buffer

    t.equal(ber.length, 26, 'wrong length')
    t.equal(ber[0], 0x04, 'wrong tag')
    t.equal(ber[1], 11, 'wrong length')
    t.equal(ber.slice(2, 13).toString('utf8'), 'hello world', 'wrong value')
    t.equal(ber[13], buf[0], 'wrong tag')
    t.equal(ber[14], buf[1], 'wrong length')
    for (let i = 13, j = 0; i < ber.length && j < buf.length; i++, j++) {
      t.equal(ber[i], buf[j], 'buffer contents not identical')
    }
  })

  t.end()
})

tap.test('writeByte', t => {
  t.test('throws if input not a number', async t => {
    const writer = new BerWriter()
    t.equal(writer.size, 1024)

    t.throws(
      () => writer.writeByte('1'),
      Error('argument must be a Number')
    )
  })

  t.test('writes a byte to the backing buffer', async t => {
    const writer = new BerWriter()
    writer.writeByte(0x01)

    const buffer = writer.buffer
    t.equal(buffer.length, 1)
    t.equal(Buffer.compare(buffer, Buffer.from([0x01])), 0)
  })

  t.end()
})

tap.test('writeEnumeration', async t => {
  t.test('throws if value not a number', async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.writeEnumeration('1'),
      Error('value must be a Number')
    )
  })

  t.test('throws if tag not a number', async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.writeEnumeration(1, '1'),
      Error('tag must be a Number')
    )
  })

  t.test('writes an enumeration', async t => {
    const writer = new BerWriter({ size: 1 })
    writer.writeEnumeration(0x01)
    t.equal(writer.size, 8)
    t.equal(Buffer.compare(writer.buffer, Buffer.from([0x0a, 0x01, 0x01])), 0)
  })

  t.test('writes an enumeration with custom tag', async t => {
    const writer = new BerWriter({ size: 1 })
    writer.writeEnumeration(0x01, 0xff)
    t.equal(writer.size, 8)
    t.equal(Buffer.compare(writer.buffer, Buffer.from([0xff, 0x01, 0x01])), 0)
  })

  t.end()
})

tap.test('writeInt', t => {
  t.test('throws if int not a number', async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.writeInt('1'),
      Error('intToWrite must be a Number')
    )
  })

  t.test('throws if tag not a number', async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.writeInt(1, '1'),
      Error('tag must be a Number')
    )
  })

  t.test('write 1 byte int', async t => {
    const writer = new BerWriter()

    writer.writeInt(0x7f)
    const ber = writer.buffer

    t.equal(ber.length, 3, 'Wrong length for an int: ' + ber.length)
    t.equal(ber[0], 0x02, 'ASN.1 tag wrong (2) -> ' + ber[0])
    t.equal(ber[1], 0x01, 'length wrong(1) -> ' + ber[1])
    t.equal(ber[2], 0x7f, 'value wrong(3) -> ' + ber[2])
  })

  t.test('write 2 byte int', async t => {
    const writer = new BerWriter()

    writer.writeInt(0x7ffe)
    const ber = writer.buffer

    t.equal(ber.length, 4, 'Wrong length for an int')
    t.equal(ber[0], 0x02, 'ASN.1 tag wrong')
    t.equal(ber[1], 0x02, 'length wrong')
    t.equal(ber[2], 0x7f, 'value wrong (byte 1)')
    t.equal(ber[3], 0xfe, 'value wrong (byte 2)')
  })

  t.test('write 3 byte int', async t => {
    const writer = new BerWriter()

    writer.writeInt(0x7ffffe)
    const ber = writer.buffer

    t.equal(ber.length, 5, 'Wrong length for an int')
    t.equal(ber[0], 0x02, 'ASN.1 tag wrong')
    t.equal(ber[1], 0x03, 'length wrong')
    t.equal(ber[2], 0x7f, 'value wrong (byte 1)')
    t.equal(ber[3], 0xff, 'value wrong (byte 2)')
    t.equal(ber[4], 0xfe, 'value wrong (byte 3)')
  })

  t.test('write 4 byte int', async t => {
    const writer = new BerWriter()

    writer.writeInt(0x7ffffffe)
    const ber = writer.buffer

    t.equal(ber.length, 6, 'Wrong length for an int')
    t.equal(ber[0], 0x02, 'ASN.1 tag wrong')
    t.equal(ber[1], 0x04, 'length wrong')
    t.equal(ber[2], 0x7f, 'value wrong (byte 1)')
    t.equal(ber[3], 0xff, 'value wrong (byte 2)')
    t.equal(ber[4], 0xff, 'value wrong (byte 3)')
    t.equal(ber[5], 0xfe, 'value wrong (byte 4)')
  })

  t.test('write 1 byte negative int', async t => {
    const writer = new BerWriter()

    writer.writeInt(-128)
    const ber = writer.buffer

    t.equal(ber.length, 3, 'Wrong length for an int')
    t.equal(ber[0], 0x02, 'ASN.1 tag wrong')
    t.equal(ber[1], 0x01, 'length wrong')
    t.equal(ber[2], 0x80, 'value wrong (byte 1)')
  })

  t.test('write 2 byte negative int', async t => {
    const writer = new BerWriter()

    writer.writeInt(-22400)
    const ber = writer.buffer

    t.equal(ber.length, 4, 'Wrong length for an int')
    t.equal(ber[0], 0x02, 'ASN.1 tag wrong')
    t.equal(ber[1], 0x02, 'length wrong')
    t.equal(ber[2], 0xa8, 'value wrong (byte 1)')
    t.equal(ber[3], 0x80, 'value wrong (byte 2)')
  })

  t.test('write 3 byte negative int', async t => {
    const writer = new BerWriter()

    writer.writeInt(-481653)
    const ber = writer.buffer

    t.equal(ber.length, 5, 'Wrong length for an int')
    t.equal(ber[0], 0x02, 'ASN.1 tag wrong')
    t.equal(ber[1], 0x03, 'length wrong')
    t.equal(ber[2], 0xf8, 'value wrong (byte 1)')
    t.equal(ber[3], 0xa6, 'value wrong (byte 2)')
    t.equal(ber[4], 0x8b, 'value wrong (byte 3)')
  })

  t.test('write 4 byte negative int', async t => {
    const writer = new BerWriter()

    writer.writeInt(-1522904131)
    const ber = writer.buffer

    t.equal(ber.length, 6, 'Wrong length for an int')
    t.equal(ber[0], 0x02, 'ASN.1 tag wrong')
    t.equal(ber[1], 0x04, 'length wrong')
    t.equal(ber[2], 0xa5, 'value wrong (byte 1)')
    t.equal(ber[3], 0x3a, 'value wrong (byte 2)')
    t.equal(ber[4], 0x53, 'value wrong (byte 3)')
    t.equal(ber[5], 0xbd, 'value wrong (byte 4)')
  })

  t.test('throws for > 4 byte integer', { skip: true }, async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.writeInt(0xffffffffff),
      Error('BER ints cannot be > 0xffffffff')
    )
  })

  t.end()
})

tap.test('writeLength', t => {
  t.test('throws if length not a number', async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.writeLength('1'),
      Error('argument must be a Number')
    )
  })

  t.test('writes a single byte length', async t => {
    const writer = new BerWriter({ size: 4 })
    writer.writeLength(0x7f)
    t.equal(writer.buffer.length, 1)
    t.equal(Buffer.compare(writer.buffer, Buffer.from([0x7f])), 0)
  })

  t.test('writes a two byte length', async t => {
    const writer = new BerWriter({ size: 4 })
    writer.writeLength(0xff)
    t.equal(writer.buffer.length, 2)
    t.equal(Buffer.compare(writer.buffer, Buffer.from([0x81, 0xff])), 0)
  })

  t.test('writes a three byte length', async t => {
    const writer = new BerWriter({ size: 4 })
    writer.writeLength(0xffff)
    t.equal(writer.buffer.length, 3)
    t.equal(Buffer.compare(writer.buffer, Buffer.from([0x82, 0xff, 0xff])), 0)
  })

  t.test('writes a four byte length', async t => {
    const writer = new BerWriter({ size: 4 })
    writer.writeLength(0xffffff)
    t.equal(writer.buffer.length, 4)
    t.equal(Buffer.compare(writer.buffer, Buffer.from([0x83, 0xff, 0xff, 0xff])), 0)
  })

  t.test('throw if byte length is too long', async t => {
    const writer = new BerWriter({ size: 4 })
    t.throws(
      () => writer.writeLength(0xffffffffff),
      Error('length too long (> 4 bytes)')
    )
  })

  t.end()
})

tap.test('writeNull', t => {
  t.test('writeNull', async t => {
    const writer = new BerWriter({ size: 2 })
    writer.writeNull()
    t.equal(writer.size, 2)
    t.equal(Buffer.compare(writer.buffer, Buffer.from([0x05, 0x00])), 0)
  })

  t.end()
})

tap.test('writeOID', t => {
  t.test('throws if OID not a string', async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.writeOID(42),
      Error('oidString must be a string')
    )
  })

  t.test('throws if tag not a number', async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.writeOID('1.2.3', '1'),
      Error('tag must be a Number')
    )
  })

  t.test('throws if OID not a valid OID string', async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.writeOID('foo'),
      Error('oidString is not a valid OID string')
    )
  })

  t.test('writes an OID', async t => {
    const oid = '1.2.840.113549.1.1.1'
    const writer = new BerWriter()
    writer.writeOID(oid)

    const expected = Buffer.from([0x06, 0x09, 0x2a, 0x86,
      0x48, 0x86, 0xf7, 0x0d,
      0x01, 0x01, 0x01])
    const ber = writer.buffer
    t.equal(ber.compare(expected), 0)
  })

  t.test('writes OID covering all octet encodings', async t => {
    const oid = '1.2.200.17000.2100100.270100100'
    const writer = new BerWriter()
    writer.writeOID(oid)

    const expected = Buffer.from([
      0x06, 0x0f,
      0x2a, 0x81, 0x48, 0x81,
      0x84, 0x68, 0x81, 0x80,
      0x97, 0x04, 0x81, 0x80,
      0xe5, 0xcd, 0x04
    ])
    const ber = writer.buffer
    t.equal(ber.compare(expected), 0)
  })

  t.end()
})

tap.test('writeString', t => {
  t.test('throws if non-string supplied', async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.writeString(42),
      Error('stringToWrite must be a string')
    )
  })

  t.test('throws if tag not a number', async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.writeString('foo', '1'),
      Error('tag must be a number')
    )
  })

  t.test('writes an empty string', async t => {
    const writer = new BerWriter()
    writer.writeString('')

    const expected = Buffer.from([0x04, 0x00])
    t.equal(Buffer.compare(writer.buffer, expected), 0)
  })

  t.test('writes a string', async t => {
    const writer = new BerWriter({ size: 1 })
    writer.writeString('foo')

    const expected = Buffer.from([0x04, 0x03, 0x66, 0x6f, 0x6f])
    t.equal(Buffer.compare(writer.buffer, expected), 0)
    t.equal(writer.size, 8)
  })

  t.end()
})

tap.test('writeString', t => {
  t.test('throws if non-array supplied', async t => {
    const writer = new BerWriter()
    t.throws(
      () => writer.writeStringArray(42),
      Error('strings must be an instance of Array')
    )
  })

  t.test('write string array', async t => {
    const writer = new BerWriter()
    writer.writeStringArray(['hello world', 'fubar!'])
    const ber = writer.buffer

    t.equal(ber.length, 21, 'wrong length')
    t.equal(ber[0], 0x04, 'wrong tag')
    t.equal(ber[1], 11, 'wrong length')
    t.equal(ber.subarray(2, 13).toString('utf8'), 'hello world', 'wrong value')

    t.equal(ber[13], 0x04, 'wrong tag')
    t.equal(ber[14], 6, 'wrong length')
    t.equal(ber.subarray(15).toString('utf8'), 'fubar!', 'wrong value')
  })

  t.end()
})

tap.test('original tests', t => {
  t.test('resize internal buffer', async t => {
    const writer = new BerWriter({ size: 2 })
    writer.writeString('hello world')
    const ber = writer.buffer

    t.equal(ber.length, 13, 'wrong length')
    t.equal(ber[0], 0x04, 'wrong tag')
    t.equal(ber[1], 11, 'wrong length')
    t.equal(ber.subarray(2).toString('utf8'), 'hello world', 'wrong value')
  })

  t.test('sequence', async t => {
    const writer = new BerWriter({ size: 25 })
    writer.startSequence()
    writer.writeString('hello world')
    writer.endSequence()
    const ber = writer.buffer

    t.equal(ber.length, 15, 'wrong length')
    t.equal(ber[0], 0x30, 'wrong tag')
    t.equal(ber[1], 13, 'wrong length')
    t.equal(ber[2], 0x04, 'wrong tag')
    t.equal(ber[3], 11, 'wrong length')
    t.equal(ber.subarray(4).toString('utf8'), 'hello world', 'wrong value')
  })

  t.test('nested sequence', async t => {
    const writer = new BerWriter({ size: 25 })
    writer.startSequence()
    writer.writeString('hello world')
    writer.startSequence()
    writer.writeString('hello world')
    writer.endSequence()
    writer.endSequence()
    const ber = writer.buffer

    t.equal(ber.length, 30, 'wrong length')
    t.equal(ber[0], 0x30, 'wrong tag')
    t.equal(ber[1], 28, 'wrong length')
    t.equal(ber[2], 0x04, 'wrong tag')
    t.equal(ber[3], 11, 'wrong length')
    t.equal(ber.subarray(4, 15).toString('utf8'), 'hello world', 'wrong value')
    t.equal(ber[15], 0x30, 'wrong tag')
    t.equal(ber[16], 13, 'wrong length')
    t.equal(ber[17], 0x04, 'wrong tag')
    t.equal(ber[18], 11, 'wrong length')
    t.equal(ber.subarray(19, 30).toString('utf8'), 'hello world', 'wrong value')
  })

  t.test('LDAP bind message', async t => {
    const dn = 'cn=foo,ou=unit,o=test'
    const writer = new BerWriter()
    writer.startSequence()
    writer.writeInt(3) // msgid = 3
    writer.startSequence(0x60) // ldap bind
    writer.writeInt(3) // ldap v3
    writer.writeString(dn)
    writer.writeByte(0x80)
    writer.writeByte(0x00)
    writer.endSequence()
    writer.endSequence()
    const ber = writer.buffer

    t.equal(ber.length, 35, 'wrong length (buffer)')
    t.equal(ber[0], 0x30, 'wrong tag')
    t.equal(ber[1], 33, 'wrong length')
    t.equal(ber[2], 0x02, 'wrong tag')
    t.equal(ber[3], 1, 'wrong length')
    t.equal(ber[4], 0x03, 'wrong value')
    t.equal(ber[5], 0x60, 'wrong tag')
    t.equal(ber[6], 28, 'wrong length')
    t.equal(ber[7], 0x02, 'wrong tag')
    t.equal(ber[8], 1, 'wrong length')
    t.equal(ber[9], 0x03, 'wrong value')
    t.equal(ber[10], 0x04, 'wrong tag')
    t.equal(ber[11], dn.length, 'wrong length')
    t.equal(ber.subarray(12, 33).toString('utf8'), dn, 'wrong value')
    t.equal(ber[33], 0x80, 'wrong tag')
    t.equal(ber[34], 0x00, 'wrong len')
  })

  t.end()
})
