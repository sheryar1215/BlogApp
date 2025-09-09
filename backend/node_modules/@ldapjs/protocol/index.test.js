'use strict'

const tap = require('tap')
const protocol = require('./')

tap.test('exports expected object', async t => {
  t.equal(Object.isFrozen(protocol), true);
  ['core', 'operations', 'resultCodes', 'search'].forEach(component => {
    t.ok(protocol[component])
    t.equal(Object.isFrozen(protocol[component]), true)
  })
})

tap.test('resultCodeToName', t => {
  t.test('returns undefined for not found', async t => {
    t.equal(protocol.resultCodeToName(-1), undefined)
  })

  t.test('returns correct name', async t => {
    t.equal(protocol.resultCodeToName(32), 'NO_SUCH_OBJECT')
  })

  t.end()
})
