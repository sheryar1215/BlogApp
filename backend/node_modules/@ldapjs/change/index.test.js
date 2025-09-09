'use strict'

const tap = require('tap')
const { BerReader } = require('@ldapjs/asn1')
const Attribute = require('@ldapjs/attribute')
const Change = require('./index')

tap.test('constructor', t => {
  t.test('throws for bad operation', async t => {
    t.throws(
      () => new Change({ operation: 'bad' }),
      Error('invalid operation type: bad')
    )
  })

  t.test('throws for bad modification', async t => {
    t.throws(
      () => new Change({ modification: 'bad' }),
      Error('modification must be an Attribute')
    )
  })

  t.test('creates an instance', async t => {
    const change = new Change({
      modification: new Attribute()
    })
    t.equal(change.operation, 'add')
    t.type(change.modification, Attribute)
    t.equal(Object.prototype.toString.call(change), '[object LdapChange]')
  })

  t.end()
})

tap.test('modification', t => {
  t.test('gets', async t => {
    const attr = new Attribute()
    const change = new Change({ modification: attr })
    t.equal(change.modification, attr)
  })

  t.test('sets', async t => {
    const attr1 = new Attribute()
    const attr2 = new Attribute()
    const change = new Change({ modification: attr1 })
    t.equal(change.modification, attr1)
    change.modification = attr2
    t.equal(change.modification, attr2)
    t.not(attr1, attr2)
  })

  t.test('throws if value is not attribute-like', async t => {
    const change = new Change({ modification: new Attribute() })
    t.throws(
      () => { change.modification = { foo: 'foo' } },
      Error('modification must be an Attribute')
    )
  })

  t.test('converts attribute-like to Attribute', async t => {
    const change = new Change({
      modification: {
        type: 'dn=foo,dc=example,dc=com',
        values: []
      }
    })
    t.equal(
      Object.prototype.toString.call(change.modification),
      '[object LdapAttribute]'
    )
  })

  t.end()
})

tap.test('.operation', t => {
  const attr = new Attribute()
  const change = new Change({ modification: attr })

  t.test('throws for unrecognized operation', async t => {
    t.throws(
      () => { change.operation = 'bad' },
      Error('invalid operation type: bad')
    )
    t.throws(
      () => { change.operation = 0xff },
      Error('invalid operation type: 0xff')
    )
  })

  t.test('sets and gets', async t => {
    change.operation = 0
    t.equal(change.operation, 'add')
    change.operation = 'add'
    t.equal(change.operation, 'add')

    change.operation = 1
    t.equal(change.operation, 'delete')
    change.operation = 'delete'
    t.equal(change.operation, 'delete')

    change.operation = 2
    t.equal(change.operation, 'replace')
    change.operation = 'replace'
    t.equal(change.operation, 'replace')

    change.operation = 'Replace'
    t.equal(change.operation, 'replace')
  })

  t.end()
})

tap.test('.pojo', t => {
  t.test('returns a plain object', async t => {
    const change = new Change({
      modification: new Attribute()
    })
    const expected = {
      operation: 'add',
      modification: {
        type: '',
        values: []
      }
    }
    t.strictSame(change.pojo, expected)
    t.strictSame(change.toJSON(), expected)
  })

  t.end()
})

tap.test('toBer', t => {
  t.test('serializes to ber', async t => {
    const expected = Buffer.from([
      0x30, 0x15, // sequence, 21 bytes
      0x0a, 0x01, 0x00, // enumerated value 0
      0x30, 0x10, // sequence, 16 bytes
      0x04, 0x02, // string, 2 bytes
      0x63, 0x6e, // 'cn'
      0x31, 0x0a, // sequence of strings, 10 bytes
      0x04, 0x03, // string, 3 bytes
      0x66, 0x6f, 0x6f, // 'foo'
      0x04, 0x03, // string 3 bytes
      0x62, 0x61, 0x72
    ])
    const change = new Change({
      modification: {
        type: 'cn',
        values: ['foo', 'bar']
      }
    })
    const ber = change.toBer()
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.end()
})

tap.test('#apply', t => {
  t.test('throws if change is not a Change', async t => {
    t.throws(
      () => Change.apply({}, {}),
      Error('change must be an instance of Change')
    )
  })

  t.test('applies to a target with no type', async t => {
    const attr = new Attribute({
      type: 'cn',
      values: ['new']
    })
    const change = new Change({ modification: attr })
    const target = {}
    Change.apply(change, target)
    t.strictSame(target, {
      cn: ['new']
    })
  })

  t.test('applies to a target with a scalar type', async t => {
    const attr = new Attribute({
      type: 'cn',
      values: ['new']
    })
    const change = new Change({ modification: attr })
    const target = { cn: 'old' }
    Change.apply(change, target)
    t.strictSame(target, {
      cn: ['old', 'new']
    })
  })

  t.test('applies to a target with an array type', async t => {
    const attr = new Attribute({
      type: 'cn',
      values: ['new']
    })
    const change = new Change({ modification: attr })
    const target = { cn: ['old'] }
    Change.apply(change, target)
    t.strictSame(target, {
      cn: ['old', 'new']
    })
  })

  t.test('add operation adds only new values', async t => {
    const attr = new Attribute({
      type: 'cn',
      values: ['new', 'foo']
    })
    const change = new Change({ modification: attr })
    const target = { cn: ['old', 'new'] }
    Change.apply(change, target)
    t.strictSame(target, {
      cn: ['old', 'new', 'foo']
    })
  })

  t.test('delete operation removes property', async t => {
    const attr = new Attribute({
      type: 'cn',
      values: ['new']
    })
    const change = new Change({
      operation: 'delete',
      modification: attr
    })
    const target = { cn: ['new'] }
    Change.apply(change, target)
    t.strictSame(target, {})
  })

  t.test('delete operation removes values', async t => {
    const attr = new Attribute({
      type: 'cn',
      values: ['remove_me']
    })
    const change = new Change({
      operation: 'delete',
      modification: attr
    })
    const target = { cn: ['remove_me', 'keep_me'] }
    Change.apply(change, target)
    t.strictSame(target, {
      cn: ['keep_me']
    })
  })

  t.test('replace removes empty set', async t => {
    const attr = new Attribute({
      type: 'cn',
      values: []
    })
    const change = new Change({
      operation: 'replace',
      modification: attr
    })
    const target = { cn: ['old'] }
    Change.apply(change, target)
    t.strictSame(target, {})
  })

  t.test('replace removes values', async t => {
    const attr = new Attribute({
      type: 'cn',
      values: ['new_set']
    })
    const change = new Change({
      operation: 'replace',
      modification: attr
    })
    const target = { cn: ['old_set'] }
    Change.apply(change, target)
    t.strictSame(target, {
      cn: ['new_set']
    })
  })

  t.test('scalar option works for new single values', async t => {
    const attr = new Attribute({
      type: 'cn',
      values: ['new']
    })
    const change = new Change({ modification: attr })
    const target = {}
    Change.apply(change, target, true)
    t.strictSame(target, {
      cn: 'new'
    })
  })

  t.test('scalar option is ignored for multiple values', async t => {
    const attr = new Attribute({
      type: 'cn',
      values: ['new']
    })
    const change = new Change({ modification: attr })
    const target = {
      cn: ['old']
    }
    Change.apply(change, target, true)
    t.strictSame(target, {
      cn: ['old', 'new']
    })
  })

  t.end()
})

tap.test('#isChange', t => {
  t.test('true for instance', async t => {
    const change = new Change({ modification: new Attribute() })
    t.equal(Change.isChange(change), true)
  })

  t.test('false for non-object', async t => {
    t.equal(Change.isChange([]), false)
  })

  t.test('true for shape match', async t => {
    const change = {
      operation: 'add',
      modification: {
        type: '',
        values: []
      }
    }
    t.equal(Change.isChange(change), true)

    change.operation = 0
    change.modification = new Attribute()
    t.equal(Change.isChange(change), true)
  })

  t.test('false for shape mis-match', async t => {
    const change = {
      operation: 'add',
      mod: {
        type: '',
        values: []
      }
    }
    t.equal(Change.isChange(change), false)
  })

  t.end()
})

tap.test('#compare', t => {
  t.test('throws if params are not changes', async t => {
    const change = new Change({ modification: new Attribute() })
    const expected = Error('can only compare Change instances')
    t.throws(
      () => Change.compare({}, change),
      expected
    )
    t.throws(
      () => Change.compare(change, {}),
      expected
    )
  })

  t.test('orders add first', async t => {
    const change1 = new Change({ modification: new Attribute() })
    const change2 = new Change({
      operation: 'delete',
      modification: new Attribute()
    })

    t.equal(Change.compare(change1, change2), -1)

    change2.operation = 'replace'
    t.equal(Change.compare(change1, change2), -1)
  })

  t.test('orders delete above add', async t => {
    const change1 = new Change({ modification: new Attribute() })
    const change2 = new Change({
      operation: 'delete',
      modification: new Attribute()
    })

    t.equal(Change.compare(change2, change1), 1)
  })

  t.test('orders by attribute for same operation', async t => {
    const change1 = new Change({ modification: new Attribute() })
    const change2 = new Change({ modification: new Attribute() })
    t.equal(Change.compare(change1, change2), 0)
  })

  t.end()
})

tap.test('#fromBer', t => {
  t.test('creates instance', async t => {
    const bytes = [
      0x30, 0x15, // sequence, 21 bytes
      0x0a, 0x01, 0x00, // enumerated value 0
      0x30, 0x10, // sequence, 16 bytes
      0x04, 0x02, // string, 2 bytes
      0x63, 0x6e, // 'cn'
      0x31, 0x0a, // sequence of strings, 10 bytes
      0x04, 0x03, // string, 3 bytes
      0x66, 0x6f, 0x6f, // 'foo'
      0x04, 0x03, // string 3 bytes
      0x62, 0x61, 0x72
    ]
    const reader = new BerReader(Buffer.from(bytes))
    const change = Change.fromBer(reader)
    t.strictSame(change.pojo, {
      operation: 'add',
      modification: {
        type: 'cn',
        values: ['foo', 'bar']
      }
    })
  })

  t.end()
})
