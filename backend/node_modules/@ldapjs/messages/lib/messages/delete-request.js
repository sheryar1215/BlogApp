'use strict'

const LdapMessage = require('../ldap-message')
const Protocol = require('@ldapjs/protocol')
const { DN } = require('@ldapjs/dn')

/**
 * Implements the delete request message as described in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.8
 */
class DeleteRequest extends LdapMessage {
  #entry

  /**
   * @typedef {LdapMessageOptions} DeleteRequestOptions
   * @property {string} [entry=null] The LDAP entry path to remove.
   */

  /**
   * @param {DeleteRequestOptions} [options]
   */
  constructor (options = {}) {
    options.protocolOp = Protocol.operations.LDAP_REQ_DELETE
    super(options)

    this.entry = options.entry ?? null
  }

  /**
   * Alias of {@link name}.
   *
   * @type {string}
   */
  get _dn () {
    return this.entry
  }

  /**
   * The identifier for the request that the instance will request be abandoned.
   *
   * @type {number}
   */
  get entry () {
    return this.#entry ?? null
  }

  /**
   * Define the path to the LDAP object that will be deleted.
   *
   * @param {string | null | import('@ldapjs/dn').DN} value
   */
  set entry (value) {
    if (value === null) return
    if (typeof value === 'string') {
      this.#entry = DN.fromString(value)
    } else if (Object.prototype.toString.call(value) === '[object LdapDn]') {
      this.#entry = value
    } else {
      throw Error('entry must be a valid DN string or instance of LdapDn')
    }
  }

  /**
   * The name of the request type.
   *
   * @type {string}
   */
  get type () {
    return 'DeleteRequest'
  }

  /**
   * Internal use only.
   *
   * @param {import('@ldapjs/asn1').BerWriter} ber
   *
   * @returns {import('@ldapjs/asn1').BerWriter}
   */
  _toBer (ber) {
    ber.writeString(this.#entry.toString(), Protocol.operations.LDAP_REQ_DELETE)
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
    obj.protocolOp = Protocol.operations.LDAP_REQ_DELETE
    obj.entry = this.#entry ? this.#entry.toString() : null
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
    if (protocolOp !== Protocol.operations.LDAP_REQ_DELETE) {
      const op = protocolOp.toString(16).padStart(2, '0')
      throw Error(`found wrong protocol operation: 0x${op}`)
    }

    const entry = ber.readString(Protocol.operations.LDAP_REQ_DELETE)
    return { protocolOp, entry }
  }
}

module.exports = DeleteRequest
