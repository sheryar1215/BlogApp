'use strict'

const tap = require('tap')
const parse = require('./parse-expression')

const ApproximateFilter = require('../filters/approximate')
const EqualityFilter = require('../filters/equality')
const ExtensibleFilter = require('../filters/extensible')
const GreaterThanEqualsFilter = require('../filters/greater-than-equals')
const LessThanEqualsFilter = require('../filters/less-than-equals')
const PresenceFilter = require('../filters/presence')
const SubstringFilter = require('../filters/substring')

tap.test('throws for invalid attribute name', async t => {
  t.throws(
    () => parse('$foo=bar'),
    Error('invalid attribute name')
  )
})

tap.test('throws for invalid exspression', async t => {
  t.throws(
    () => parse('this is invalid'),
    Error('invalid expression')
  )
})

tap.test('parses PresenceFilter', async t => {
  const result = parse('cn=*')
  t.type(result, PresenceFilter)
  t.equal(result.toString(), '(cn=*)')
})

tap.test('parses a complete SubstringFilter', async t => {
  const result = parse('cn=J*o*h*n*D*o*e')
  t.type(result, SubstringFilter)
  t.equal(result.toString(), '(cn=J*o*h*n*D*o*e)')
  t.equal(result.initial, 'J')
  t.equal(result.final, 'e')
  t.strictSame(result.any, ['o', 'h', 'n', 'D', 'o'])
})

tap.test('parses an EqualityFilter', async t => {
  const result = parse('cn=foo')
  t.type(result, EqualityFilter)
  t.equal(result.toString(), '(cn=foo)')
})

tap.test('parses an GreaterThanEqualsFilter', async t => {
  const result = parse('cn>=foo')
  t.type(result, GreaterThanEqualsFilter)
  t.equal(result.toString(), '(cn>=foo)')
})

tap.test('parses an LessThanEqualsFilter', async t => {
  const result = parse('cn<=foo')
  t.type(result, LessThanEqualsFilter)
  t.equal(result.toString(), '(cn<=foo)')
})

tap.test('parses an ApproximateFilter', async t => {
  const result = parse('cn~=foo')
  t.type(result, ApproximateFilter)
  t.equal(result.toString(), '(cn~=foo)')
})

tap.test('ExtensibleFilter', t => {
  t.test('when expression starts with :', async t => {
    const result = parse(':caseExactMatch:=foo')
    t.type(result, ExtensibleFilter)
    t.equal(result.toString(), '(:caseExactMatch:=foo)')
  })

  t.test('when expression contains :=', async t => {
    const result = parse('sn:caseExactMatch:=foo')
    t.type(result, ExtensibleFilter)
    t.equal(result.toString(), '(sn:caseExactMatch:=foo)')
  })

  t.test('missing :=', async t => {
    t.throws(
      () => parse(':dn:oops'),
      Error('missing := in extensible filter string')
    )
  })

  t.end()
})

tap.test('parses filter with non-ascii characters', t => {
  t.test('í', async t => {
    const result = parse('cn=í')
    t.type(result, EqualityFilter)
    t.equal(result.value, 'í')
    t.equal(result.toString(), '(cn=\\c3\\ad)')
  })

  t.test('ø', async t => {
    const result = parse('cn=ø')
    t.type(result, EqualityFilter)
    t.equal(result.value, 'ø')
    t.equal(result.toString(), '(cn=\\c3\\b8)')
  })

  t.end()
})
