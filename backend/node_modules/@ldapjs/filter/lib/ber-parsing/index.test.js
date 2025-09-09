'use strict'

const tap = require('tap')
const { BerReader } = require('@ldapjs/asn1')
const parse = require('./index')

const AndFilter = require('../filters/and')
const ApproximateFilter = require('../filters/approximate')
const EqualityFilter = require('../filters/equality')
const ExtensibleFilter = require('../filters/extensible')
const GreaterThanEqualsFilter = require('../filters/greater-than-equals')
const LessThanEqualsFilter = require('../filters/less-than-equals')
const NotFilter = require('../filters/not')
const OrFilter = require('../filters/or')
const PresenceFilter = require('../filters/presence')
const SubstringFilter = require('../filters/substring')
const parseString = require('../string-parsing/parse-string')

tap.test('throws if BerReader not supplied', async t => {
  const expected = Error('ber (BerReader) required')
  t.throws(
    () => parse(),
    expected
  )
  t.throws(
    () => parse({}),
    expected
  )
})

tap.test('parses AndFilter', async t => {
  const input = Buffer.from([
    0xa0, 0x0c, 0xa3, 0x0a, // and tag, length, eq tag, length
    0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
    0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
  ])
  const f = parse(new BerReader(input))
  t.type(f, AndFilter)
  t.equal(f.clauses.length, 1)
  t.equal(f.toString(), '(&(foo=bar))')
})

tap.test('parses ApproximateFilter', async t => {
  const input = Buffer.from([
    0xa8, 0x0a,
    0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
    0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
  ])
  const f = parse(new BerReader(input))
  t.type(f, ApproximateFilter)
  t.equal(f.attribute, 'foo')
  t.equal(f.value, 'bar')
  t.equal(f.toString(), '(foo~=bar)')
})

tap.test('parses EqualityFilter', async t => {
  const input = Buffer.from([
    0xa3, 0x0a,
    0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
    0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
  ])
  const f = parse(new BerReader(input))
  t.type(f, EqualityFilter)
  t.equal(f.attribute, 'foo')
  t.equal(f.value, 'bar')
  t.equal(f.toString(), '(foo=bar)')
})

tap.test('parses ExtensibleFilter', async t => {
  const fooArray = [0x03, 0x66, 0x6f, 0x6f] // length + string
  const barArray = [0x03, 0x62, 0x61, 0x72] // length + string
  const input = Buffer.from([
    0xa9, 0x14,
    0x81, 0x05, 0x31, 0x2e, 0x32, 0x2e, 0x33, // OID 1.2.3
    0x82, ...fooArray, // attribute
    0x83, ...barArray, // value
    0x84, 0x01, 0xff // dnAttributes
  ])
  const f = parse(new BerReader(input))
  t.type(f, ExtensibleFilter)
  t.equal(f.attribute, 'foo')
  t.equal(f.value, 'bar')
  t.equal(f.matchingRule, '1.2.3')
  t.equal(f.dnAttributes, true)
  t.equal(f.toString(), '(foo:dn:1.2.3:=bar)')
})

tap.test('parses GreaterThanEqualsFilter', async t => {
  const input = Buffer.from([
    0xa5, 0x0a,
    0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
    0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
  ])
  const f = parse(new BerReader(input))
  t.type(f, GreaterThanEqualsFilter)
  t.equal(f.attribute, 'foo')
  t.equal(f.value, 'bar')
  t.equal(f.toString(), '(foo>=bar)')
})

tap.test('parses LessThanEqualsFilter', async t => {
  const input = Buffer.from([
    0xa6, 0x0a,
    0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
    0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
  ])
  const f = parse(new BerReader(input))
  t.type(f, LessThanEqualsFilter)
  t.equal(f.attribute, 'foo')
  t.equal(f.value, 'bar')
  t.equal(f.toString(), '(foo<=bar)')
})

tap.test('parses NotFilter', async t => {
  const input = Buffer.from([
    0xa2, 0x0c, 0xa3, 0x0a, // not tag, length, eq tag, length
    0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
    0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
  ])
  const f = parse(new BerReader(input))
  t.type(f, NotFilter)
  t.equal(f.toString(), '(!(foo=bar))')
})

tap.test('parses OrFilter', async t => {
  const input = Buffer.from([
    0xa1, 0x0c, 0xa3, 0x0a, // or tag, length, eq tag, length
    0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
    0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
  ])
  const f = parse(new BerReader(input))
  t.type(f, OrFilter)
  t.equal(f.clauses.length, 1)
  t.equal(f.toString(), '(|(foo=bar))')
})

tap.test('parses PresenceFilter', async t => {
  const input = Buffer.from([0x87, 0x03, 0x66, 0x6f, 0x6f])
  const f = parse(new BerReader(input))
  t.type(f, PresenceFilter)
  t.equal(f.toString(), '(foo=*)')
})

tap.test('parses SubstringFilter', async t => {
  const input = Buffer.from([
    0xa4, 0x0c, 0x04, 0x03, // substring tag, length, string tag, length
    0x66, 0x6f, 0x6f, // OctetString "foo"
    0x30, 0x05, 0x80, 0x03, // sequence tag, length, context tag, length
    0x62, 0x61, 0x72 // OctetString "bar"
  ])
  const f = parse(new BerReader(input))
  t.type(f, SubstringFilter)
  t.equal(f.attribute, 'foo')
  t.equal(f.initial, 'bar')
  t.equal(f.toString(), '(foo=bar*)')
})

tap.test('throws for invalid filter tag', async t => {
  const input = Buffer.from([0x92, 0x03, 0x66, 0x6f, 0x6f])
  t.throws(
    () => parse(new BerReader(input)),
    Error('invalid search filter type: 0x92')
  )
})

tap.test('parseSet reads OR filter from BER', async t => {
  const expected = Buffer.from([
    0xa1, 0x1b,
    0xa3, 0x07, // eq filter
    0x04, 0x02, 0x63, 0x6e, 0x04, 0x01, 0x31, // string, 2 chars (cn), string 1 char (1)
    0xa3, 0x07, // eq filter
    0x04, 0x02, 0x63, 0x6e, 0x04, 0x01, 0x32, // string, 2 chars (cn), string 1 char (2)
    0xa3, 0x07, // eq filter
    0x04, 0x02, 0x63, 0x6e, 0x04, 0x01, 0x33 // string, 2 chars (cn), string 1 char (3)
  ])

  let f = new OrFilter()
  f.addClause(new EqualityFilter({ attribute: 'cn', value: '1' }))
  f.addClause(new EqualityFilter({ attribute: 'cn', value: '2' }))
  f.addClause(new EqualityFilter({ attribute: 'cn', value: '3' }))

  const filterBuffer = f.toBer().buffer
  t.equal(expected.compare(filterBuffer), 0)

  const reader = new BerReader(filterBuffer)
  f = parse(reader)
  t.ok(f)
  t.equal(f.type, 'OrFilter')
  t.equal(f.clauses.length, 3)
  for (let i = 1; i <= 3; i += 1) {
    const filter = f.clauses[i - 1]
    t.equal(filter.attribute, 'cn')
    t.equal(filter.value, `${i}`)
  }
})

tap.test('parses evolution filter', async t => {
  const evolutionFilterFixture = require('./_fixtures/evolution-filter')
  const filter = parseString(evolutionFilterFixture.text)
  const ber = filter.toBer()

  t.equal(ber.buffer.compare(evolutionFilterFixture.bytes), 0)

  const filterFromBer = parse(ber)
  t.equal(filterFromBer.toString(), evolutionFilterFixture.text)
})
