'use strict'

const ApproximateFilter = require('../filters/approximate')
const EqualityFilter = require('../filters/equality')
const GreaterThanEqualsFilter = require('../filters/greater-than-equals')
const LessThanEqualsFilter = require('../filters/less-than-equals')
const PresenceFilter = require('../filters/presence')
const SubstringFilter = require('../filters/substring')
const escapeSubstring = require('./escape-substring')
const parseExtensibleFilterString = require('./parse-extensible-filter-string')

const attrRegex = /^[-_a-zA-Z0-9]+/

/**
 * Given the expression part of a filter string, e.g. `cn=foo` in `(cn=foo)`,
 * parse it into the corresponding filter instance(s).
 *
 * @param {string} inputString The filter expression to parse.
 *
 * @returns {FilterString}
 *
 * @throws When some parsing error occurs.
 */
module.exports = function parseExpr (inputString) {
  let attribute
  let match
  let remainder

  if (inputString[0] === ':' || inputString.indexOf(':=') > 0) {
    // An extensible filter can have no attribute name.
    return parseExtensibleFilterString(inputString)
  } else if ((match = inputString.match(attrRegex)) !== null) {
    attribute = match[0]
    remainder = inputString.substring(attribute.length)
  } else {
    throw new Error('invalid attribute name')
  }

  if (remainder === '=*') {
    return new PresenceFilter({ attribute })
  } else if (remainder[0] === '=') {
    remainder = remainder.substring(1)
    if (remainder.indexOf('*') !== -1) {
      const val = escapeSubstring(remainder)
      return new SubstringFilter({
        attribute,
        initial: val.initial,
        any: val.any,
        final: val.final
      })
    } else {
      return new EqualityFilter({
        attribute,
        value: remainder
      })
    }
  } else if (remainder[0] === '>' && remainder[1] === '=') {
    return new GreaterThanEqualsFilter({
      attribute,
      value: remainder.substring(2)
    })
  } else if (remainder[0] === '<' && remainder[1] === '=') {
    return new LessThanEqualsFilter({
      attribute,
      value: remainder.substring(2)
    })
  } else if (remainder[0] === '~' && remainder[1] === '=') {
    return new ApproximateFilter({
      attribute,
      value: remainder.substring(2)
    })
  }

  throw new Error('invalid expression')
}
