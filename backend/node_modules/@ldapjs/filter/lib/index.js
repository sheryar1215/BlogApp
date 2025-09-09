'use strict'

const testValues = require('./utils/test-values')
const getAttributeValue = require('./utils/get-attribute-value')

const FilterString = require('./filter-string')
const AndFilter = require('./filters/and')
const ApproximateFilter = require('./filters/approximate')
const EqualityFilter = require('./filters/equality')
const ExtensibleFilter = require('./filters/extensible')
const GreaterThanEqualsFilter = require('./filters/greater-than-equals')
const LessThanEqualsFilter = require('./filters/less-than-equals')
const NotFilter = require('./filters/not')
const OrFilter = require('./filters/or')
const PresenceFilter = require('./filters/presence')
const SubstringFilter = require('./filters/substring')

const deprecations = require('./deprecations')
const parseString = require('./string-parsing/parse-string')

module.exports = {
  parseBer: require('./ber-parsing'),

  /**
   * @deprecated 2022-06-26 Use `parseString` instead.
   */
  parse: (string) => {
    deprecations.emit('LDAP_FILTER_DEP_001')
    return parseString(string)
  },
  parseString,

  // Helper utilties for writing custom matchers
  testValues,
  getAttrValue: getAttributeValue,
  getAttributeValue,

  // Filter definitions
  FilterString,
  AndFilter,
  ApproximateFilter,
  EqualityFilter,
  ExtensibleFilter,
  GreaterThanEqualsFilter,
  LessThanEqualsFilter,
  NotFilter,
  OrFilter,
  PresenceFilter,
  SubstringFilter
}
