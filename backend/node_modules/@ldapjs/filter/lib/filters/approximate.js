'use strict'

const FilterString = require('../filter-string')
const { BerReader } = require('@ldapjs/asn1')
const { search } = require('@ldapjs/protocol')
const escapeFilterValue = require('../utils/escape-filter-value')

/**
 * Represents a basic filter for determining if an LDAP entry contains a
 * specified attribute that is approximately equal a given value,
 * e.g. `(cn~=foo)`.
 */
class ApproximateFilter extends FilterString {
  /**
   * @typedef {FilterStringParams} AttributeParams
   */

  /**
   * @param {AttributeParams} input
   *
   * @throws When either `attribute` or `value` is not a string of at least
   * one character.
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
      TAG: { value: search.FILTER_APPROX },
      type: { value: 'ApproximateFilter' }
    })
  }

  /**
   * Not implemented.
   *
   * @throws In all cases.
   */
  matches () {
    throw Error('not implemented')
  }

  toString () {
    return ('(' + escapeFilterValue(this.attribute) +
          '~=' + escapeFilterValue(this.value) + ')')
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
   * @returns {ApproximateFilter}
   */
  static parse (buffer) {
    const reader = new BerReader(buffer)

    const seq = reader.readSequence()
    if (seq !== search.FILTER_APPROX) {
      const expected = '0x' + search.FILTER_APPROX.toString(16).padStart(2, '0')
      const found = '0x' + seq.toString(16).padStart(2, '0')
      throw Error(`expected approximate filter sequence ${expected}, got ${found}`)
    }

    const attribute = reader.readString()
    const value = reader.readString()

    return new ApproximateFilter({ attribute, value })
  }
}

module.exports = ApproximateFilter
