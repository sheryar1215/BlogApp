'use strict'

const FilterString = require('../filter-string')
const { search } = require('@ldapjs/protocol')
const { BerReader } = require('@ldapjs/asn1')

/**
 * Represents an extensible LDAP filter as defined in
 * https://www.rfc-editor.org/rfc/rfc2251.html#section-4.5.1.
 */
class ExtensibleFilter extends FilterString {
  #dnAttributes
  #rule

  /**
   * @typedef {FilterStringParams} ExtensibleParams
   * @property {string|undefined} [attribute=''] Name of the attribute to
   * match against, if any.
   * @property {*} [value=''] Value to test for.
   * @property {string} [rule] A matching rule OID if a speficic matching
   * rule is to be used.
   * @property {string|undefined} [matchType=''] An alias for `attribute`.
   * This parameter is provided for backward compatibility. Use `attribute`
   * instead.
   * @property {boolean} [dnAttributes=false] Indicates if all attributes
   * of a matching distinguished name should be tested.
   */

  /**
   * @param {ExtensibleParams} input
   *
   * @throws When `dnAttbributes` or `rule` are not valid.
   */
  constructor ({ attribute, value, rule, matchType, dnAttributes = false } = {}) {
    // `attribute` and `matchType` are allowed to be `undefined` per the
    // RFC. When either is not provided, an empty string will be used.
    // This is covered in the `toString` and `toBer` methods.

    if (typeof dnAttributes !== 'boolean') {
      throw Error('dnAttributes must be a boolean value')
    }
    if (rule && typeof rule !== 'string') {
      throw Error('rule must be a string')
    }

    super({ attribute, value })

    if (matchType !== undefined) {
      this.attribute = matchType
    }

    this.#dnAttributes = dnAttributes
    this.#rule = rule
    this.value = value ?? ''

    Object.defineProperties(this, {
      TAG: { value: search.FILTER_EXT },
      type: { value: 'ExtensibleFilter' }
    })
  }

  get json () {
    return {
      type: this.type,
      matchRule: this.#rule,
      matchType: this.attribute,
      matchValue: this.value,
      dnAttributes: this.#dnAttributes
    }
  }

  get dnAttributes () {
    return this.#dnAttributes
  }

  get matchingRule () {
    return this.#rule
  }

  get matchValue () {
    return this.value
  }

  get matchType () {
    return this.attribute
  }

  toString () {
    let result = '('

    if (this.attribute) {
      result += this.attribute
    }

    result += ':'

    if (this.#dnAttributes === true) {
      result += 'dn:'
    }

    if (this.#rule) {
      result += this.#rule + ':'
    }

    result += '=' + this.value + ')'
    return result
  }

  /**
   * Not implemented.
   *
   * @throws In all cases.
   */
  matches () {
    throw Error('not implemented')
  }

  _toBer (ber) {
    if (this.#rule) { ber.writeString(this.#rule, 0x81) }
    if (this.attribute) { ber.writeString(this.attribute, 0x82) }

    ber.writeString(this.value, 0x83)
    if (this.#dnAttributes === true) {
      ber.writeBoolean(this.#dnAttributes, 0x84)
    }

    return ber
  }

  /**
   * Parses a BER encoded `Buffer` and returns a new filter.
   *
   * @param {Buffer} buffer BER encoded buffer.
   *
   * @throws When the buffer does not start with the proper BER tag, or an
   * invalid context specific tag is encountered.
   *
   * @returns {ExtensibleFilter}
   */
  static parse (buffer) {
    const reader = new BerReader(buffer)

    const seq = reader.readSequence()
    if (seq !== search.FILTER_EXT) {
      const expected = '0x' + search.FILTER_EXT.toString(16).padStart(2, '0')
      const found = '0x' + seq.toString(16).padStart(2, '0')
      throw Error(`expected extensible filter sequence ${expected}, got ${found}`)
    }

    let rule
    let attribute
    let value
    let dnAttributes

    // Must set end outside of loop as the reader will update the
    // length property as the buffer is read.
    const end = reader.buffer.length
    while (reader.offset < end) {
      // Read the context specific tag and act accordingly.
      const tag = reader.peek()
      switch (tag) {
        case 0x81: {
          rule = reader.readString(tag)
          break
        }
        case 0x82: {
          attribute = reader.readString(tag)
          break
        }
        case 0x83: {
          value = reader.readString(tag)
          break
        }
        case 0x84: {
          dnAttributes = reader.readBoolean(tag)
          break
        }
        default: {
          throw Error('invalid extensible filter type: 0x' + tag.toString(16).padStart(2, '0'))
        }
      }
    }

    return new ExtensibleFilter({ attribute, value, rule, dnAttributes })
  }
}

module.exports = ExtensibleFilter
