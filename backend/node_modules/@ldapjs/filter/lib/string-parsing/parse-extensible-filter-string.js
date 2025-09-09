'use strict'

const ExtensibleFilter = require('../filters/extensible')
const escapeFilterValue = require('../utils/escape-filter-value')

/**
 * Parses the string representation of an extensible filter into an
 * {@link ExtensibleFilter} instance. Note, the opening and closing
 * parentheticals should not be present in the string.
 *
 * @param {string} filterString Extensible filter string without parentheticals.
 *
 * @returns {ExtensibleFilter}
 *
 * @throws When the filter string is missing a `:=`.
 */
module.exports = function parseExtensibleFilterString (filterString) {
  const fields = filterString.split(':')
  const attribute = escapeFilterValue(fields.shift())

  const params = {
    attribute,
    dnAttributes: false,
    rule: undefined,
    value: undefined
  }

  if (fields[0].toLowerCase() === 'dn') {
    params.dnAttributes = true
    fields.shift()
  }
  if (fields.length !== 0 && fields[0][0] !== '=') {
    params.rule = fields.shift()
  }
  if (fields.length === 0 || fields[0][0] !== '=') {
    // With matchType, dnAttribute, and rule consumed, the := must be next.
    throw new Error('missing := in extensible filter string')
  }

  // Trim the leading = (from the :=)  and reinsert any extra ':' charachters
  // which may have been present in the value field.
  filterString = fields.join(':').substr(1)
  params.value = escapeFilterValue(filterString)

  return new ExtensibleFilter(params)
}
