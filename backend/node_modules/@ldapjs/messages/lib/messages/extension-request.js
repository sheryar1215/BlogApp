'use strict'

const LdapMessage = require('../ldap-message')
const { operations } = require('@ldapjs/protocol')
const RECOGNIZED_OIDS = require('./extension-utils/recognized-oids')

/**
 * Implements the extension request message as described in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.12.
 *
 * There is a set of supported extension request OIDs supported. Any
 * unrecognized OID will be treated a simple string pair, i.e. both
 * `requestName` and `requestValue` will be assumed to be simple strings.
 */
class ExtensionRequest extends LdapMessage {
  #requestName
  #requestValue

  /**
   * @typedef {LdapMessageOptions} ExtensionRequestOptions
   * @property {string} [requestName=''] The name of the extension, i.e.
   * OID for the request.
   * @property {string|object} [requestValue] The value for the request.
   * If `undefined`, no value will be sent. If the request requires a simple
   * string value, provide such a string. For complex valued requests, e.g.
   * for a password modify request, it should be a plain object with the
   * appropriate properties. See the implementation of {@link parseToPojo}
   * for the set of supported objects.
   */

  /**
   * @param {ExtensionRequestOptions} [options]
   */
  constructor (options = {}) {
    options.protocolOp = operations.LDAP_REQ_EXTENSION
    super(options)

    this.requestName = options.requestName || ''
    this.requestValue = options.requestValue
  }

  /**
   * Alias of {@link requestName}.
   *
   * @type {string}
   */
  get _dn () {
    return this.#requestName
  }

  /**
   * The name (OID) of the request.
   *
   * @returns {string}
   */
  get requestName () {
    return this.#requestName
  }

  /**
   * Set the name for the request. Should be an OID that
   * matches a specification.
   *
   * @param {string} value
   */
  set requestName (value) {
    this.#requestName = value
  }

  /**
   * The name of the request type.
   *
   * @type {string}
   */
  get type () {
    return 'ExtensionRequest'
  }

  /**
   * The value, if any, for the request.
   *
   * @returns {undefined|string|object} value
   */
  get requestValue () {
    return this.#requestValue
  }

  /**
   * Set the value for the request. The value should conform
   * to the specification identified by the {@link requestName}.
   * See the implemenation of {@link parseToPojo} for valid
   * value shapes.
   *
   * @param {undefined|string|object} value
   */
  set requestValue (val) {
    this.#requestValue = val
  }

  /**
   * Internal use only.
   *
   * @param {import('@ldapjs/asn1').BerWriter} ber
   *
   * @returns {import('@ldapjs/asn1').BerWriter}
   */
  _toBer (ber) {
    ber.startSequence(operations.LDAP_REQ_EXTENSION)
    ber.writeString(this.requestName, 0x80)

    if (this.requestValue) {
      switch (this.requestName) {
        case RECOGNIZED_OIDS.get('CANCEL_REQUEST'): {
          encodeCancelRequest({ ber, requestValue: this.requestValue })
          break
        }

        case RECOGNIZED_OIDS.get('PASSWORD_MODIFY'): {
          encodePasswordModify({
            ber,
            requestValue: this.requestValue
          })
          break
        }

        default: {
          // We assume the value is a plain string since
          // we do not recognize the request OID, or we know
          // that the OID uses a plain string value.
          ber.writeString(this.requestValue, 0x81)
        }
      }
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
    obj.requestName = this.requestName
    obj.requestValue = this.requestValue
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
    if (protocolOp !== operations.LDAP_REQ_EXTENSION) {
      const op = protocolOp.toString(16).padStart(2, '0')
      throw Error(`found wrong protocol operation: 0x${op}`)
    }

    // While the requestName is an OID, it is not an
    // _encoded_ OID. It is a plain string. So we do
    // not use `.readOID` here.
    const requestName = ber.readString(0x80)
    if (ber.peek() !== 0x81) {
      // There is not a request value present, so we just
      // return an empty value representation.
      return { protocolOp, requestName }
    }

    let requestValue
    switch (requestName) {
      case RECOGNIZED_OIDS.get('CANCEL_REQUEST'): {
        requestValue = readCancelRequest(ber)
        break
      }

      case RECOGNIZED_OIDS.get('PASSWORD_MODIFY'): {
        requestValue = readPasswordModify(ber)
        break
      }

      default: {
        // We will assume it is a plain string value
        // since we do not recognize the OID, or we know
        // that the OID uses a plain string value.
        requestValue = ber.readString(0x81)
        break
      }
    }

    return { protocolOp, requestName, requestValue }
  }

  /**
   * A list of EXTENDED operation OIDs that this module
   * recognizes. Key names are named according to the common name
   * of the extension. Key values are the OID associated with that
   * extension. For example, key `PASSWORD_MODIFY` corresponds to
   * OID `1.3.6.1.4.1.4203.1.11.1`.
   *
   * @returns {Map<string, string>}
   */
  static recognizedOIDs () {
    return RECOGNIZED_OIDS
  }
}

module.exports = ExtensionRequest

/**
 * @param {object} input
 * @param {@import('@ldapjs/asn1').BerWriter} input.ber
 * @param {object} requestValue
 */
function encodeCancelRequest ({ ber, requestValue }) {
  ber.startSequence(0x81)
  ber.startSequence()
  ber.writeInt(requestValue)
  ber.endSequence()
  ber.endSequence()
}

/**
 * @param {@import('@ldapjs/asn1').BerReader} ber
 * @returns {number}
 */
function readCancelRequest (ber) {
  ber.readSequence(0x81)
  ber.readSequence()
  return ber.readInt()
}

/**
 * @param {object} input
 * @param {@import('@ldapjs/asn1').BerWriter} input.ber
 * @param {object} requestValue
 */
function encodePasswordModify ({ ber, requestValue }) {
  // start the value sequence
  ber.startSequence(0x81)
  // start the generic packed sequence
  ber.startSequence()
  if (requestValue.userIdentity) {
    ber.writeString(requestValue.userIdentity, 0x80)
  }
  if (requestValue.oldPassword) {
    ber.writeString(requestValue.oldPassword, 0x81)
  }
  if (requestValue.newPassword) {
    ber.writeString(requestValue.newPassword, 0x82)
  }
  ber.endSequence()
  ber.endSequence()
}

/**
 * @param {@import('@ldapjs/asn1').BerReader} ber
 * @returns {object}
 */
function readPasswordModify (ber) {
  // advance to the embedded sequence
  ber.readSequence(0x81)
  // advance to the value of the embedded sequence
  ber.readSequence()
  let userIdentity
  if (ber.peek() === 0x80) {
    userIdentity = ber.readString(0x80)
  }
  let oldPassword
  if (ber.peek() === 0x81) {
    oldPassword = ber.readString(0x81)
  }
  let newPassword
  if (ber.peek() === 0x82) {
    newPassword = ber.readString(0x82)
  }
  return { userIdentity, oldPassword, newPassword }
}
