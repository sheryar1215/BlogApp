'use strict'

const escapeFilterValue = require('../utils/escape-filter-value')

/**
 * In an extensible filter, the righthand size of the filter can have
 * substrings delimeted by `*` characters, e.g. `foo=*foo*bar*baz*`. This
 * function is used to encode those substrings.
 *
 * @param {string} str In `*foo*bar*baz*` it would be `foo*bar*baz`.
 *
 * @returns {object} An object with extensible filter properties.
 *
 * @throws When the separator is missing from the input string.
 */
module.exports = function escapeSubstring (str) {
  const fields = str.split('*')
  const out = {
    initial: '',
    final: '',
    any: []
  }

  if (fields.length <= 1) {
    throw Error('extensible filter delimiter missing')
  }

  out.initial = escapeFilterValue(fields.shift())
  out.final = escapeFilterValue(fields.pop())
  Array.prototype.push.apply(out.any, fields.map(escapeFilterValue))

  return out
}
