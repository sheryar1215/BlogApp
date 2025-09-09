'use strict'

const tap = require('tap')
const FilterString = require('./filter-string')

tap.test('creates an empty filter string', async t => {
  const f = new FilterString()
  t.equal(f.TAG, 0x30)
  t.equal(f.type, 'FilterString')
  t.equal(f.attribute, '')
  t.equal(f.value, undefined)
  t.equal(f.toString(), '()')
  t.equal(Object.prototype.toString.call(f), '[object FilterString]')
})

tap.test('throws if clauses not an array', async t => {
  t.throws(
    () => new FilterString({ clauses: 42 }),
    Error('clauses must be an array')
  )
})

tap.test('set/get value', async t => {
  const f = new FilterString()
  t.equal(f.value, undefined)
  f.value = 'foo'
  t.equal(f.value, 'foo')
})

tap.test('matches are false', async t => {
  const f = new FilterString()
  t.equal(f.matches(), false)
  t.equal(f.matches('nonsense'), false)
})

tap.test('encodes BER correctly', async t => {
  const expected = Buffer.from([0x30, 0x02, 0x05, 0x00])
  const f = new FilterString()
  const ber = f.toBer()

  t.equal(expected.compare(ber.buffer), 0)
})

tap.test('json returns POJO', async t => {
  const f = new FilterString({ attribute: 'foo', value: 'bar' })
  t.strictSame(f.json, {
    type: 'FilterString',
    attribute: 'foo',
    value: 'bar'
  })
})

tap.test('filter property', async t => {
  const f = new FilterString()
  const f2 = f.filter
  t.equal(f, f2)
})

tap.test('filters returns clauses', async t => {
  const f = new FilterString({ clauses: ['foo', 'bar'] })
  t.same(f.filters, ['foo', 'bar'])
})

tap.test('clauses returns clauses', async t => {
  const f = new FilterString({ clauses: ['foo', 'bar'] })
  t.same(f.clauses, ['foo', 'bar'])
})

tap.test('forEach iterates all clauses and root filter', async t => {
  t.plan(3)

  const clauses = [
    new FilterString({ attribute: 'child1' }),
    new FilterString({ attribute: 'child2' })
  ]
  const f = new FilterString({ attribute: 'foo', clauses })
  f.forEach(clause => {
    t.equal(['foo', 'child1', 'child2'].includes(clause.attribute), true)
  })
})

tap.test('map', t => {
  t.test('maps the root filter', async t => {
    t.plan(4)

    const f = new FilterString({ attribute: 'foo' })
    const f2 = f.map(item => {
      t.equal(item.attribute, 'foo')
      item.attribute = 'bar'
      return item
    })
    t.equal(f2.attribute, 'bar')
    t.equal(f.attribute, 'bar')
    t.equal(f, f2)
  })

  t.test('maps all clauses and root filter', async t => {
    const clauses = [
      new FilterString({ attribute: 'child1' }),
      new FilterString({ attribute: 'child2' })
    ]
    const f = new FilterString({ attribute: 'foo', clauses })
    f.map(item => {
      item.value = item.attribute
      return item
    })

    t.equal(f.value, 'foo')
    t.equal(clauses[0].value, 'child1')
    t.equal(clauses[1].value, 'child2')
  })

  t.test('aborts if callback does not apply to clauses', async t => {
    // No idea why this is a feature. We replicate it for completeness.
    // Maybe one day we can remove it? ~ 2022-06-12
    const clauses = [
      new FilterString({ attribute: 'child1' }),
      new FilterString({ attribute: 'child2' })
    ]
    const f = new FilterString({ attribute: 'foo', clauses })
    const result = f.map(item => {
      if (item.attribute !== 'foo') return null
      t.fail('should not reach here')
      return undefined
    })

    t.equal(f.value, undefined)
    t.equal(f.clauses.length, 2)
    t.equal(result, null)
  })

  t.end()
})

tap.test('addFilter adds a filter', async t => {
  const f = new FilterString({ attribute: 'foo' })
  f.addFilter(new FilterString({ attribute: 'bar' }))
  t.equal(f.clauses.length, 1)
  t.equal(f.clauses[0].attribute, 'bar')
})

tap.test('addClause', t => {
  t.test('throws if not a filter string', async t => {
    const f = new FilterString()
    t.throws(
      () => f.addClause('foo'),
      Error('clause must be an instance of FilterString')
    )
  })

  t.test('adds a clause', async t => {
    const f = new FilterString({ attribute: 'foo' })
    f.addClause(new FilterString({ attribute: 'bar' }))
    t.equal(f.clauses.length, 1)
    t.equal(f.clauses[0].attribute, 'bar')
  })

  t.end()
})

tap.test('#parse', t => {
  t.test('throws for bad length', async t => {
    const input = Buffer.alloc(3)
    t.throws(
      () => FilterString.parse(input),
      Error('expected buffer length 4, got 3')
    )
  })

  t.test('throws for bad sequence start', async t => {
    const input = Buffer.from([0x31, 0x02, 0x05, 0x00])
    t.throws(
      () => FilterString.parse(input),
      Error('expected sequence start, got 0x31')
    )
  })

  t.test('throws for bad null sequence start', async t => {
    const input = Buffer.from([0x30, 0x02, 0x06, 0x00])
    t.throws(
      () => FilterString.parse(input),
      Error('expected null sequence start, got 0x06')
    )
  })

  t.test('parses a buffer', async t => {
    const f = FilterString.parse(Buffer.from([0x30, 0x02, 0x05, 0x00]))
    t.equal(f.toString(), '()')
  })

  t.end()
})
