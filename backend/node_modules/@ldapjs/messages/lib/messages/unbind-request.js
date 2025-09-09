'use strict'

const LdapMessage = require('../ldap-message')
const { operations } = require('@ldapjs/protocol')

/**
 * Implements the unbind request message as described in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.3.
 */
class UnbindRequest extends LdapMessage {
  /**
   * @param {LdapMessageOptions} options
   */
  constructor (options = {}) {
    options.protocolOp = operations.LDAP_REQ_UNBIND
    super(options)
  }

  /**
   * The name of the request type.
   *
   * @type {string}
   */
  get type () {
    return 'UnbindRequest'
  }

  /**
   * Internal use only.
   *
   * @param {import('@ldapjs/asn1').BerWriter} ber
   *
   * @returns {import('@ldapjs/asn1').BerWriter}
   */
  _toBer (ber) {
    ber.writeString('', operations.LDAP_REQ_UNBIND)
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
    return obj
  }

  /**
   * Implements the standardized `parseToPojo` method.
   *
   * @see LdapMessage.parseToPojo
   *
   * @param {import('@ldapjs/asn1').BerReader} ber
   */
  static parseToPojo (ber) {
    const protocolOp = ber.readSequence()
    if (protocolOp !== operations.LDAP_REQ_UNBIND) {
      const op = protocolOp.toString(16).padStart(2, '0')
      throw Error(`found wrong protocol operation: 0x${op}`)
    }

    return { protocolOp }
  }
}

module.exports = UnbindRequest
