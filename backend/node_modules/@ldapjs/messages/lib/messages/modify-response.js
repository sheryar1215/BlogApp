'use strict'

const LdapResult = require('../ldap-result')
const { operations } = require('@ldapjs/protocol')

/**
 * Implements the MODIFY response message as described in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.6.
 */
class ModifyResponse extends LdapResult {
  /**
   * @param {LdapResultOptions} options
   */
  constructor (options = {}) {
    options.protocolOp = operations.LDAP_RES_MODIFY
    super(options)
  }

  /**
   * The name of the request type.
   *
   * @type {string}
   */
  get type () {
    return 'ModifyResponse'
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
    return LdapResult._parseToPojo({
      opCode: operations.LDAP_RES_MODIFY,
      berReader: ber
    })
  }
}

module.exports = ModifyResponse
