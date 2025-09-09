'use strict'

const LdapMessage = require('../ldap-message')
const Attribute = require('@ldapjs/attribute')
const Protocol = require('@ldapjs/protocol')
const { DN } = require('@ldapjs/dn')

/**
 * Implements the add request message as described in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.7
 */
class AddRequest extends LdapMessage {
  /**
   * Path to the LDAP object.
   *
   * @type {null | import('@ldapjs/dn').DN}
   */
  #entry

  /**
   * A set of attribute objects.
   *
   * @type {import('@ldapjs/attribute')[]}
   */
  #attributes = []

  /**
   * @typedef {LdapMessageOptions} AddRequestOptions
   * @property {string} [entry=null] The path to the LDAP object.
   * @property {import('@ldapjs/attribute')[]} [attributes=[]] A set of
   * attributes to store at the `entry` path.
   */

  /**
   * @param {AddRequestOptions} [options]
   *
   * @throws When the provided attributes list is invalid.
   */
  constructor (options = {}) {
    options.protocolOp = Protocol.operations.LDAP_REQ_ADD
    super(options)

    this.entry = options.entry || null
    this.attributes = options.attributes || []
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
   * @param {import('@ldapjs/attribute')[]} attrs
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
   * The directory path to the object to add.
   *
   * @type {string}
   */
  get entry () {
    return this.#entry ?? null
  }

  /**
   * Define the entry path to the LDAP object.
   *
   * @param {string | import('@ldapjs/dn').DN} path
   */
  set entry (path) {
    if (path === null) return
    if (typeof path === 'string') {
      this.#entry = DN.fromString(path)
    } else if (Object.prototype.toString.call(path) === '[object LdapDn]') {
      this.#entry = path
    } else {
      throw Error('entry must be a valid DN string or instance of LdapDn')
    }
  }

  /**
   * Alias of {@link entry}.
   *
   * @type {string}
   */
  get _dn () {
    return this.entry
  }

  /**
   * The name of the request type.
   *
   * @type {string}
   */
  get type () {
    return 'AddRequest'
  }

  /**
   * Add a new {@link Attribute} to the list of request attributes.
   *
   * @param {import('@ldapjs/attribute')} attr
   *
   * @throws When the input is not an {@link Attribute} instance.
   */
  addAttribute (attr) {
    if (Object.prototype.toString.call(attr) !== '[object LdapAttribute]') {
      throw Error('attr must be an instance of Attribute')
    }

    this.#attributes.push(attr)
  }

  /**
   * Get the list of attribute names for the attributes in the
   * request.
   *
   * @returns {string[]}
   */
  attributeNames () {
    return this.#attributes.map(attr => attr.type)
  }

  /**
   * Retrieve an attribute by name from the attributes associated with
   * the request.
   *
   * @param {string} attributeName
   *
   * @returns {import('@ldapjs/attribute')|null}
   *
   * @throws When `attributeName` is not a string.
   */
  getAttribute (attributeName) {
    if (typeof attributeName !== 'string') {
      throw Error('attributeName must be a string')
    }

    for (const attr of this.#attributes) {
      if (attr.type === attributeName) {
        return attr
      }
    }

    return null
  }

  /**
   * Find the index of an {@link Attribute} in the request's
   * attribute set.
   *
   * @param {string} attributeName
   *
   * @returns {number} The index of the attribute, or `-1` if not
   * found.
   *
   * @throws When `attributeName` is not a string.
   */
  indexOf (attributeName) {
    if (typeof attributeName !== 'string') {
      throw Error('attributeName must be a string')
    }

    for (let i = 0; i < this.#attributes.length; i += 1) {
      if (this.#attributes[i].type === attributeName) {
        return i
      }
    }

    return -1
  }

  /**
   * Internal use only.
   *
   * @param {import('@ldapjs/asn1').BerWriter} ber
   *
   * @returns {import('@ldapjs/asn1').BerWriter}
   */
  _toBer (ber) {
    ber.startSequence(Protocol.operations.LDAP_REQ_ADD)
    ber.writeString(this.#entry.toString())
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
    obj.entry = this.#entry ? this.#entry.toString() : null
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
    if (protocolOp !== Protocol.operations.LDAP_REQ_ADD) {
      const op = protocolOp.toString(16).padStart(2, '0')
      throw Error(`found wrong protocol operation: 0x${op}`)
    }

    const entry = ber.readString()
    const attributes = []

    // Advance to the first attribute sequence in the set
    // of attribute sequences.
    ber.readSequence()

    const endOfAttributesPos = ber.offset + ber.length
    while (ber.offset < endOfAttributesPos) {
      const attribute = Attribute.fromBer(ber)
      attribute.type = attribute.type.toLowerCase()

      if (attribute.type === 'objectclass') {
        for (let i = 0; i < attribute.values.length; i++) {
          attribute.values[i] = attribute.values[i].toLowerCase()
        }
      }

      attributes.push(attribute)
    }

    return { protocolOp, entry, attributes }
  }
}

module.exports = AddRequest
