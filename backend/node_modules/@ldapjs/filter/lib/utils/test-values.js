'use strict'

module.exports = testValues

/**
 * Tests if the given input matches some condition.
 *
 * @callback ruleCallback
 * @param {*} input Value to test.
 * @returns {boolean}
 */

/**
 * Check value or array with test function.
 *
 * @param {object} input
 * @param {ruleCallback} input.rule Synchronous function that tests if an input
 * matches some condition. Must return `true` or `false`.
 * @param {*|*[]} input.value An item, or list of items, to verify with the
 * rule function.
 * @param {boolean} [input.requireAllMatch=false] require all array values to match.
 *
 * @returns {boolean}
 */
function testValues ({ rule, value, requireAllMatch = false }) {
  if (Array.isArray(value) === false) {
    return rule(value)
  }

  if (requireAllMatch === true) {
    // Do all entries match rule?
    for (let i = 0; i < value.length; i++) {
      if (rule(value[i]) === false) {
        return false
      }
    }
    return true
  }

  // Do any entries match rule?
  for (let i = 0; i < value.length; i++) {
    if (rule(value[i])) {
      return true
    }
  }
  return false
}
