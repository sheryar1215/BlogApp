'use strict'

const LdapMessage = require('../ldap-message')
const Protocol = require('@ldapjs/protocol')
const { BerTypes } = require('@ldapjs/asn1')

/**
 * Implements the bind request message as described in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.2.
 *
 * The bind request is further defined by:
 * https://www.rfc-editor.org/rfc/rfc4513#section-5.
 */
class BindRequest extends LdapMessage {
  static SIMPLE_BIND = 'simple'
  static SASL_BIND = 'sasl'

  #version = 0x03
  #name
  #authentication = BindRequest.SIMPLE_BIND
  #credentials = ''

  /**
   * @typedef {LdapMessageOptions} BindRequestOptions
   * @property {number} [version=3] Version of the protocol being used.
   * @property {string} [name=null] The "username" (dn) to connect with.
   * @property {string} [authentication='simple'] The authentication
   * mechanism to use. Currently, only `simple` is supported.
   * @property {string} [credentials=''] The password to use.
   */

  /**
   * @param {BindRequestOptions} [options]
   */
  constructor (options = {}) {
    options.protocolOp = Protocol.operations.LDAP_REQ_BIND
    super(options)

    const {
      version = 0x03,
      name = null,
      authentication = BindRequest.SIMPLE_BIND,
      credentials = ''
    } = options
    this.#version = version
    this.#name = name
    this.#authentication = authentication
    this.#credentials = credentials
  }

  /**
   * The authentication credentials for the request.
   *
   * @returns {string}
   */
  get credentials () {
    return this.#credentials
  }

  /**
   * The DN, or "username", that is to be used in the bind request.
   *
   * @type {string}
   */
  get name () {
    return this.#name
  }

  /**
   * The name of the request type.
   *
   * @type {string}
   */
  get type () {
    return 'BindRequest'
  }

  /**
   * The version number that the bind request conforms to.
   *
   * @type {number}
   */
  get version () {
    return this.#version
  }

  /**
   * Use {@link name} instead.
   *
   * @type {string}
   */
  get _dn () {
    return this.#name
  }

  /**
   * Internal use only.
   *
   * @param {import('@ldapjs/asn1').BerWriter} ber
   *
   * @returns {import('@ldapjs/asn1').BerWriter}
   */
  _toBer (ber) {
    ber.startSequence(Protocol.operations.LDAP_REQ_BIND)
    ber.writeInt(this.#version)
    ber.writeString(this.#name || '')
    // TODO add support for SASL et al
    ber.writeString(this.#credentials || '', BerTypes.Context)
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
    obj.version = this.#version
    obj.name = this.#name
    obj.authenticationType = this.#authentication
    obj.credentials = this.#credentials
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
    if (protocolOp !== Protocol.operations.LDAP_REQ_BIND) {
      const op = protocolOp.toString(16).padStart(2, '0')
      throw Error(`found wrong protocol operation: 0x${op}`)
    }

    const version = ber.readInt()
    const name = ber.readString()

    const tag = ber.peek()

    // TODO: add support for SASL et al
    if (tag !== BerTypes.Context) {
      // Currently only support 0x80. To support SASL, must support 0x83.
      const authType = tag.toString(16).padStart(2, '0')
      throw Error(`authentication 0x${authType} not supported`)
    }

    const authentication = BindRequest.SIMPLE_BIND
    const credentials = ber.readString(BerTypes.Context)

    return {
      protocolOp,
      version,
      name,
      authentication,
      credentials
    }
  }
}

module.exports = BindRequest
