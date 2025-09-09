'use strict'

const LdapMessage = require('./ldap-message')
const { resultCodes, operations } = require('@ldapjs/protocol')
const warning = require('./deprecations')

/**
 * Implements the base LDAP response message as defined in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.1.9.
 */
class LdapResult extends LdapMessage {
  #connection = null
  #diagnosticMessage
  #matchedDN
  #referrals = []
  #status

  /**
   * @typedef {LdapMessageOptions} LdapResultOptions
   * @property {number} [status=0] An LDAP status code.
   * @param {string} [matchedDN=''] The DN that matched the request.
   * @param {string[]} [referrals=[]] A set of servers to query for references.
   * @param {string} [diagnosticMessage] A message indicating why a request
   * failed.
   */

  /**
   * @param {LdapResultOptions} options
   */
  constructor (options = {}) {
    super(options)

    this.#status = options.status ?? resultCodes.SUCCESS
    this.#matchedDN = options.matchedDN || ''
    this.#referrals = options.referrals || []
    this.#diagnosticMessage = options.diagnosticMessage || options.errorMessage || ''
    if (options.errorMessage) {
      warning.emit('LDAP_MESSAGE_DEP_004')
    }
  }

  /**
   * The failure message as returned by the server if one is present.
   *
   * @returns {string}
   */
  get diagnosticMessage () {
    return this.#diagnosticMessage
  }

  /**
   * Add a diagnostic message to the instance.
   *
   * @param {string} message
   */
  set diagnosticMessage (message) {
    this.#diagnosticMessage = message
  }

  /**
   * The DN that a request matched.
   *
   * @returns {string}
   */
  get matchedDN () {
    return this.#matchedDN
  }

  /**
   * Define which DN a request matched.
   *
   * @param {string} dn
   */
  set matchedDN (dn) {
    this.#matchedDN = dn
  }

  /**
   * A serialized representation of the message as a plain JavaScript object.
   * Specific message types must implement the `_pojo(obj)` method. The passed
   * in `obj` must be extended with the specific message's unique properties
   * and returned as the result.
   *
   * @returns {object}
   */
  get pojo () {
    let result = {
      status: this.status,
      matchedDN: this.matchedDN,
      diagnosticMessage: this.diagnosticMessage,
      referrals: this.referrals
    }

    if (typeof this._pojo === 'function') {
      result = this._pojo(result)
    }

    return result
  }

  /**
   * The list of servers that should be consulted to get an answer
   * to the query.
   *
   * @returns {string[]}
   */
  get referrals () {
    return this.#referrals.slice(0)
  }

  /**
   * The LDAP response code for the request.
   *
   * @returns {number}
   */
  get status () {
    return this.#status
  }

  /**
   * Set the response code for the request.
   *
   * @param {number} s
   */
  set status (s) {
    this.#status = s
  }

  /**
   * The name of the request type.
   *
   * @type {string}
   */
  get type () {
    return 'LdapResult'
  }

  /**
   * Add a new server to the list of servers that should be
   * consulted for an answer to the query.
   *
   * @param {string} referral
   */
  addReferral (referral) {
    this.#referrals.push(referral)
  }

  /**
   * Internal use only. Subclasses may implement a `_writeResponse`
   * method to add to the sequence after any referrals.
   *
   * @param {import('@ldapjs/asn1').BerWriter} ber
   *
   * @returns {import('@ldapjs/asn1').BerWriter}
   *
   * @private
   */
  _toBer (ber) {
    ber.startSequence(this.protocolOp)
    ber.writeEnumeration(this.status)
    ber.writeString(this.matchedDN)
    ber.writeString(this.diagnosticMessage)

    if (this.referrals.length > 0) {
      ber.startSequence(operations.LDAP_RES_REFERRAL)
      ber.writeStringArray(this.referrals)
      ber.endSequence()
    }

    if (typeof this._writeResponse === 'function') {
      this._writeResponse(ber)
    }

    ber.endSequence()
  }

  /**
   * When invoked on specific message types, e.g. {@link AddResponse}, this
   * method will parse a BER into a plain JavaScript object that is usable as
   * an options object for constructing that specific message object.
   *
   * @param {import('@ldapjs/asn1').BerReader} ber A BER to parse. The reader
   * offset must point to the start of a valid sequence, i.e. the "tag" byte
   * in the TLV tuple, that represents the message to be parsed. For example,
   * in a {@link AddResponse} the starting sequence and message identifier must
   * already be read such that the offset is at the protocol operation sequence
   * byte.
   */
  static parseToPojo (ber) {
    throw Error('Use LdapMessage.parse, or a specific message type\'s parseToPojo, instead.')
  }

  /**
   * Internal use only.
   *
   * Response messages are a little more generic to parse than request messages.
   * However, they still need to recognize the correct protocol operation. So
   * the public {@link parseToPojo} for each response object should invoke this
   * private static method to parse the BER and indicate the correct protocol
   * operation to recognize.
   *
   * @param {object} input
   * @param {number} input.opCode The expected protocol operation to look for.
   * @param {import('@ldapjs/asn1').BerReader} berReader The BER to process. It
   * must start at an offset representing a protocol operation tag.
   * @param {object} [input.pojo] A plain JavaScript object to populate with
   * the parsed keys and values.
   *
   * @returns {object}
   *
   * @private
   */
  static _parseToPojo ({ opCode, berReader, pojo = {} }) {
    const protocolOp = berReader.readSequence()
    if (protocolOp !== opCode) {
      const op = protocolOp.toString(16).padStart(2, '0')
      throw Error(`found wrong protocol operation: 0x${op}`)
    }

    const status = berReader.readEnumeration()
    const matchedDN = berReader.readString()
    const diagnosticMessage = berReader.readString()
    const referrals = []

    if (berReader.peek() === operations.LDAP_RES_REFERRAL) {
      // Advance the offset to the start of the value and
      // put the sequence length into the `reader.length` field.
      berReader.readSequence(operations.LDAP_RES_REFERRAL)
      const end = berReader.length
      while (berReader.offset < end) {
        referrals.push(berReader.readString())
      }
    }

    pojo.status = status
    pojo.matchedDN = matchedDN
    pojo.diagnosticMessage = diagnosticMessage
    pojo.referrals = referrals

    return pojo
  }
}

module.exports = LdapResult
