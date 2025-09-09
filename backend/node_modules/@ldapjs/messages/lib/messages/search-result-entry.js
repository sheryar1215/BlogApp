'use strict'

const LdapMessage = require('../ldap-message')
const Attribute = require('@ldapjs/attribute')
const { operations } = require('@ldapjs/protocol')
const { DN } = require('@ldapjs/dn')

/**
 * Implements the search result entry message as described in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.5.2.
 */
class SearchResultEntry extends LdapMessage {
  /**
   * Path to the LDAP object.
   *
   * @type {import('@ldapjs/dn').DN}
   */
  #objectName

  /**
   * A set of attribute objects.
   *
   * @type {import('@ldapjs/attribute')[]}
   */
  #attributes = []

  /**
   * @typedef {LdapMessageOptions} SearchResultEntryOptions
   * @property {string | import('@ldapjs/dn').DN} [objectName=''] The path to
   * the LDAP object.
   * @property {import('@ldapjs/attribute')[]} attributes A set of attributes
   * to store at the `entry` path.
   */

  /**
   * @param {SearchResultEntryOptions} [options]
   *
   * @throws When the provided attributes list is invalid or the object name
   * is not a valid LdapDn object or DN string.
   */
  constructor (options = {}) {
    options.protocolOp = operations.LDAP_RES_SEARCH_ENTRY
    super(options)

    this.objectName = options.objectName ?? ''
    this.attributes = options.attributes ?? []
  }

  /**
   * Alias of {@link objectName}.
   *
   * @type {string}
   */
  get _dn () {
    return this.#objectName
  }

  /**
   * The name of the request type.
   *
   * @type {string}
   */
  get type () {
    return 'SearchResultEntry'
  }

  /**
   * Get a copy of the attributes associated with the request.
   *
   * @returns {import('@ldapjs/attribute')[]}
   */
  get attributes () {
    return this.#attributes.slice(0)
  }

  /**
   * Set the attributes to be added to the entry. Replaces any existing
   * attributes.
   *
   * @param {object[] | import('@ldapjs/attribute')[]} attrs
   *
   * @throws If the input is not an array, or any element is not an
   * {@link Attribute} or attribute-like object.
   */
  set attributes (attrs) {
    if (Array.isArray(attrs) === false) {
      throw Error('attrs must be an array')
    }
    const newAttrs = []
    for (const attr of attrs) {
      if (Attribute.isAttribute(attr) === false) {
        throw Error('attr must be an Attribute instance or Attribute-like object')
      }
      if (Object.prototype.toString.call(attr) !== '[object LdapAttribute]') {
        newAttrs.push(new Attribute(attr))
        continue
      }
      newAttrs.push(attr)
    }
    this.#attributes = newAttrs
  }

  /**
   * The path to the LDAP entry that matched the search.
   *
   * @returns {import('@ldapjs/dn').DN}
   */
  get objectName () {
    return this.#objectName
  }

  /**
   * Set the path to the LDAP entry that matched the search.
   *
   * @param {string | import('@ldapjs/dn').DN} value
   *
   * @throws When the input is invalid.
   */
  set objectName (value) {
    if (typeof value === 'string') {
      this.#objectName = DN.fromString(value)
    } else if (Object.prototype.toString.call(value) === '[object LdapDn]') {
      this.#objectName = value
    } else {
      throw Error('objectName must be a DN string or an instance of LdapDn')
    }
  }

  /**
   * Internal use only.
   *
   * @param {import('@ldapjs/asn1').BerWriter} ber
   *
   * @returns {import('@ldapjs/asn1').BerWriter}
   */
  _toBer (ber) {
    ber.startSequence(operations.LDAP_RES_SEARCH_ENTRY)
    ber.writeString(this.#objectName.toString())
    ber.startSequence()
    for (const attr of this.#attributes) {
      const attrBer = attr.toBer()
      ber.appendBuffer(attrBer.buffer)
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
    obj.objectName = this.#objectName.toString()
    obj.attributes = []
    for (const attr of this.#attributes) {
      obj.attributes.push(attr.pojo)
    }
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
    if (protocolOp !== operations.LDAP_RES_SEARCH_ENTRY) {
      const op = protocolOp.toString(16).padStart(2, '0')
      throw Error(`found wrong protocol operation: 0x${op}`)
    }

    const objectName = ber.readString()
    const attributes = []

    // Advance to the first attribute sequence in the set
    // of attribute sequences.
    ber.readSequence()

    const endOfAttributesPos = ber.offset + ber.length
    while (ber.offset < endOfAttributesPos) {
      const attribute = Attribute.fromBer(ber)
      attributes.push(attribute)
    }

    return { protocolOp, objectName, attributes }
  }
}

module.exports = SearchResultEntry
