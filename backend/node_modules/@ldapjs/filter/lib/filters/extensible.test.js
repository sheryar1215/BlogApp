'use strict'

const tap = require('tap')

const ExtensibleFilter = require('./extensible')
const { parseString } = require('../index')

tap.test('constructor', t => {
  t.test('throws for non-boolean dnAttributes', async t => {
    const error = Error('dnAttributes must be a boolean value')

    t.throws(
      () => new ExtensibleFilter({ attribute: 'foo', dnAttributes: 'bar' }),
      error
    )
  })

  t.test('throws for non-string rule', async t => {
    const error = Error('rule must be a string')

    t.throws(
      () => new ExtensibleFilter({ attribute: 'foo', rule: 42 }),
      error
    )
  })

  t.test('argument variations are covered', async t => {
    let f = new ExtensibleFilter({
      matchType: 'foo',
      value: 'bar'
    })
    t.ok(f)
    t.equal(Object.prototype.toString.call(f), '[object FilterString]')
    t.equal(f.matchType, 'foo')
    t.equal(f.value, 'bar')
    t.equal(f.toString(), '(foo:=bar)')

    f = new ExtensibleFilter({
      matchType: 'foo',
      rule: '1.2',
      dnAttributes: true,
      value: 'baz'
    })
    t.same(f.json, {
      type: 'ExtensibleFilter',
      matchRule: '1.2',
      matchType: 'foo',
      matchValue: 'baz',
      dnAttributes: true
    })
    t.equal(f.toString(), '(foo:dn:1.2:=baz)')

    f = new ExtensibleFilter({
      attribute: 'test',
      value: 'bar'
    })
    t.equal(f.matchType, 'test')
    t.same(f.json, {
      type: 'ExtensibleFilter',
      matchRule: undefined,
      matchType: 'test',
      matchValue: 'bar',
      dnAttributes: false
    })

    f = new ExtensibleFilter({
      dnAttributes: true,
      value: 'foo'
    })
    t.equal(f.toString(), '(:dn:=foo)')
    t.same(f.json, {
      type: 'ExtensibleFilter',
      matchRule: undefined,
      matchType: '',
      matchValue: 'foo',
      dnAttributes: true
    })
  })

  t.end()
})

tap.test('attribute synonym', async t => {
  const f = parseString('foo:=bar')
  t.equal(f.matchType, 'foo')
  t.equal(f.attribute, 'foo')
  f.attribute = 'baz'
  t.equal(f.matchType, 'baz')
  t.equal(f.attribute, 'baz')
})

tap.test('encodes to BER correctly', async t => {
  const expected = Buffer.from([
    0xa9, 0x14,
    0x81, 0x05, 0x31, 0x2e, 0x32, 0x2e, 0x33, // OID 1.2.3
    0x82, 0x03, 0x66, 0x6f, 0x6f, // attribute
    0x83, 0x03, 0x62, 0x61, 0x72, // value
    0x84, 0x01, 0xff // dnAttributes
  ])
  const f = new ExtensibleFilter({
    attribute: 'foo',
    value: 'bar',
    rule: '1.2.3',
    dnAttributes: true
  })

  const found = f.toBer()
  t.equal(expected.compare(found.buffer), 0)
})

tap.test('parse', t => {
  const fooArray = [0x03, 0x66, 0x6f, 0x6f] // length + string
  const barArray = [0x03, 0x62, 0x61, 0x72] // length + string

  t.test('parses a basic representation', async t => {
    const buffer = Buffer.from([
      0xa9, 0x0a,
      0x82, ...fooArray,
      0x83, ...barArray
    ])
    const f = ExtensibleFilter.parse(buffer)
    t.equal(f.attribute, 'foo')
    t.equal(f.value, 'bar')
    t.equal(f.toString(), '(foo:=bar)')
  })

  t.test('parses a value only representation', async t => {
    const buffer = Buffer.from([
      0xa9, 0x0a,
      0x83, ...barArray, // value
      0x84, 0x01, 0xff // dnAttributes
    ])
    const f = ExtensibleFilter.parse(buffer)
    t.equal(f.attribute, '')
    t.equal(f.value, 'bar')
    t.equal(f.toString(), '(:dn:=bar)')
  })

  t.test('parses a full representation', async t => {
    const buffer = Buffer.from([
      0xa9, 0x0a,
      0x81, 0x05, 0x31, 0x2e, 0x32, 0x2e, 0x33, // OID 1.2.3
      0x82, ...fooArray, // attribute
      0x83, ...barArray, // value
      0x84, 0x01, 0xff // dnAttributes
    ])
    const f = ExtensibleFilter.parse(buffer)
    t.equal(f.attribute, 'foo')
    t.equal(f.value, 'bar')
    t.equal(f.matchingRule, '1.2.3')
    t.equal(f.dnAttributes, true)
    t.equal(f.toString(), '(foo:dn:1.2.3:=bar)')
  })

  t.test('throws for bad representation', async t => {
    const buffer = Buffer.from([
      0xa9, 0x0a,
      0x89, ...barArray, // value
      0x84, 0x01, 0xff // dnAttributes
    ])
    t.throws(
      () => ExtensibleFilter.parse(buffer),
      Error('invalid extensible filter type: 0x89')
    )
  })

  t.end()
})
