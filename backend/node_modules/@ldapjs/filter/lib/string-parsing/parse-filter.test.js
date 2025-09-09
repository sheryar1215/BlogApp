'use strict'

const tap = require('tap')
const parse = require('./parse-filter')

const AndFilter = require('../filters/and')
const EqualityFilter = require('../filters/equality')
const NotFilter = require('../filters/not')
const OrFilter = require('../filters/or')

tap.test('throws if missing opening parentheses', async t => {
  t.throws(
    () => parse('cn=foo'),
    Error('missing opening parentheses')
  )
})

tap.test('throws for unbalanced parentheses', async t => {
  t.throws(
    () => parse('(cn=foo'),
    Error('unbalanced parentheses')
  )
})

tap.test('AndFilter', t => {
  t.test('match all', async t => {
    const result = parse('(&)')
    t.equal(result.end, 2)
    t.type(result.filter, AndFilter)
    t.equal(result.filter.toString(), '(&)')
  })

  t.test('simple', async t => {
    const result = parse('(&(cn=foo))')
    t.equal(result.end, 10)
    t.type(result.filter, AndFilter)
    t.equal(result.filter.clauses.length, 1)
    t.type(result.filter.clauses[0], EqualityFilter)
  })

  t.test('multiple clauses', async t => {
    const inputString = '(&(cn=foo)(sn=bar))'
    const result = parse(inputString)
    t.equal(result.end, inputString.length - 1)
    t.type(result.filter, AndFilter)
    t.equal(result.filter.clauses.length, 2)

    for (const filter of result.filter.clauses) {
      t.type(filter, EqualityFilter)
    }
  })

  t.end()
})

tap.test('OrFilter', t => {
  t.test('simple', async t => {
    const result = parse('(|(cn=foo))')
    t.equal(result.end, 10)
    t.type(result.filter, OrFilter)
    t.equal(result.filter.clauses.length, 1)
    t.type(result.filter.clauses[0], EqualityFilter)
  })

  t.test('multiple clauses', async t => {
    const inputString = '(|(cn=foo)(sn=bar))'
    const result = parse(inputString)
    t.equal(result.end, inputString.length - 1)
    t.type(result.filter, OrFilter)
    t.equal(result.filter.clauses.length, 2)

    for (const filter of result.filter.clauses) {
      t.type(filter, EqualityFilter)
    }
  })

  t.end()
})

tap.test('NotFilter', t => {
  t.test('simple', async t => {
    const result = parse('(!(cn=foo))')
    t.equal(result.end, 10)
    t.type(result.filter, NotFilter)
    t.equal(result.filter.clauses.length, 1)
    t.type(result.filter.clauses[0], EqualityFilter)
  })

  t.test('complex', async t => {
    const inputString = '(!(&(cn=foo)(sn=bar)))'
    const result = parse(inputString)
    t.equal(result.end, inputString.length - 1)
    t.type(result.filter, NotFilter)
    t.equal(result.filter.clauses.length, 1)

    const andFilter = result.filter.clauses[0]
    t.type(andFilter, AndFilter)

    for (const filter of andFilter.filter.clauses) {
      t.type(filter, EqualityFilter)
    }
  })

  t.test('throws for unbalanced parentheses', async t => {
    t.throws(
      () => parse('(!(cn=foo)'),
      Error('unbalanced parentheses')
    )
  })

  t.end()
})
