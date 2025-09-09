'use strict'

const tap = require('tap')
const ExtensibleFilter = require('../filters/extensible')
const parse = require('./parse-extensible-filter-string')

tap.test('parses simple filter', async t => {
  const result = parse('givenName:=John')
  t.type(result, ExtensibleFilter)
  t.equal(result.toString(), '(givenName:=John)')
})

tap.test('parses dn filter', async t => {
  const result = parse('givenName:dn:=John')
  t.type(result, ExtensibleFilter)
  t.equal(result.toString(), '(givenName:dn:=John)')
})

tap.test('parses rule modified filter', async t => {
  const result = parse('givenName:caseExactMatch:=John')
  t.type(result, ExtensibleFilter)
  t.equal(result.toString(), '(givenName:caseExactMatch:=John)')
})

tap.test('parses oid rule modified filter', async t => {
  const result = parse('givenName:dn:2.5.13.5:=John')
  t.type(result, ExtensibleFilter)
  t.equal(result.toString(), '(givenName:dn:2.5.13.5:=John)')
})

tap.test('parses empty attribute filter', async t => {
  const result = parse(':caseExactMatch:=John')
  t.type(result, ExtensibleFilter)
  t.equal(result.toString(), '(:caseExactMatch:=John)')
})

tap.test('parses empty attribute oid modified with dn filter', async t => {
  const result = parse(':dn:2.5.13.5:=John')
  t.type(result, ExtensibleFilter)
  t.equal(result.toString(), '(:dn:2.5.13.5:=John)')
})

tap.test('re-adds : characters in filter value', async t => {
  const result = parse('givenName:=J:o:h:n')
  t.type(result, ExtensibleFilter)
  t.equal(result.toString(), '(givenName:=J:o:h:n)')
})

tap.test('throws if missing : before equals', async t => {
  t.throws(
    () => parse('givenName:dn:2.5.13.5=John'),
    Error('missing := in extensible filter string')
  )
})
