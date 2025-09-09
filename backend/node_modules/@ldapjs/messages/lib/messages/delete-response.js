'use strict'

const LdapResult = require('../ldap-result')
const { operations } = require('@ldapjs/protocol')

/**
 * Implements the delete response message as described in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.8.
 */
class DeleteResponse extends LdapResult {
  /**
   * @param {LdapResultOptions} options
   */
  constructor (options = {}) {
    options.protocolOp = operations.LDAP_RES_DELETE
    super(options)
  }

  /**
   * The name of the request type.
   *
   * @type {string}
   */
  get type () {
    return 'DeleteResponse'
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
      opCode: operations.LDAP_RES_DELETE,
      berReader: ber
    })
  }
}

module.exports = DeleteResponse
