'use strict'

const tap = require('tap')
const testValues = require('./test-values')

tap.test('matches a single value', async t => {
  const result = testValues({
    value: 42,
    rule (input) {
      return input === 42
    }
  })
  t.equal(result, true)
})

tap.test('requires all match', async t => {
  let result = testValues({
    value: [42, 35],
    requireAllMatch: true,
    rule (input) {
      return input >= 35
    }
  })
  t.equal(result, true)

  result = testValues({
    value: [42, 35],
    requireAllMatch: true,
    rule (input) {
      return input === 42
    }
  })
  t.equal(result, false)
})

tap.test('requires any match', async t => {
  let result = testValues({
    value: [42, 35],
    rule (input) {
      return input === 42
    }
  })
  t.equal(result, true)

  result = testValues({
    value: [42, 35],
    rule (input) {
      return input === 99
    }
  })
  t.equal(result, false)
})
