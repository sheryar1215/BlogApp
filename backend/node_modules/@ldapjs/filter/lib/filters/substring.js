'use strict'

const FilterString = require('../filter-string')
const { BerReader } = require('@ldapjs/asn1')
const { search } = require('@ldapjs/protocol')
const escapeFilterValue = require('../utils/escape-filter-value')
const testValues = require('../utils/test-values')
const getAttributeValue = require('../utils/get-attribute-value')
const warning = require('../deprecations')

/**
 * Represents a filter that matches substrings withing LDAP entry attribute
 * values, e.g. `(cn=*f*o*o)`.
 */
class SubstringFilter extends FilterString {
  #initial
  #any = []
  #final

  /**
   * Internal helper for backwards compatibility.
   * @type {Boolean}
   */
  #constructedWithSubPrefix

  /**
   * @typedef {FilterStringParams} SubstringParams
   * @property {string} input.attribute The attribute to test against.
   * @property {string} [initial] Text that must appear at the start
   * of a value and may not overlap any value of `any` or `final`.
   * @property {string} [subInitial] Deprecated, use `initial`.
   * @property {string[]} [any] Text items that must appear in the
   * attribute value that do not overlap with `initial`, `final`, or
   * any other `any` item.
   * @property {string[]} [subAny] Deprecated, use `any`.
   * @property {string} [final] Text that must appear at the end of
   * the attribute value. May not overlap with `initial` or any `any`
   * item.
   * @property {string} [subFinal] Deprecated, use `final`.
   */

  /**
   * @param {SubstringParams} input
   *
   * @throws When any input parameter is of an incorrect type.
   */
  constructor ({ attribute, initial, subInitial, any = [], subAny = [], final, subFinal } = {}) {
    if (subInitial) {
      warning.emit('LDAP_FILTER_DEP_002')
      initial = subInitial
    }

    if (Array.isArray(subAny) && subAny.length > 0) {
      warning.emit('LDAP_FILTER_DEP_003')
      any = subAny
    }

    if (subFinal) {
      warning.emit('LDAP_FILTER_DEP_004')
      final = subFinal
    }

    if (typeof attribute !== 'string' || attribute.length < 1) {
      throw Error('attribute must be a string of at least one character')
    }
    if (Array.isArray(any) === false) {
      throw Error('any must be an array of items')
    }
    if (Array.isArray(subAny) === false) {
      throw Error('subAny must be an array of items')
    }
    if (final && typeof final !== 'string') {
      throw Error('final must be a string')
    }

    super({ attribute })

    this.#initial = initial
    Array.prototype.push.apply(this.#any, any)
    this.#final = final
    this.#constructedWithSubPrefix = subInitial || subFinal || subAny.length > 0

    Object.defineProperties(this, {
      TAG: { value: search.FILTER_SUBSTRINGS },
      type: { value: 'SubstringFilter' }
    })
  }

  /**
   * @type {string}
   */
  get initial () {
    return this.#initial
  }

  /**
   * @type {string[]}
   */
  get any () {
    return this.#any
  }

  /**
   * @type {string}
   */
  get final () {
    return this.#final
  }

  /**
   * @deprecated 2023-06-29 Use `initial` instead.
   * @type {string}
   */
  get subInitial () {
    return this.#initial
  }

  /**
   * @deprecated 2023-06-29 Use `any` instead.
   * @type {string[]}
   */
  get subAny () {
    return this.#any
  }

  /**
   * @deprecated 2023-06-29 Use `final` instead.
   * @type {string}
   */
  get subFinal () {
    return this.#final
  }

  get json () {
    if (this.#constructedWithSubPrefix) {
      return {
        type: this.type,
        subInitial: this.#initial,
        subAny: this.#any,
        subFinal: this.#final
      }
    } else {
      return {
        type: this.type,
        initial: this.#initial,
        any: this.#any,
        final: this.#final
      }
    }
  }

  toString () {
    let result = '(' + escapeFilterValue(this.attribute) + '='

    if (this.#initial) {
      result += escapeFilterValue(this.#initial)
    }

    result += '*'

    for (const any of this.#any) {
      result += escapeFilterValue(any) + '*'
    }

    if (this.#final) {
      result += escapeFilterValue(this.#final)
    }

    result += ')'
    return result
  }

  /**
   * Determines if an object represents an equivalent filter instance.
   * Both the filter attribute and filter value must match the comparison
   * object.
   *
   * @example
   * const filter = new EqualityFilter({ attribute: 'foo', initial: 'bar' })
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
  matches (obj, strictAttrCase) {
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

    const targetValue = getAttributeValue({ sourceObject: obj, attributeName: this.attribute, strictCase: strictAttrCase })

    if (targetValue === undefined || targetValue === null) {
      return false
    }

    let re = ''

    if (this.#initial) { re += '^' + escapeRegExp(this.#initial) + '.*' }
    this.#any.forEach(function (s) {
      re += escapeRegExp(s) + '.*'
    })
    if (this.#final) { re += escapeRegExp(this.#final) + '$' }

    const matcher = new RegExp(re)
    return testValues({
      rule: v => matcher.test(v),
      value: targetValue
    })
  }

  _toBer (ber) {
    // Tag sequence as already been started via FilterString.toBer, so
    // start by writing the "type" field.
    ber.writeString(this.attribute)
    ber.startSequence()

    if (this.#initial) { ber.writeString(this.#initial, 0x80) }

    if (this.#any.length > 0) {
      for (const sub of this.#any) {
        ber.writeString(sub, 0x81)
      }
    }

    if (this.#final) { ber.writeString(this.#final, 0x82) }

    ber.endSequence()

    return ber
  }

  /**
   * Parses a BER encoded `Buffer` and returns a new filter.
   *
   * @param {Buffer} buffer BER encoded buffer.
   *
   * @throws When the buffer does not start with the proper BER tag.
   *
   * @returns {AndFilter}
   */
  static parse (buffer) {
    const reader = new BerReader(buffer)

    const seq = reader.readSequence()
    if (seq !== search.FILTER_SUBSTRINGS) {
      const expected = '0x' + search.FILTER_SUBSTRINGS.toString(16).padStart(2, '0')
      const found = '0x' + seq.toString(16).padStart(2, '0')
      throw Error(`expected substring filter sequence ${expected}, got ${found}`)
    }

    let initial
    const any = []
    let final

    const attribute = reader.readString()
    reader.readSequence()

    // Must set end outside of loop as the reader will update the
    // length property as the buffer is read.
    const end = reader.offset + reader.length
    while (reader.offset < end) {
      const tag = reader.peek()
      switch (tag) {
        case 0x80: { // Initial
          initial = reader.readString(tag)
          break
        }

        case 0x81: { // Any
          const anyVal = reader.readString(tag)
          any.push(anyVal)
          break
        }

        case 0x82: { // Final
          final = reader.readString(tag)
          break
        }

        default: {
          throw new Error('Invalid substrings filter type: 0x' + tag.toString(16))
        }
      }
    }

    return new SubstringFilter({ attribute, initial, any, final })
  }
}

function escapeRegExp (str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&') // eslint-disable-line
}

module.exports = SubstringFilter
