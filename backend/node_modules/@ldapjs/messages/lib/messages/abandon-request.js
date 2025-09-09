'use strict'

const LdapMessage = require('../ldap-message')
const Protocol = require('@ldapjs/protocol')
const warning = require('../deprecations')

/**
 * Implements the abandon request message as described in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.11
 */
class AbandonRequest extends LdapMessage {
  #abandonId

  /**
   * @typedef {LdapMessageOptions} AbandonRequestOptions
   * @property {number} [abandonId=0] The message id of the request to abandon.
   */

  /**
   * @param {AbandonRequestOptions} [options]
   */
  constructor (options = {}) {
    options.protocolOp = Protocol.operations.LDAP_REQ_ABANDON
    super(options)

    const abandonId = options.abandonId || options.abandonID || 0
    if (options.abandonID) {
      warning.emit('LDAP_MESSAGE_DEP_003')
    }
    this.#abandonId = abandonId
  }

  /**
   * The identifier for the request that the instance will request be abandoned.
   *
   * @type {number}
   */
  get abandonId () {
    return this.#abandonId
  }

  /**
   * Use {@link abandonId} instead.
   *
   * @deprecated
   */
  get abandonID () {
    warning.emit('LDAP_MESSAGE_DEP_003')
    return this.#abandonId
  }

  /**
   * The name of the request type.
   *
   * @type {string}
   */
  get type () {
    return 'AbandonRequest'
  }

  /**
   * Internal use only.
   *
   * @param {import('@ldapjs/asn1').BerWriter} ber
   *
   * @returns {import('@ldapjs/asn1').BerWriter}
   */
  _toBer (ber) {
    ber.writeInt(this.#abandonId, Protocol.operations.LDAP_REQ_ABANDON)
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
    obj.abandonId = this.#abandonId
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
    const protocolOp = ber.peek()
    if (protocolOp !== Protocol.operations.LDAP_REQ_ABANDON) {
      const op = protocolOp.toString(16).padStart(2, '0')
      throw Error(`found wrong protocol operation: 0x${op}`)
    }

    const abandonId = ber.readInt(Protocol.operations.LDAP_REQ_ABANDON)
    return { protocolOp, abandonId }
  }
}

module.exports = AbandonRequest
