'use strict'

const tap = require('tap')
const { search } = require('@ldapjs/protocol')
const parseString = require('../../string-parsing/parse-string')
const parseNestedFilter = require('./parse-nested-filter')

tap.test('and filter', t => {
  const AndFilter = require('../and')
  const startTag = search.FILTER_AND
  const constructor = AndFilter

  t.test('basic', async t => {
    const target = '(&)'
    const input = parseString(target)
    const f = parseNestedFilter({
      buffer: input.toBer().buffer,
      startTag,
      constructor
    })
    t.equal(f.toString(), target)
  })

  t.test('approximate', async t => {
    const target = '(&(cn~=foo))'
    const input = parseString(target)
    const f = parseNestedFilter({
      buffer: input.toBer().buffer,
      startTag,
      constructor
    })
    t.equal(f.toString(), target)
  })

  t.test('equality', async t => {
    const target = '(&(cn=foo))'
    const input = parseString(target)
    const f = parseNestedFilter({
      buffer: input.toBer().buffer,
      startTag,
      constructor
    })
    t.equal(f.toString(), target)
  })

  t.test('extensible', async t => {
    const target = '(&(:caseExactMatch:=foo))'
    const input = parseString(target)
    const f = parseNestedFilter({
      buffer: input.toBer().buffer,
      startTag,
      constructor
    })
    t.equal(f.toString(), target)
  })

  t.test('greater-than-equals', async t => {
    const target = '(&(cn>=foo))'
    const input = parseString(target)
    const f = parseNestedFilter({
      buffer: input.toBer().buffer,
      startTag,
      constructor
    })
    t.equal(f.toString(), target)
  })

  t.test('less-than-equals', async t => {
    const target = '(&(cn<=foo))'
    const input = parseString(target)
    const f = parseNestedFilter({
      buffer: input.toBer().buffer,
      startTag,
      constructor
    })
    t.equal(f.toString(), target)
  })

  t.test('not', async t => {
    const target = '(&(objectClass=Person)(!(cn=foo)))'
    const input = parseString(target)
    const f = parseNestedFilter({
      buffer: input.toBer().buffer,
      startTag,
      constructor
    })
    t.equal(f.toString(), target)
  })

  t.test('or', async t => {
    const target = '(&(objectClass=Person)(|(sn=Jensen)(cn=Babs J*)))'
    const input = parseString(target)
    const f = parseNestedFilter({
      buffer: input.toBer().buffer,
      startTag,
      constructor
    })
    t.equal(f.toString(), target)
  })

  t.test('present', async t => {
    const target = '(&(cn=*))'
    const input = parseString(target)
    const f = parseNestedFilter({
      buffer: input.toBer().buffer,
      startTag,
      constructor
    })
    t.equal(f.toString(), target)
  })

  t.test('substring', async t => {
    const target = '(&(cn=foo*))'
    const input = parseString(target)
    const f = parseNestedFilter({
      buffer: input.toBer().buffer,
      startTag,
      constructor
    })
    t.equal(f.toString(), target)
  })

  t.end()
})

tap.test('not filter', t => {
  const NotFilter = require('../not')
  const startTag = search.FILTER_NOT
  const constructor = NotFilter

  t.test('basic', async t => {
    const target = '(!(cn=foo))'
    const input = parseString(target)
    const f = parseNestedFilter({
      buffer: input.toBer().buffer,
      startTag,
      constructor
    })
    t.equal(f.toString(), target)
  })

  t.end()
})

tap.test('or filter', t => {
  const OrFilter = require('../or')
  const startTag = search.FILTER_OR
  const constructor = OrFilter

  t.test('basic', async t => {
    const target = '(|(cn=foo))'
    const input = parseString(target)
    const f = parseNestedFilter({
      buffer: input.toBer().buffer,
      startTag,
      constructor
    })
    t.equal(f.toString(), target)
  })

  t.end()
})
