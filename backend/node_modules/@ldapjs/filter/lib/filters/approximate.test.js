'use strict'

const tap = require('tap')
const ApproximateFilter = require('./approximate')
const { BerReader, BerWriter } = require('@ldapjs/asn1')

tap.test('throws if input is invalid', async t => {
  const attrError = Error('attribute must be a string of at least one character')
  const valError = Error('value must be a string of at least one character')

  t.throws(
    () => new ApproximateFilter(),
    attrError
  )
  t.throws(
    () => new ApproximateFilter({ attribute: '' }),
    attrError
  )
  t.throws(
    () => new ApproximateFilter({ attribute: 'foo' }),
    valError
  )
  t.throws(
    () => new ApproximateFilter({ attribute: 'foo', value: '' }),
    valError
  )
})

tap.test('Construct args', async t => {
  const f = new ApproximateFilter({
    attribute: 'foo',
    value: 'bar'
  })
  t.ok(f)
  t.equal(Object.prototype.toString.call(f), '[object FilterString]')
  t.equal(f.attribute, 'foo')
  t.equal(f.value, 'bar')
  t.equal(f.toString(), '(foo~=bar)')
  t.same(f.json, {
    type: 'ApproximateFilter',
    attribute: 'foo',
    value: 'bar'
  })
})

tap.test('escape value only in toString()', async t => {
  const f = new ApproximateFilter({
    attribute: 'foo',
    value: 'ba(r)'
  })
  t.ok(f)
  t.equal(f.attribute, 'foo')
  t.equal(f.value, 'ba(r)')
  t.equal(f.toString(), '(foo~=ba\\28r\\29)')
})

tap.test('matches throws', async t => {
  const f = new ApproximateFilter({ attribute: 'foo', value: 'bar' })
  t.throws(
    () => f.matches({}),
    Error('not implemented')
  )
})

tap.test('encodes to BER correctly', async t => {
  const expected = Buffer.from([
    0xa8, 0x0a,
    0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
    0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
  ])
  const f = new ApproximateFilter({ attribute: 'foo', value: 'bar' })
  const ber = f.toBer()
  t.equal(expected.compare(ber.buffer), 0)
})

tap.test('#parse', t => {
  t.test('parses buffer', async t => {
    const input = Buffer.from([
      0xa8, 0x0a,
      0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
      0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
    ])
    const f = ApproximateFilter.parse(input)
    t.equal(f.attribute, 'foo')
    t.equal(f.value, 'bar')
    t.equal(f.toString(), '(foo~=bar)')
  })

  t.test('throws for unexpected sequence', async t => {
    const input = Buffer.from([
      0xa4, 0x0a,
      0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
      0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
    ])
    t.throws(
      () => ApproximateFilter.parse(input),
      Error('expected approximate filter sequence 0xa8, got 0xa4')
    )
  })

  t.end()
})

tap.test('original node-ldap tests', t => {
  // This set of subtests are from the original "filters/approx" test suite
  // in the core `ldapjs` module code.

  t.test('GH-109 = to ber uses plain values', function (t) {
    let f = new ApproximateFilter({
      attribute: 'foo',
      value: 'ba(r)'
    })
    t.ok(f)

    const writer = new BerWriter()
    writer.appendBuffer(f.toBer().buffer)

    const reader = new BerReader(writer.buffer)
    f = ApproximateFilter.parse(reader.buffer)

    t.equal(f.attribute, 'foo')
    t.equal(f.value, 'ba(r)')
    t.end()
  })

  t.end()
})
