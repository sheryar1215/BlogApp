'use strict'

const FilterString = require('../filter-string')
const { BerReader } = require('@ldapjs/asn1')
const { search } = require('@ldapjs/protocol')
const escapeFilterValue = require('../utils/escape-filter-value')
const getAttributeValue = require('../utils/get-attribute-value')

/**
 * Represents a basic filter for determining if an LDAP entry contains a
 * specified attribute, e.g. `(cn=*)`.
 */
class PresenceFilter extends FilterString {
  /**
   * @typedef {FilterStringParams} PresenceParams
   * @property {string} attribute The name of the attribute this filter targets.
   */

  /**
   * @param {PresenceParams} input
   *
   * @throws If no attribute name is given.
   */
  constructor ({ attribute } = {}) {
    if (typeof attribute !== 'string' || attribute.length < 1) {
      throw Error('attribute must be a string of at least one character')
    }

    super({ attribute })

    Object.defineProperties(this, {
      TAG: { value: search.FILTER_PRESENT },
      type: { value: 'PresenceFilter' }
    })
  }

  /**
   * Determine if a given object matches the filter instance.
   *
   * @example
   * const filter = new PresenceFilter({ attribute: 'foo' })
   * assert.equal(filter.matches({ foo: "bar" }), true)
   *
   * @param {object} obj An object to check for match.
   * @param {boolean} [strictAttributeCase=true] If `false`, "fOo" will match
   * "foo".
   *
   * @throws When input types are not correct.
   *
   * @returns {boolean}
   */
  matches (obj, strictAttributeCase = true) {
    if (Array.isArray(obj) === true) {
      for (const attr of obj) {
        if (Object.prototype.toString.call(attr) !== '[object LdapAttribute]') {
          throw Error('array element must be an instance of LdapAttribute')
        }
        if (this.matches(attr, strictAttributeCase) === true) {
          return true
        }
      }
      return false
    }

    return getAttributeValue({
      sourceObject: obj,
      attributeName: this.attribute,
      strictCase: strictAttributeCase
    }) !== undefined
  }

  toString () {
    return `(${escapeFilterValue(this.attribute)}=*)`
  }

  _toBer (ber) {
    for (let i = 0; i < this.attribute.length; i++) {
      ber.writeByte(this.attribute.charCodeAt(i))
    }
  }

  /**
   * Parses a BER encoded `Buffer` and returns a new filter.
   *
   * @param {Buffer} buffer BER encoded buffer.
   *
   * @throws When the buffer does not start with the proper BER tag.
   *
   * @returns {PresenceFilter}
   */
  static parse (buffer) {
    const reader = new BerReader(buffer)

    const tag = reader.peek()
    if (tag !== search.FILTER_PRESENT) {
      const expected = '0x' + search.FILTER_PRESENT.toString(16).padStart(2, '0')
      const found = '0x' + tag.toString(16).padStart(2, '0')
      throw Error(`expected presence filter sequence ${expected}, got ${found}`)
    }

    const attribute = reader.readString(tag)
    return new PresenceFilter({ attribute })
  }
}

module.exports = PresenceFilter
