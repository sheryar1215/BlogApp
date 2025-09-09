'use strict'

const FilterString = require('../filter-string')
const { BerReader, BerTypes } = require('@ldapjs/asn1')
const { search } = require('@ldapjs/protocol')
const escapeFilterValue = require('../utils/escape-filter-value')
const testValues = require('../utils/test-values')
const getAttributeValue = require('../utils/get-attribute-value')

/**
 * Represents a basic filter for determining if an LDAP entry contains a
 * specified attribute that equals a given value, e.g. `(cn=foo)`.
 */
class EqualityFilter extends FilterString {
  #raw

  /**
   * @typedef {FilterStringParams} EqualityParams
   * @property {string} attribute The name of the LDAP addtribute this
   * filter will target.
   * @property {string|Buffer} [value] A string or buffer value as the
   * test for this filter. Required if `raw` is not provided.
   * @property {Buffer} [raw] A buffer to use as the test for this filter.
   * Required if `value` is not provided.
   */

  /**
   * @param {EqualityParams} input
   *
   * @throws When no value, either through `value` or `raw`, is provided.
   * Also throws when `attribute` is not a string.
   */
  constructor ({ attribute, raw, value } = {}) {
    if (typeof attribute !== 'string' || attribute.length < 1) {
      throw Error('attribute must be a string of at least one character')
    }

    super({ attribute, value })

    if (raw) {
      this.#raw = raw
    } else {
      if (!value) {
        throw Error('must either provide a buffer via `raw` or some `value`')
      }
      this.#raw = Buffer.from(value)
    }

    Object.defineProperties(this, {
      TAG: { value: search.FILTER_EQUALITY },
      type: { value: 'EqualityFilter' }
    })
  }

  get value () {
    return Buffer.isBuffer(this.#raw) ? this.#raw.toString() : this.#raw
  }

  set value (val) {
    if (typeof val === 'string') {
      this.#raw = Buffer.from(val)
    } else if (Buffer.isBuffer(val)) {
      this.#raw = Buffer.alloc(val.length)
      val.copy(this.#raw)
    } else {
      this.#raw = val
    }
  }

  /**
   * Determines if an object represents an equivalent filter instance.
   * Both the filter attribute and filter value must match the comparison
   * object.
   *
   * @example
   * const filter = new EqualityFilter({ attribute: 'foo', value: 'bar' })
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

    let testValue = this.value

    if (this.attribute.toLowerCase() === 'objectclass') {
      // Perform a case-insensitive match for `objectClass` as most LDAP
      // implementations behave in this manner.
      const targetAttribute = getAttributeValue({
        sourceObject: obj,
        attributeName: this.attribute,
        strictCase: false
      })
      testValue = testValue.toLowerCase()
      return testValues({
        rule: v => testValue === v.toLowerCase(),
        value: targetAttribute
      })
    }

    const targetAttribute = getAttributeValue({
      sourceObject: obj,
      attributeName: this.attribute,
      strictCase: strictAttrCase
    })
    return testValues({
      rule: v => testValue === v,
      value: targetAttribute
    })
  }

  /**
   * @throws When `value` is not a string or a buffer.
   */
  toString () {
    let value
    if (Buffer.isBuffer(this.#raw)) {
      value = this.#raw
      const decoded = this.#raw.toString('utf8')
      const validate = Buffer.from(decoded, 'utf8')

      // Use the decoded UTF-8 if it is valid, otherwise fall back to bytes.
      // Since Buffer.compare is missing in older versions of node, a simple
      // length comparison is used as a heuristic.  This can be updated later to
      // a full compare if it is found lacking.
      if (validate.length === this.#raw.length) {
        value = decoded
      }
    } else if (typeof (this.#raw) === 'string') {
      value = this.#raw
    } else {
      throw new Error('invalid value type')
    }
    return ('(' + escapeFilterValue(this.attribute) +
          '=' + escapeFilterValue(value) + ')')
  }

  _toBer (ber) {
    ber.writeString(this.attribute)
    ber.writeBuffer(this.#raw, BerTypes.OctetString)
    return ber
  }

  /**
   * Parses a BER encoded `Buffer` and returns a new filter.
   *
   * @param {Buffer} buffer BER encoded buffer.
   *
   * @throws When the buffer does not start with the proper BER tag.
   *
   * @returns {EqualityFilter}
   */
  static parse (buffer) {
    const reader = new BerReader(buffer)

    const tag = reader.readSequence()
    if (tag !== search.FILTER_EQUALITY) {
      const expected = '0x' + search.FILTER_EQUALITY.toString(16).padStart(2, '0')
      const found = '0x' + tag.toString(16).padStart(2, '0')
      throw Error(`expected equality filter sequence ${expected}, got ${found}`)
    }

    const attribute = reader.readString()
    const value = reader.readString(BerTypes.OctetString, true)

    return new EqualityFilter({ attribute, value })
  }
}

module.exports = EqualityFilter
