'use strict'

const tap = require('tap')
const {
  BerReader,
  BerWriter
} = require('@ldapjs/asn1')
const { core: { LBER_SET } } = require('@ldapjs/protocol')
const warning = require('./lib/deprecations')
const Attribute = require('./')

// Silence the standard warning logs. We will test the messages explicitly.
process.removeAllListeners('warning')

tap.test('constructor', t => {
  t.test('new no args', async t => {
    t.ok(new Attribute())
    // TODO: verify attributes
  })

  t.test('new with args', async t => {
    let attr = new Attribute({
      type: 'cn',
      values: ['foo', 'bar']
    })

    t.ok(attr)

    attr.addValue('baz')
    t.equal(attr.type, 'cn')
    const values = attr.values
    t.equal(values.length, 3)
    t.equal(values[0], 'foo')
    t.equal(values[1], 'bar')
    t.equal(values[2], 'baz')

    t.throws(function () {
      const typeThatIsNotAString = 1
      attr = new Attribute({
        type: typeThatIsNotAString
      })
    })
  })

  t.test('supports binary attributes', async t => {
    const attr = new Attribute({
      type: 'foo;binary',
      values: ['bar']
    })
    t.strictSame(attr.pojo, {
      type: 'foo;binary',
      values: ['bao=']
    })
  })

  t.test('warns for vals', t => {
    process.on('warning', handler)
    t.teardown(async () => {
      process.removeListener('warning', handler)
      warning.emitted.set('LDAP_MESSAGE_DEP_001', false)
    })

    const attr = new Attribute({
      type: 'foo',
      vals: ['bar']
    })
    t.ok(attr)

    function handler (error) {
      t.equal(
        error.message,
        'options.vals is deprecated. Use options.values instead.'
      )
      t.end()
    }
  })

  t.end()
})

tap.test('.values', t => {
  t.test('adds an array of strings', async t => {
    const attr = new Attribute({ type: 'foo' })
    attr.values = ['bar', 'baz']
    t.strictSame(attr.pojo, {
      type: 'foo',
      values: ['bar', 'baz']
    })
  })

  t.test('adds a single string', async t => {
    const attr = new Attribute({ type: 'foo' })
    attr.values = 'bar'
    t.strictSame(attr.pojo, {
      type: 'foo',
      values: ['bar']
    })
  })

  t.end()
})

tap.test('.vals', t => {
  t.beforeEach(async t => {
    process.on('warning', handler)
    t.context.handler = handler

    function handler (error) {
      t.equal(
        error.message,
        'Instance property .vals is deprecated. Use property .values instead.'
      )
      t.end()
    }
  })

  t.afterEach(async (t) => {
    process.removeListener('warning', t.context.handler)
    warning.emitted.set('LDAP_ATTRIBUTE_DEP_003', false)
  })

  t.test('adds an array of strings', async t => {
    const attr = new Attribute({ type: 'foo' })
    attr.vals = ['bar', 'baz']
    t.strictSame(attr.pojo, {
      type: 'foo',
      values: ['bar', 'baz']
    })
  })

  t.test('adds a single string', async t => {
    const attr = new Attribute({ type: 'foo' })
    attr.vals = 'bar'
    t.strictSame(attr.pojo, {
      type: 'foo',
      values: ['bar']
    })
  })

  t.end()
})

tap.test('.buffers', t => {
  t.test('returns underlying buffers', async t => {
    const attr = new Attribute({
      type: 'foo',
      values: ['bar', 'baz']
    })
    const buffers = attr.buffers

    t.equal(buffers.length, 2)

    let expected = Buffer.from('bar', 'utf8')
    t.equal(expected.compare(buffers[0]), 0)

    expected = Buffer.from('baz', 'utf8')
    t.equal(expected.compare(buffers[1]), 0)
  })

  t.end()
})

tap.test('.type', t => {
  t.test('gets and sets', async t => {
    const attr = new Attribute(({
      type: 'foo',
      values: ['bar']
    }))

    t.equal(attr.type, 'foo')
    attr.type = 'bar'
    t.equal(attr.type, 'bar')
  })

  t.end()
})

tap.test('toBer', async t => {
  t.test('renders type with values', async t => {
    const attr = new Attribute({
      type: 'cn',
      values: ['foo', 'bar']
    })
    const reader = attr.toBer()
    t.ok(reader.readSequence())
    t.equal(reader.readString(), 'cn')
    t.equal(reader.readSequence(LBER_SET), LBER_SET)
    t.equal(reader.readString(), 'foo')
    t.equal(reader.readString(), 'bar')
  })

  t.test('renders type without values', async t => {
    const attr = new Attribute({ type: 'cn' })
    const reader = attr.toBer()
    t.ok(reader.readSequence())
    t.equal(reader.readString(), 'cn')
    t.equal(reader.readSequence(LBER_SET), LBER_SET)
    t.equal(reader.remain, 0)
  })
})

tap.test('parse', t => {
  t.beforeEach(async t => {
    process.on('warning', handler)
    t.teardown(async () => {
      process.removeListener('warning', handler)
      warning.emitted.set('LDAP_MESSAGE_DEP_002', false)
    })

    function handler (error) {
      t.equal(
        error.message,
        'Instance method .parse is deprecated. Use static .fromBer instead.'
      )
      t.end()
    }
  })

  t.test('parse', async t => {
    const ber = new BerWriter()
    ber.startSequence()
    ber.writeString('cn')
    ber.startSequence(0x31)
    ber.writeStringArray(['foo', 'bar'])
    ber.endSequence()
    ber.endSequence()

    const attr = new Attribute()
    attr.parse(new BerReader(ber.buffer))

    t.equal(attr.type, 'cn')
    t.equal(attr.vals.length, 2)
    t.equal(attr.vals[0], 'foo')
    t.equal(attr.vals[1], 'bar')
  })

  t.test('parse - without 0x31', async t => {
    const ber = new BerWriter()
    ber.startSequence()
    ber.writeString('sn')
    ber.endSequence()

    const attr = new Attribute()
    attr.parse(new BerReader(ber.buffer))

    t.equal(attr.type, 'sn')
    t.equal(attr.vals.length, 0)
  })

  t.end()
})

tap.test('pojo / toJSON', t => {
  t.test('returns an object', async t => {
    const expected = {
      type: 'foo',
      values: ['bar']
    }
    const attr = new Attribute(expected)

    t.strictSame(attr.pojo, expected)
    t.strictSame(JSON.stringify(attr), JSON.stringify(expected))
  })

  t.end()
})

tap.test('#fromBer', t => {
  const attributeWithValuesBytes = [
    0x30, 0x1c, // start first attribute sequence, 28 bytes

    0x04, 0x0b, // string, 11 bytes
    0x6f, 0x62, 0x6a, 0x65, // "objectClass"
    0x63, 0x74, 0x43, 0x6c,
    0x61, 0x73, 0x73,
    0x31, 0x0d, // start value sequence, 13 bytes
    0x04, 0x03, 0x74, 0x6f, 0x70, // string: "top"
    0x04, 0x06, 0x64, 0x6f, 0x6d, 0x61, 0x69, 0x6e // string: "domain"
  ]

  t.test('parses an attribute with values', async t => {
    const ber = new BerReader(Buffer.from(attributeWithValuesBytes))
    const attr = Attribute.fromBer(ber)

    t.equal(attr.type, 'objectClass')
    t.equal(attr.vals[0], 'top')
    t.equal(attr.vals[1], 'domain')
  })

  t.test('parses an attribute without values', async t => {
    const ber = new BerWriter()
    ber.startSequence()
    ber.writeString('sn')
    ber.endSequence()

    const attr = Attribute.fromBer(new BerReader(ber.buffer))
    t.equal(attr.type, 'sn')
    t.strictSame(attr.vals, [])
  })

  t.end()
})

tap.test('#fromObject', t => {
  t.test('handles basic object', async t => {
    const attrs = Attribute.fromObject({
      foo: ['foo'],
      bar: 'bar',
      'baz;binary': Buffer.from([0x00])
    })
    for (const attr of attrs) {
      t.equal(Object.prototype.toString.call(attr), '[object LdapAttribute]')
    }
  })

  t.end()
})

tap.test('#isAttribute', t => {
  t.test('rejects non-object', async t => {
    t.equal(Attribute.isAttribute(42), false)
  })

  t.test('accepts Attribute instances', async t => {
    const input = new Attribute({
      type: 'cn',
      values: ['foo']
    })
    t.equal(Attribute.isAttribute(input), true)
  })

  t.test('accepts attribute-like objects', async t => {
    const input = {
      type: 'cn',
      values: [
        'foo',
        Buffer.from('bar')
      ]
    }
    t.equal(Attribute.isAttribute(input), true)
  })

  t.test('rejects non-attribute-like objects', async t => {
    let input = {
      foo: 'foo',
      values: 'bar'
    }
    t.equal(Attribute.isAttribute(input), false)

    input = {
      type: 'cn',
      values: [42]
    }
    t.equal(Attribute.isAttribute(input), false)
  })

  t.end()
})

tap.test('compare', async t => {
  const comp = Attribute.compare
  let a = new Attribute({
    type: 'foo',
    values: ['bar']
  })
  const b = new Attribute({
    type: 'foo',
    values: ['bar']
  })
  const notAnAttribute = 'this is not an attribute'

  t.throws(
    () => comp(a, notAnAttribute),
    Error('can only compare Attribute instances')
  )
  t.throws(
    () => comp(notAnAttribute, b),
    Error('can only compare Attribute instances')
  )

  t.equal(comp(a, b), 0)

  // Different types
  a = new Attribute({ type: 'boo' })
  t.equal(comp(a, b), -1)
  t.equal(comp(b, a), 1)

  // Different value counts
  a = new Attribute({
    type: 'foo',
    values: ['bar', 'bar']
  })
  t.equal(comp(a, b), 1)
  t.equal(comp(b, a), -1)

  // Different value contents (same count)
  a = new Attribute({
    type: 'foo',
    values: ['baz']
  })
  t.equal(comp(a, b), 1)
  t.equal(comp(b, a), -1)
})
