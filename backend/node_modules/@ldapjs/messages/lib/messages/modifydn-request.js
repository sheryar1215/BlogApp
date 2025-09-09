'use strict'

const LdapMessage = require('../ldap-message')
const { operations } = require('@ldapjs/protocol')
const { DN } = require('@ldapjs/dn')

/**
 * Implements the modifydn request message as described in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.9.
 */
class ModifyDnRequest extends LdapMessage {
  #entry
  #newRdn
  #deleteOldRdn
  #newSuperior

  /**
   * @typedef {LdapMessageOptions} ModifyDnRequestOptions
   * @property {string|null} [entry=null] The path to the LDAP object.
   * @property {string|null} [newRdn=null] Path to the new object for the
   * entry.
   * @property {boolean} [deleteOldRdn=false] Indicates if attributes
   * should be removed in the new RDN that were in the old RDN but not the
   * new one.
   * @property {string} [newSuperior] Path for the new parent for
   * the RDN.
   */

  /**
   * @param {ModifyDnRequestOptions} [options]
   *
   * @throws When an option is invalid (e.g. `deleteOldRdn` is not a boolean
   * value).
   */
  constructor (options = {}) {
    options.protocolOp = operations.LDAP_REQ_MODRDN
    super(options)

    this.entry = options.entry || ''
    this.newRdn = options.newRdn || ''
    this.deleteOldRdn = options.deleteOldRdn ?? false
    this.newSuperior = options.newSuperior
  }

  /**
   * The directory path to the object to modify.
   *
   * @type {import('@ldapjs/dn').DN}
   */
  get entry () {
    return this.#entry
  }

  /**
   * Define the entry path to the LDAP object.
   *
   * @param {string | import('@ldapjs/dn').dn} value
   */
  set entry (value) {
    if (typeof value === 'string') {
      this.#entry = DN.fromString(value)
    } else if (Object.prototype.toString.call(value) === '[object LdapDn]') {
      this.#entry = value
    } else {
      throw Error('entry must be a valid DN string or instance of LdapDn')
    }
  }

  /**
   * Alias of {@link entry}.
   *
   * @type {import('@ldapjs/dn').DN}
   */
  get _dn () {
    return this.#entry
  }

  /**
   * The new directory path for the object.
   *
   * @returns {import('@ldapjs/dn').DN}
   */
  get newRdn () {
    return this.#newRdn
  }

  /**
   * Define the new entry path to the LDAP object.
   *
   * @param {string | import('@ldapjs/dn').DN} value
   */
  set newRdn (value) {
    if (typeof value === 'string') {
      this.#newRdn = DN.fromString(value)
    } else if (Object.prototype.toString.call(value) === '[object LdapDn]') {
      this.#newRdn = value
    } else {
      throw Error('newRdn must be a valid DN string or instance of LdapDn')
    }
  }

  /**
   * Indicates if the old RDN should be removed or not.
   *
   * @returns {boolean}
   */
  get deleteOldRdn () {
    return this.#deleteOldRdn
  }

  set deleteOldRdn (value) {
    if (typeof value !== 'boolean') {
      throw Error('deleteOldRdn must be a boolean value')
    }
    this.#deleteOldRdn = value
  }

  /**
   * The new superior for the entry, if any is defined.
   *
   * @returns {undefined | import('@ldapjs/dn').DN}
   */
  get newSuperior () {
    return this.#newSuperior
  }

  /**
   * Define the new superior path.
   *
   * @param {undefined | string | import('@ldapjs/dn').DN} value
   */
  set newSuperior (value) {
    if (value) {
      if (typeof value === 'string') {
        this.#newSuperior = DN.fromString(value)
      } else if (Object.prototype.toString.call(value) === '[object LdapDn]') {
        this.#newSuperior = value
      } else {
        throw Error('newSuperior must be a valid DN string or instance of LdapDn')
      }
    } else {
      this.#newSuperior = undefined
    }
  }

  /**
   * The name of the request type.
   *
   * @type {string}
   */
  get type () {
    return 'ModifyDnRequest'
  }

  /**
   * Internal use only.
   *
   * @param {import('@ldapjs/asn1').BerWriter} ber
   *
   * @returns {import('@ldapjs/asn1').BerWriter}
   */
  _toBer (ber) {
    ber.startSequence(operations.LDAP_REQ_MODRDN)

    ber.writeString(this.#entry.toString())
    ber.writeString(this.#newRdn.toString())
    ber.writeBoolean(this.#deleteOldRdn)
    /* istanbul ignore else */
    if (this.#newSuperior !== undefined) {
      ber.writeString(this.#newSuperior.toString(), 0x80)
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
    obj.entry = this.#entry.toString()
    obj.newRdn = this.#newRdn.toString()
    obj.deleteOldRdn = this.#deleteOldRdn
    obj.newSuperior = this.#newSuperior ? this.#newSuperior.toString() : undefined
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
    if (protocolOp !== operations.LDAP_REQ_MODRDN) {
      const op = protocolOp.toString(16).padStart(2, '0')
      throw Error(`found wrong protocol operation: 0x${op}`)
    }

    const entry = ber.readString()
    const newRdn = ber.readString()
    const deleteOldRdn = ber.readBoolean()
    let newSuperior
    /* istanbul ignore else */
    if (ber.peek() === 0x80) {
      newSuperior = ber.readString(0x80)
    }

    return { protocolOp, entry, newRdn, deleteOldRdn, newSuperior }
  }
}

module.exports = ModifyDnRequest
