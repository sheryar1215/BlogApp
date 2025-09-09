'use strict'

const { operations } = require('@ldapjs/protocol')
const Change = require('@ldapjs/change')
const LdapMessage = require('../ldap-message')

/**
 * Implements the MODIFY request message as described in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.6.
 *
 * Changes should be in the order of operation as described in
 * the spec. If sorting is desired, sort the array prior to
 * adding it to the request.
 *
 * @example <caption>Sorting Changes</caption>
 * const {ModifyRequest} = require('@ldapjs/messages')
 * const Change = require('@ldapjs/change')
 * const changes = someArrayOfChanges.sort(Change.sort)
 * const req = new ModifyRequest({
 *   object: 'dn=foo,dc=example,dc=com',
 *   changes
 * })
 */
class ModifyRequest extends LdapMessage {
  #object
  #changes

  /**
   * @typedef {LdapMessageOptions} ModifyRequestOptions
   * @property {string|null} [object] The LDAP object (DN) to modify.
   * @property {import('@ldapjs/change')[]} [changes] The set of changes to
   * apply.
   */

  /**
   * @param {ModifyRequestOptions} [options]
   */
  constructor (options = {}) {
    options.protocolOp = operations.LDAP_REQ_MODIFY
    super(options)

    this.#object = options.object || null
    this.changes = options.changes || []
  }

  /**
   * A copy of the set of changes to be applied to the LDAP object.
   *
   * @returns {import('@ldapjs/change')[]}
   */
  get changes () {
    return this.#changes.slice(0)
  }

  /**
   * Define the set of changes to apply to the LDAP object.
   *
   * @param {import('@ldapjs/change')[]} values
   *
   * @throws When `values` is not an array or contains any elements that
   * are not changes.
   */
  set changes (values) {
    this.#changes = []
    if (Array.isArray(values) === false) {
      throw Error('changes must be an array')
    }
    for (let change of values) {
      if (Change.isChange(change) === false) {
        throw Error('change must be an instance of Change or a Change-like object')
      }
      if (Object.prototype.toString.call(change) !== '[object LdapChange]') {
        change = new Change(change)
      }
      this.#changes.push(change)
    }
  }

  /**
   * The object (DN) to be modified.
   *
   * @returns {string}
   */
  get object () {
    return this.#object
  }

  /**
   * Define the object (DN) to be modified.
   *
   * @param {string} value
   */
  set object (value) {
    this.#object = value
  }

  /**
   * The name of the request type.
   *
   * @type {string}
   */
  get type () {
    return 'ModifyRequest'
  }

  get _dn () {
    return this.#object
  }

  /**
   * Internal use only.
   *
   * @param {import('@ldapjs/asn1').BerWriter} ber
   *
   * @returns {import('@ldapjs/asn1').BerWriter}
   */
  _toBer (ber) {
    ber.startSequence(operations.LDAP_REQ_MODIFY)

    ber.writeString(this.#object.toString())
    ber.startSequence()
    for (const change of this.#changes) {
      ber.appendBuffer(change.toBer().buffer)
    }
    ber.endSequence()

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
    obj.object = this.#object
    obj.changes = this.#changes.map(c => c.pojo)
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
    if (protocolOp !== operations.LDAP_REQ_MODIFY) {
      const op = protocolOp.toString(16).padStart(2, '0')
      throw Error(`found wrong protocol operation: 0x${op}`)
    }

    const object = ber.readString()
    const changes = []

    ber.readSequence()
    const end = ber.offset + ber.length
    while (ber.offset < end) {
      const change = Change.fromBer(ber)
      changes.push(change.pojo)
    }

    return { protocolOp, object, changes }
  }
}

module.exports = ModifyRequest
