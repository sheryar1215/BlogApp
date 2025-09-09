'use strict'

const LdapMessage = require('../ldap-message')
const { operations } = require('@ldapjs/protocol')

const partIsNotNumeric = part => /^\d+$/.test(part) === false

/**
 * Determines if a passed in string is a dotted decimal string.
 *
 * Copied from `@ldapjs/dn`.
 *
 * @param {string} value
 *
 * @returns {boolean}
 */
function isDottedDecimal (value) {
  if (typeof value !== 'string') return false

  const parts = value.split('.')
  const nonNumericParts = parts.filter(partIsNotNumeric)

  return nonNumericParts.length === 0
}

/**
 * Implements the intermediate response message as described in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.13.
 *
 * TODO: actual implementations of this, e.g. RFC 4533 §2.5, seem to encode
 * sequences in the responseValue. That means this needs a more robust
 * implementation like is found in the ExtensionResponse implementation (i.e.
 * detection of recognized OIDs and specific sub-implementations). As of now,
 * this implementation follows the baseline spec without any sub-implementations.
 */
class IntermediateResponse extends LdapMessage {
  #responseName
  #responseValue

  /**
   * @typedef {LdapMessageOptions} IntermediateResponseOptions
   * @property {string} responseName
   * @property {string} responseValue
   */

  /**
   * @param {IntermediateResponseOptions} options
   */
  constructor (options = {}) {
    options.protocolOp = operations.LDAP_RES_INTERMEDIATE
    super(options)

    this.responseName = options.responseName ?? null
    this.responseValue = options.responseValue ?? null
  }

  /**
   * The name of the request type.
   *
   * @type {string}
   */
  get type () {
    return 'IntermediateResponse'
  }

  /**
   * The numeric OID that identifies the type of intermediate response.
   *
   * @returns {string | undefined}
   */
  get responseName () {
    return this.#responseName
  }

  /**
   * Define the numeric OID that identifies the type of intermediate response.
   *
   * @param {string | null} value
   *
   * @throws For an invalid value.
   */
  set responseName (value) {
    if (value === null) return
    if (isDottedDecimal(value) === false) {
      throw Error('responseName must be a numeric OID')
    }
    this.#responseName = value
  }

  /**
   * The value for the intermidate response if any.
   *
   * @returns {string | undefined}
   */
  get responseValue () {
    return this.#responseValue
  }

  /**
   * Define the value for the intermediate response.
   *
   * @param {string | null} value
   *
   * @throws For an invalid value.
   */
  set responseValue (value) {
    if (value === null) return
    if (typeof value !== 'string') {
      throw Error('responseValue must be a string')
    }
    this.#responseValue = value
  }

  /**
   * Internal use only.
   *
   * @param {import('@ldapjs/asn1').BerWriter} ber
   *
   * @returns {import('@ldapjs/asn1').BerWriter}
   */
  _toBer (ber) {
    ber.startSequence(operations.LDAP_RES_INTERMEDIATE)

    if (this.#responseName) {
      ber.writeString(this.#responseName, 0x80)
    }
    if (this.#responseValue) {
      ber.writeString(this.#responseValue, 0x81)
    }

    ber.endSequence()
    return ber
  }

  /**
   * Internal use only.
   *
   * @param {object}
   *
   * @returns {object}
   */
  _pojo (obj = {}) {
    obj.responseName = this.#responseName
    obj.responseValue = this.#responseValue
    return obj
  }

  /**
   * Implements the standardized `parseToPojo` method.
   *
   * @see LdapMessage.parseToPojo
   *
   * @param {import('@ldapjs/asn1').BerReader} ber
   *
   * @returns {object}
   */
  static parseToPojo (ber) {
    const protocolOp = ber.readSequence()
    if (protocolOp !== operations.LDAP_RES_INTERMEDIATE) {
      const op = protocolOp.toString(16).padStart(2, '0')
      throw Error(`found wrong protocol operation: 0x${op}`)
    }

    let responseName
    let responseValue

    let tag = ber.peek()
    switch (tag) {
      case 0x80: {
        responseName = ber.readString(tag)

        tag = ber.peek()
        /* istanbul ignore else */
        if (tag === 0x81) {
          responseValue = ber.readString(tag)
        }
        break
      }

      case 0x81: {
        responseValue = ber.readString(tag)
      }
    }

    return { protocolOp, responseName, responseValue }
  }
}

module.exports = IntermediateResponse
