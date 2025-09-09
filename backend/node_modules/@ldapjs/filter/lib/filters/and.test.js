'use strict'

const tap = require('tap')
const Attribute = require('@ldapjs/attribute')
const EqualityFilter = require('./equality')
const AndFilter = require('./and')

tap.test('constructs instance', async t => {
  const f = new AndFilter({
    filters: [
      new EqualityFilter({ attribute: 'foo', value: 'bar' }),
      new EqualityFilter({ attribute: 'zig', value: 'zag' })
    ]
  })
  t.ok(f)
  t.equal(Object.prototype.toString.call(f), '[object FilterString]')
  t.equal(f.toString(), '(&(foo=bar)(zig=zag))')
  t.same(f.json, {
    type: 'AndFilter',
    filters: [
      { type: 'EqualityFilter', attribute: 'foo', value: 'bar' },
      { type: 'EqualityFilter', attribute: 'zig', value: 'zag' }
    ]
  })
})

tap.test('matches', t => {
  t.test('match true', async t => {
    const f = new AndFilter()
    f.addClause(new EqualityFilter({
      attribute: 'foo',
      value: 'bar'
    }))
    f.addClause(new EqualityFilter({
      attribute: 'zig',
      value: 'zag'
    }))
    t.ok(f)
    t.ok(f.matches({ foo: 'bar', zig: 'zag' }))
  })

  t.test('match false', async t => {
    const f = new AndFilter()
    f.addClause(new EqualityFilter({
      attribute: 'foo',
      value: 'bar'
    }))
    f.addClause(new EqualityFilter({
      attribute: 'zig',
      value: 'zag'
    }))
    t.ok(f)
    t.ok(!f.matches({ foo: 'bar', zig: 'zonk' }))
  })

  t.test('RFC-4526 - empty AND', async t => {
    const f = new AndFilter()
    t.ok(f.matches({}))
  })

  t.test('handles a set of attributes', async t => {
    const attributes = Attribute.fromObject({
      cn: 'foo',
      sn: 'bar'
    })
    const f = new AndFilter()
    f.addClause(new EqualityFilter({
      attribute: 'cn',
      value: 'foo'
    }))
    f.addClause(new EqualityFilter({
      attribute: 'sn',
      value: 'bar'
    }))
    t.ok(f.matches(attributes))
  })

  t.test('throws if not an array of attributes', async t => {
    const f = new AndFilter()
    f.addClause(new EqualityFilter({
      attribute: 'cn',
      value: 'foo'
    }))
    t.throws(
      () => f.matches([{ bad: 'object' }]),
      'array element must be an instance of LdapAttribute'
    )
  })

  t.end()
})

tap.test('encodes to BER correctly', async t => {
  const expected = Buffer.from([
    0xa0, 0x0c, 0xa3, 0x0a, // and tag, length, eq tag, length
    0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
    0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
  ])
  const eqFilter = new EqualityFilter({ attribute: 'foo', value: 'bar' })
  const f = new AndFilter({ filters: [eqFilter] })
  const ber = f.toBer()
  t.equal(expected.compare(ber.buffer), 0)
})

tap.test('parse', t => {
  t.test('parses buffer', async t => {
    const input = new AndFilter({
      filters: [new EqualityFilter({ attribute: 'cn', value: 'foo' })]
    })
    const f = AndFilter.parse(input.toBer().buffer)
    t.equal(f.clauses.length, 1)
    t.equal(f.toString(), '(&(cn=foo))')
  })

  t.test('parses simple all-match filter', async t => {
    const input = Buffer.from([0xa0, 0x00])
    const f = AndFilter.parse(input)
    t.equal(f.toString(), '(&)')
  })

  t.test('throws for unexpected sequence', async t => {
    const input = Buffer.from([
      0xa3, 0x0c, 0xa3, 0x0a, // and tag, length, eq tag, length
      0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
      0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
    ])
    t.throws(
      () => AndFilter.parse(input),
      Error('expected filter tag 0xa0, got 0xa3')
    )
  })

  t.end()
})
