'use strict'

const tap = require('tap')
const escapeSubstring = require('./escape-substring')

tap.test('throws if separator missing', async t => {
  t.throws(
    () => escapeSubstring('foo'),
    Error('extensible filter delimiter missing')
  )
})

tap.test('escapes an initial only string', async t => {
  const expected = { initial: 'f\\28o', final: '', any: [] }
  const result = escapeSubstring('f(o*')
  t.strictSame(expected, result)
})

tap.test('escapes string with initial and final', async t => {
  const expected = { initial: 'f\\28o', final: 'bar', any: [] }
  const result = escapeSubstring('f(o*bar')
  t.strictSame(expected, result)
})

tap.test('escapes string with initial, final, and any', async t => {
  const expected = { initial: 'f\\28o', final: 'b\\29f', any: ['bar', 'baz'] }
  const result = escapeSubstring('f(o*bar*baz*b)f')
  t.strictSame(expected, result)
})
