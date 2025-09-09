'use strict'

const tap = require('tap')
const Attribute = require('@ldapjs/attribute')
const getAttributeValue = require('./get-attribute-value')

tap.test('exact match', async (t) => {
  let result = getAttributeValue({ sourceObject: { attr: 'testval' }, attributeName: 'attr' })
  t.equal(result, 'testval')

  result = getAttributeValue({ sourceObject: { attr: 'testval' }, attributeName: 'missing' })
  t.equal(result, undefined)
})

tap.test('getAttributeValue insensitive match', async (t) => {
  const sourceObject = {
    lower: 'lower',
    UPPER: 'upper',
    MiXeD: 'mixed'
  }
  let result = getAttributeValue({ sourceObject, attributeName: 'lower' })
  t.equal(result, 'lower')

  result = getAttributeValue({ sourceObject, attributeName: 'upper' })
  t.equal(result, 'upper')

  result = getAttributeValue({ sourceObject, attributeName: 'mixed' })
  t.equal(result, 'mixed')

  result = getAttributeValue({ sourceObject, attributeName: 'missing' })
  t.equal(result, undefined)
})

tap.test('getAttributeValue strict match', async (t) => {
  const sourceObject = {
    lower: 'lower',
    UPPER: 'upper',
    MiXeD: 'mixed'
  }
  const strictCase = true

  let result = getAttributeValue({ sourceObject, attributeName: 'lower', strictCase })
  t.equal(result, 'lower')

  result = getAttributeValue({ sourceObject, attributeName: 'upper', strictCase })
  t.equal(result, undefined)

  result = getAttributeValue({ sourceObject, attributeName: 'UPPER', strictCase })
  t.equal(result, 'upper')

  result = getAttributeValue({ sourceObject, attributeName: 'mixed', strictCase })
  t.equal(result, undefined)

  result = getAttributeValue({ sourceObject, attributeName: 'MiXeD', strictCase })
  t.equal(result, 'mixed')

  result = getAttributeValue({ sourceObject, attributeName: 'missing', strictCase })
  t.equal(result, undefined)
})

tap.test('supports Attribute objects', async t => {
  const sourceObject = Attribute.fromObject({ cn: 'foo' }).pop()
  const result = getAttributeValue({ sourceObject, attributeName: 'cn' })
  t.strictSame(result, ['foo'])
})
