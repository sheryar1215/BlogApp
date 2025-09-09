'use strict'

const tap = require('tap')
const Attribute = require('@ldapjs/attribute')
const EqualityFilter = require('./equality')
const SubstringFilter = require('./substring')
const OrFilter = require('./or')

tap.test('constructs instance', async t => {
  const f = new OrFilter({
    filters: [
      new EqualityFilter({ attribute: 'foo', value: 'bar' }),
      new EqualityFilter({ attribute: 'zig', value: 'zag' })
    ]
  })
  t.ok(f)
  t.equal(Object.prototype.toString.call(f), '[object FilterString]')
  t.equal(f.toString(), '(|(foo=bar)(zig=zag))')
})

tap.test('matches', t => {
  t.test('match true', async t => {
    const f = new OrFilter()
    f.addClause(new EqualityFilter({
      attribute: 'foo',
      value: 'bar'
    }))
    f.addClause(new EqualityFilter({
      attribute: 'zig',
      value: 'zag'
    }))
    t.ok(f)
    t.ok(f.matches({ foo: 'bar', zig: 'zonk' }))
    t.same(f.json, {
      type: 'OrFilter',
      filters: [
        { type: 'EqualityFilter', attribute: 'foo', value: 'bar' },
        { type: 'EqualityFilter', attribute: 'zig', value: 'zag' }
      ]
    })
  })

  t.test('match false', async t => {
    const f = new OrFilter()
    f.addClause(new EqualityFilter({
      attribute: 'foo',
      value: 'bar'
    }))
    f.addClause(new EqualityFilter({
      attribute: 'zig',
      value: 'zag'
    }))
    t.ok(f)
    t.equal(f.matches({ foo: 'baz', zig: 'zonk' }), false)
  })

  t.test('RFC-4526 - empty OR', async t => {
    const f = new OrFilter()
    t.equal(f.matches({}), false)
  })

  t.test('handles a set of attributes', async t => {
    const attributes = Attribute.fromObject({
      cn: 'foo',
      sn: 'bar'
    })
    const f = new OrFilter()
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
    const f = new OrFilter()
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

tap.test('toBer', t => {
  t.test('encodes to BER correctly', async t => {
    const expected = Buffer.from([
      0xa1, 0x0c, 0xa3, 0x0a, // or tag, length, eq tag, length
      0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
      0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
    ])
    const eqFilter = new EqualityFilter({
      attribute: 'foo',
      value: 'bar'
    })
    const f = new OrFilter({ filters: [eqFilter] })
    const ber = f.toBer()
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.test('encodes substring filters', async t => {
    const expected = Buffer.from([
      0xa1, 0x0d, // or tag, 13 bytes
      0xa4, 0x0b, // sequence (substring tag), 11 bytes
      0x04, 0x02, // string, 2 bytes
      // "cn"
      0x63, 0x6e,
      0x30, 0x05, // sequence, 5 bytes
      0x80, 0x03, // string (initial tag), 3 bytes
      // "foo"
      0x66, 0x6f, 0x6f
    ])
    const subFilter = new SubstringFilter({
      attribute: 'cn',
      initial: 'foo'
    })
    const f = new OrFilter({ filters: [subFilter] })
    const ber = f.toBer()
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.end()
})

tap.test('parse', t => {
  t.test('parses buffer', async t => {
    const input = Buffer.from([
      0xa1, 0x0c, 0xa3, 0x0a, // or tag, length, eq tag, length
      0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
      0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
    ])
    const f = OrFilter.parse(input)
    t.equal(f.clauses.length, 1)
    t.equal(f.toString(), '(|(foo=bar))')
  })

  t.test('throws for unexpected sequence', async t => {
    const input = Buffer.from([
      0xa3, 0x0c, 0xa3, 0x0a, // or tag, length, eq tag, length
      0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
      0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
    ])
    t.throws(
      () => OrFilter.parse(input),
      Error('expected filter tag 0xa1, got 0xa3')
    )
  })

  t.test('parses a set of substring filters', async t => {
    const input = Buffer.from([
      0xa1, 0x1a, // or tag, 26 bytes

      0xa4, 0x0b, // sequence (substring tag), 11 bytes
      0x04, 0x02, // string, 2 bytes
      // "cn"
      0x63, 0x6e,
      0x30, 0x05, // sequence, 5 bytes
      0x80, 0x03, // string (initial tag), 3 bytes
      // "foo"
      0x66, 0x6f, 0x6f,

      0xa4, 0x0b, // sequence (substring tag), 11 bytes
      0x04, 0x02, // string, 2 bytes
      // "sn"
      0x73, 0x6e,
      0x30, 0x05, // sequence, 5 bytes
      0x80, 0x03, // string (initial tag), 3 bytes
      0x66, 0x6f, 0x6f
    ])

    const filter = OrFilter.parse(input)
    t.equal(filter.toString(), '(|(cn=foo*)(sn=foo*))')
  })

  t.end()
})
