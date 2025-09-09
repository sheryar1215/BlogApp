'use strict'

const LdapResult = require('../ldap-result')
const { operations } = require('@ldapjs/protocol')

/**
 * Implements the search result done response message as described in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.5.2.
 */
class SearchResultDone extends LdapResult {
  #uri

  /**
   * @typedef {LdapResultOptions} SearchResultDoneOptions
   * @property {string[]} [uri=[]] The set of reference URIs the message is
   * providing.
   * @property {string[]} [uris] An alias for uri.
   */

  /**
   * @param {SearchResultDoneOptions} options
   */
  constructor (options = {}) {
    options.protocolOp = operations.LDAP_RES_SEARCH_DONE
    super(options)
  }

  /**
   * The name of the request type.
   *
   * @type {string}
   */
  get type () {
    return 'SearchResultDone'
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
      opCode: operations.LDAP_RES_SEARCH_DONE,
      berReader: ber
    })
  }
}

module.exports = SearchResultDone
