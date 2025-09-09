'use strict'

const FilterString = require('../filter-string')
const { BerReader } = require('@ldapjs/asn1')
const { search } = require('@ldapjs/protocol')
const escapeFilterValue = require('../utils/escape-filter-value')
const testValues = require('../utils/test-values')
const getAttributeValue = require('../utils/get-attribute-value')

/**
 * Represents a basic filter for determining if an LDAP entry contains a
 * specified attribute that is greater than or equal to a given value,
 * e.g. `(cn>=foo)`.
 */
class GreaterThanEqualsFilter extends FilterString {
  /**
   * @typedef {FilterStringParams} GreaterThanEqualsParams
   * @property {string} attribute
   * @property {string} value
   */

  /**
   * @param {GreaterThanEqualsParams} input
   *
   * @throws When `attribute` or `value` is not a string.
   */
  constructor ({ attribute, value } = {}) {
    if (typeof attribute !== 'string' || attribute.length < 1) {
      throw Error('attribute must be a string of at least one character')
    }
    if (typeof value !== 'string' || value.length < 1) {
      throw Error('value must be a string of at least one character')
    }

    super({ attribute, value })

    Object.defineProperties(this, {
      TAG: { value: search.FILTER_GE },
      type: { value: 'GreaterThanEqualsFilter' }
    })
  }

  /**
   * Determines if an object represents a greater-than-equals filter instance.
   * Both the filter attribute and filter value must match the comparison
   * object.
   *
   * @example
   * const filter = new GreaterThanEqualsFilter({ attribute: 'foo', value: 'bar' })
   * assert.equal(filter.matches({ foo: 'bar' }), true)
   *
   * @param {object} obj An object to check for match.
   * @param {boolean} [strictAttrCase=true] If `false`, "fOo" will match
   * "foo" in the attribute position (left hand side).
   *
   * @throws When input types are not correct.
   *
   * @returns {boolean}
   */
  matches (obj, strictAttrCase = true) {
    if (Array.isArray(obj) === true) {
      for (const attr of obj) {
        if (Object.prototype.toString.call(attr) !== '[object LdapAttribute]') {
          throw Error('array element must be an instance of LdapAttribute')
        }
        if (this.matches(attr, strictAttrCase) === true) {
          return true
        }
      }
      return false
    }

    const testValue = this.value
    const targetAttribute = getAttributeValue({ sourceObject: obj, attributeName: this.attribute, strictCase: strictAttrCase })

    return testValues({
      rule: v => testValue <= v,
      value: targetAttribute
    })
  }

  toString () {
    return ('(' + escapeFilterValue(this.attribute) +
          '>=' + escapeFilterValue(this.value) + ')')
  }

  _toBer (ber) {
    ber.writeString(this.attribute)
    ber.writeString(this.value)
    return ber
  }

  /**
   * Parses a BER encoded `Buffer` and returns a new filter.
   *
   * @param {Buffer} buffer BER encoded buffer.
   *
   * @throws When the buffer does not start with the proper BER tag.
   *
   * @returns {GreaterThanEqualsFilter}
   */
  static parse (buffer) {
    const reader = new BerReader(buffer)

    const seq = reader.readSequence()
    if (seq !== search.FILTER_GE) {
      const expected = '0x' + search.FILTER_GE.toString(16).padStart(2, '0')
      const found = '0x' + seq.toString(16).padStart(2, '0')
      throw Error(`expected greater-than-equals filter sequence ${expected}, got ${found}`)
    }

    const attribute = reader.readString()
    const value = reader.readString()

    return new GreaterThanEqualsFilter({ attribute, value })
  }
}

module.exports = GreaterThanEqualsFilter
