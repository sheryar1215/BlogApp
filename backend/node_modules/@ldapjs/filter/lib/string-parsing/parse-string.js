'use strict'

const parseFilter = require('./parse-filter')

/**
 * Parse and LDAP filter string into a {@link FilterString} instance.
 *
 * @param {string} inputString The LDAP filter string to parse. Can omit the
 * leading and terminating parentheses.
 *
 * @returns {FilterString}
 *
 * @throws For any error while parsing.
 */
module.exports = function parseString (inputString) {
  if (typeof inputString !== 'string') {
    throw Error('input must be a string')
  }
  if (inputString.length < 1) {
    throw Error('input string cannot be empty')
  }

  let normalizedString = inputString
  if (normalizedString.charAt(0) !== '(') {
    // Wrap the filter in parentheses since it is not already wrapped.
    normalizedString = `(${normalizedString})`
  }

  const parsed = parseFilter(normalizedString)
  if (parsed.end < inputString.length - 1) {
    throw Error('unbalanced parentheses')
  }

  return parsed.filter
}
