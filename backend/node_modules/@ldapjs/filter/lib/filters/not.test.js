'use strict'

const tap = require('tap')
const EqualityFilter = require('./equality')
const NotFilter = require('./not')

tap.test('Construct args', async t => {
  const f = new NotFilter({
    filter: new EqualityFilter({
      attribute: 'foo',
      value: 'bar'
    })
  })
  t.ok(f)
  t.equal(Object.prototype.toString.call(f), '[object FilterString]')
  t.equal(f.type, 'NotFilter')
  t.equal(f.toString(), '(!(foo=bar))')
  t.same(f.json, {
    type: 'NotFilter',
    filter: {
      type: 'EqualityFilter',
      attribute: 'foo',
      value: 'bar'
    }
  })
})

tap.test('matches', t => {
  t.test('match true', async t => {
    const f = new NotFilter({
      filter: new EqualityFilter({
        attribute: 'foo',
        value: 'bar'
      })
    })
    t.ok(f)
    t.ok(f.matches({ foo: 'baz' }))
  })

  t.test('match false', async t => {
    const f = new NotFilter({
      filter: new EqualityFilter({
        attribute: 'foo',
        value: 'bar'
      })
    })
    t.ok(f)
    t.ok(!f.matches({ foo: 'bar' }))
  })

  t.end()
})

tap.test('setFilter', async t => {
  const f = new NotFilter({
    filter: new EqualityFilter({
      attribute: 'foo',
      value: 'bar'
    })
  })
  t.ok(f)
  t.equal(f.toString(), '(!(foo=bar))')
  f.setFilter(new EqualityFilter({
    attribute: 'new',
    value: 'val'
  }))
  t.equal(f.toString(), '(!(new=val))')
})

tap.test('encodes to BER correctly', async t => {
  const expected = Buffer.from([
    0xa2, 0x0c, 0xa3, 0x0a, // not tag, length, eq tag, length
    0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
    0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
  ])
  const eqFilter = new EqualityFilter({ attribute: 'foo', value: 'bar' })
  const f = new NotFilter({ filter: eqFilter })
  const ber = f.toBer()
  t.equal(expected.compare(ber.buffer), 0)
})

tap.test('parse', t => {
  t.test('parses buffer', async t => {
    const input = new NotFilter({
      filter: new EqualityFilter({ attribute: 'cn', value: 'foo' })
    })
    const f = NotFilter.parse(input.toBer().buffer)
    t.equal(f.clauses.length, 1)
    t.equal(f.toString(), '(!(cn=foo))')
  })

  t.test('throws for unexpected sequence', async t => {
    const input = Buffer.from([
      0xa3, 0x0c, 0xa3, 0x0a, // not tag, length, eq tag, length
      0x04, 0x03, 0x66, 0x6f, 0x6f, // OctetString "foo"
      0x04, 0x03, 0x62, 0x61, 0x72 // OctetString "bar"
    ])
    t.throws(
      () => NotFilter.parse(input),
      Error('expected filter tag 0xa2, got 0xa3')
    )
  })

  t.end()
})
