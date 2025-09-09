'use strict'

const LdapResult = require('../ldap-result')
const { operations } = require('@ldapjs/protocol')

/**
 * Implements the extension response message as described in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.12.
 *
 * The type of response is impossible to determine in isolation.
 * Most EXTENSION responses do not include the request OID. And they
 * all encode their values in unique ways. Therefore, this object's
 * {@link parseToPojo} never attempts to parse the response value.
 * Instead, if it is present, it reads the value as a buffer and
 * encodes it into a hexadecimal string prefixed with a `<buffer>`
 * token. This string is then used by the `#fromExtension` method
 * on specific implementations to build a new object. It is left up to
 * the implementor to know when certain responses are expected and
 * to act accordingly.
 */
class ExtensionResponse extends LdapResult {
  #responseName
  #responseValue

  /**
   * @typedef {LdapResultOptions} ExtensionResponseOptions
   * @property {string|undefined} [responseName] The name of the extension, i.e.
   * OID for the response.
   * @property {string|undefined} [responseValue] The value for the
   * response. It may be a buffer string; such a string is a series of
   * hexadecimal pairs preceded by the token `<buffer>`. Buffer strings
   * are used by specific response object types to get that type's specific
   * encoded value.
   */

  /**
   * @param {ExtensionResponseOptions} [options]
   */
  constructor (options = {}) {
    options.protocolOp = operations.LDAP_RES_EXTENSION
    super(options)

    this.responseName = options.responseName
    this.responseValue = options.responseValue
  }

  /**
   * The OID, if any, of the response.
   *
   * @returns {string|undefined}
   */
  get responseName () {
    return this.#responseName
  }

  /**
   * Define the name (OID) of the response.
   *
   * @param {string} value
   */
  set responseName (value) {
    this.#responseName = value
  }

  /**
   * The response value, if any. For specific extensions that
   * are not simple string values, the initial value is a buffer string.
   * That is, it is a hexadecimal string of bytes prefixed with `<buffer>`.
   * To parse this value, use a specific extension's `#fromResponse` method.
   *
   * @returns {string|undefined}
   */
  get responseValue () {
    return this.#responseValue
  }

  /**
   * Set the response value. Should be a buffer string if the value is
   * an encoded value.
   *
   * @param {string} value
   */
  set responseValue (value) {
    this.#responseValue = value
  }

  /**
   * The name of the request type.
   *
   * @type {string}
   */
  get type () {
    return 'ExtensionResponse'
  }

  /**
   * Internal use only. Used to write the response name and
   * response value into the BER object.
   *
   * @param {import('@ldapjs/asn1').BerWriter} ber
   *
   * @returns {import('@ldapjs/asn1').BerWriter}
   */
  _writeResponse (ber) {
    if (this.responseName) {
      ber.writeString(this.responseName, 0x8a)
    }

    if (this.responseValue === undefined) {
      return ber
    }

    switch (this.responseName) {
      default: {
        // We assume the value is a plain string since
        // we do not recognize the response OID, or we
        // know it would be a plain string.
        ber.writeString(this.responseValue, 0x8b)
      }
    }

    return ber
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
    const pojo = LdapResult._parseToPojo({
      opCode: operations.LDAP_RES_EXTENSION,
      berReader: ber
    })

    let responseName
    if (ber.peek() === 0x8a) {
      responseName = ber.readString(0x8a)
    }

    if (ber.peek() !== 0x8b) {
      return { ...pojo, responseName }
    }

    const valueBuffer = ber.readTag(0x8b)
    const responseValue = `<buffer>${valueBuffer.toString('hex')}`

    return { ...pojo, responseName, responseValue }
  }
}

module.exports = ExtensionResponse
