'use strict'

const tap = require('tap')
const { search } = require('@ldapjs/protocol')
const Attribute = require('@ldapjs/attribute')
const EqualityFilter = require('./equality')

tap.test('Construct invalid args', async t => {
  t.throws(
    () => new EqualityFilter(),
    Error('attribute must be a string of at least one character')
  )

  t.throws(
    () => new EqualityFilter({ attribute: 'foo' }),
    Error('must either provide a buffer via `raw` or some `value`')
  )
})

tap.test('Construct args', async t => {
  const f = new EqualityFilter({
    attribute: 'foo',
    value: 'bar'
  })
  t.ok(f)
  t.equal(Object.prototype.toString.call(f), '[object FilterString]')
  t.equal(f.TAG, search.FILTER_EQUALITY)
  t.equal(f.attribute, 'foo')
  t.equal(f.type, 'EqualityFilter')
  t.equal(f.value, 'bar')
  t.equal(f.toString(), '(foo=bar)')
})

tap.test('construct with raw', async t => {
  const f = new EqualityFilter({
    attribute: 'foo',
    raw: Buffer.from([126])
  })
  t.ok(f)
  t.equal(f.value, '~')
})

tap.test('value setter', async t => {
  let data = Buffer.from([126])
  const f = new EqualityFilter({ attribute: 'foo', raw: data })
  f.value = 'a'
  t.not(f.value, data.toString(), 'preserve buffer')

  data = Buffer.from('a')
  f.value = data.toString()
  t.equal(f.value, data.toString(), 'convert string')

  f.value = true
  t.equal(typeof (f.value), 'boolean', 'preserve other type')
  t.ok(f.value)
})

tap.test('toString', t => {
  t.test('buffer', async t => {
    const f = new EqualityFilter({ attribute: 'foo', raw: Buffer.from('bar') })
    t.equal(f.toString(), '(foo=bar)')
  })

  t.test('string', async t => {
    const f = new EqualityFilter({ attribute: 'foo', raw: 'bar' })
    t.equal(f.toString(), '(foo=bar)')
  })

  t.test('boolean', async t => {
    const f = new EqualityFilter({ attribute: 'foo', raw: true })
    t.throws(
      () => f.toString(),
      Error('invalid value type')
    )
  })

  t.test('escape value only in toString()', async t => {
    const f = new EqualityFilter({
      attribute: 'foo',
      value: 'ba(r)'
    })
    t.ok(f)
    t.equal(f.attribute, 'foo')
    t.equal(f.value, 'ba(r)')
    t.equal(f.toString(), '(foo=ba\\28r\\29)')
  })

  t.end()
})

tap.test('matches', t => {
  t.test('match true', async t => {
    const f = new EqualityFilter({
      attribute: 'foo',
      value: 'bar'
    })
    t.ok(f)
    t.equal(f.matches({ foo: 'bar' }), true)
  })

  t.test('match multiple', async t => {
    const f = new EqualityFilter({
      attribute: 'foo',
      value: 'bar'
    })
    t.ok(f)
    t.equal(f.matches({ foo: ['plop', 'bar'] }), true)
  })

  t.test('match false', async t => {
    const f = new EqualityFilter({
      attribute: 'foo',
      value: 'bar'
    })
    t.ok(f)
    t.equal(f.matches({ foo: 'baz' }), false)
  })

  t.test('obj can be array of attributes', async t => {
    const attributes = Attribute.fromObject({ cn: 'foo' })
    const f = new EqualityFilter({
      attribute: 'cn',
      value: 'foo'
    })
    t.equal(f.matches(attributes), true)
  })

  t.test('throws if element not an attribute', async t => {
    const f = new EqualityFilter({
      attribute: 'cn',
      value: 'foo'
    })
    t.throws(
      () => f.matches([{ cn: 'foo' }]),
      'array element must be an instance of LdapAttribute'
    )
  })

  t.end()
})

tap.test('escape EqualityFilter inputs', async t => {
  const f = new EqualityFilter({
    attribute: '(|(foo',
    value: 'bar))('
  })

  t.equal(f.attribute, '(|(foo')
  t.equal(f.value, 'bar))(')
  t.equal(f.toString(), '(\\28|\\28foo=bar\\29\\29\\28)')

  f.value = Buffer.from([97, 115, 100, 102, 41, 40, 0, 255])
  t.equal(f.toString(), '(\\28|\\28foo=asdf\\29\\28\\00ÿ)')

  f.value = Buffer.from([195, 40])
  t.equal(f.toString(), '(\\28|\\28foo=\\c3\\28)')

  f.value = Buffer.from([195, 177])
  t.equal(f.toString(), '(\\28|\\28foo=\\c3\\b1)')
})

tap.test('encodes to BER correctly', t => {
  t.test('basic ascii values', async t => {
    const expected = Buffer.from([
      0xa3, 0x0a,
      0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
      0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
    ])
    const f = new EqualityFilter({ attribute: 'foo', value: 'bar' })
    const ber = f.toBer()
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.test('values with non-ascii', async t => {
    const expected = Buffer.from([
      0xa3, 0x0b,
      0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
      0x04, 0x04, 0xc3, 0xad, 0xc3, 0xb8 // OctetString "íø"
    ])
    const f = new EqualityFilter({ attribute: 'foo', value: 'íø' })
    const ber = f.toBer()
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.end()
})

tap.test('#parse', t => {
  t.test('parses buffer', async t => {
    const input = Buffer.from([
      0xa3, 0x0a,
      0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
      0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
    ])
    const f = EqualityFilter.parse(input)
    t.equal(f.attribute, 'foo')
    t.equal(f.value, 'bar')
    t.equal(f.toString(), '(foo=bar)')
  })

  t.test('throws for unexpected sequence', async t => {
    const input = Buffer.from([
      0xa4, 0x0a,
      0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
      0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
    ])
    t.throws(
      () => EqualityFilter.parse(input),
      Error('expected equality filter sequence 0xa3, got 0xa4')
    )
  })

  t.end()
})

tap.test('original node-ldap tests', t => {
  // This set of subtests are from the original "filters/eq" test suite
  // in the core `ldapjs` module code.

  t.test('GH-277 objectClass should be case-insensitive', async t => {
    const f = new EqualityFilter({
      attribute: 'objectClass',
      value: 'CaseInsensitiveObj'
    })
    t.ok(f)
    t.equal(f.matches({ objectClass: 'CaseInsensitiveObj' }), true)
    t.equal(f.matches({ OBJECTCLASS: 'CASEINSENSITIVEOBJ' }), true)
    t.equal(f.matches({ objectclass: 'caseinsensitiveobj' }), true)
    t.equal(f.matches({ objectclass: 'matchless' }), false)
  })

  t.test('escape EqualityFilter inputs', function (t) {
    const f = new EqualityFilter({
      attribute: '(|(foo',
      value: 'bar))('
    })

    t.equal(f.attribute, '(|(foo')
    t.equal(f.value, 'bar))(')
    t.equal(f.toString(), '(\\28|\\28foo=bar\\29\\29\\28)')
    t.end()
  })

  t.end()
})
