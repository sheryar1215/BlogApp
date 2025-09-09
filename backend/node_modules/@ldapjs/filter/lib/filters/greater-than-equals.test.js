'use strict'

const tap = require('tap')
const { BerWriter } = require('@ldapjs/asn1')
const Attribute = require('@ldapjs/attribute')
const GreaterThanEqualsFilter = require('./greater-than-equals')

tap.test('requires attribute and value', async t => {
  const attrErr = Error('attribute must be a string of at least one character')
  const valErr = Error('value must be a string of at least one character')

  t.throws(
    () => new GreaterThanEqualsFilter(),
    attrErr
  )
  t.throws(
    () => new GreaterThanEqualsFilter({ attribute: '' }),
    attrErr
  )
  t.throws(
    () => new GreaterThanEqualsFilter({ attribute: 'foo' }),
    valErr
  )
  t.throws(
    () => new GreaterThanEqualsFilter({ attribute: 'foo', value: '' }),
    valErr
  )
})

tap.test('basic construction', async t => {
  const f = new GreaterThanEqualsFilter({
    attribute: 'foo',
    value: 'bar'
  })
  t.ok(f)
  t.equal(Object.prototype.toString.call(f), '[object FilterString]')
  t.equal(f.attribute, 'foo')
  t.equal(f.value, 'bar')
  t.equal(f.toString(), '(foo>=bar)')
})

tap.test('escape value only in toString()', async t => {
  const f = new GreaterThanEqualsFilter({
    attribute: 'foo',
    value: 'ba(r)'
  })
  t.ok(f)
  t.equal(f.attribute, 'foo')
  t.equal(f.value, 'ba(r)')
  t.equal(f.toString(), '(foo>=ba\\28r\\29)')
})

tap.test('matches', t => {
  t.test('match true', async t => {
    const f = new GreaterThanEqualsFilter({
      attribute: 'foo',
      value: 'bar'
    })
    t.ok(f)
    t.equal(f.matches({ foo: 'baz' }), true)
  })

  t.test('match multiple', async t => {
    const f = new GreaterThanEqualsFilter({
      attribute: 'foo',
      value: 'bar'
    })
    t.ok(f)
    t.equal(f.matches({ foo: ['beuha', 'baz'] }), true)
  })

  t.test('match false', async t => {
    const f = new GreaterThanEqualsFilter({
      attribute: 'foo',
      value: 'bar'
    })
    t.ok(f)
    t.equal(f.matches({ foo: 'abc' }), false)
  })

  t.test('obj can be array of attributes', async t => {
    const attributes = Attribute.fromObject({ cn: 'foo' })
    const f = new GreaterThanEqualsFilter({
      attribute: 'cn',
      value: 'foo'
    })
    t.equal(f.matches(attributes), true)
  })

  t.test('throws if element not an attribute', async t => {
    const f = new GreaterThanEqualsFilter({
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

tap.test('encodes to BER correctly', async t => {
  const expected = Buffer.from([
    0xa5, 0x0a,
    0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
    0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
  ])
  const f = new GreaterThanEqualsFilter({ attribute: 'foo', value: 'bar' })
  const ber = f.toBer()
  t.equal(expected.compare(ber.buffer), 0)
})

tap.test('parse', t => {
  tap.test('throws for bad sequence', async t => {
    const input = Buffer.from([
      0xa4, 0x0a,
      0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
      0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
    ])
    t.throws(
      () => GreaterThanEqualsFilter.parse(input),
      Error('expected greater-than-equals filter sequence 0xa5, got 0xa4')
    )
  })

  t.test('parses buffer', async t => {
    const input = Buffer.from([
      0xa5, 0x0a,
      0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
      0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
    ])
    const f = GreaterThanEqualsFilter.parse(input)
    t.equal(f.attribute, 'foo')
    t.equal(f.value, 'bar')
    t.equal(f.toString(), '(foo>=bar)')
  })

  t.end()
})

tap.test('original node-ldap tests', t => {
  // This set of subtests are from the original "filters/ge" test suite
  // in the core `ldapjs` module code.

  t.test('GH-109 = to ber uses plain values', async t => {
    let f = new GreaterThanEqualsFilter({
      attribute: 'foo',
      value: 'ba(r)'
    })
    t.ok(f)

    const writer = new BerWriter()
    writer.appendBuffer(f.toBer().buffer)

    f = GreaterThanEqualsFilter.parse(writer.buffer)
    t.ok(f)
    t.equal(f.attribute, 'foo')
    t.equal(f.value, 'ba(r)')
  })

  t.end()
})
