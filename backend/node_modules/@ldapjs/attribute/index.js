'use strict'

const { core: { LBER_SET } } = require('@ldapjs/protocol')
const {
  BerTypes,
  BerReader,
  BerWriter
} = require('@ldapjs/asn1')
const warning = require('./lib/deprecations')

/**
 * Represents an LDAP attribute and its associated values as defined by
 * https://www.rfc-editor.org/rfc/rfc4512#section-2.5.
 */
class Attribute {
  #buffers = []
  #type

  /**
   * @param {object} options
   * @param {string} [options.type=''] The name of the attribute, e.g. "cn" for
   * the common name attribute. For binary attributes, include the `;binary`
   * option, e.g. `foo;binary`.
   * @param {string|string[]} [options.values] Either a single value for the
   * attribute, or a set of values for the attribute.
   */
  constructor (options = {}) {
    if (options.type && typeof (options.type) !== 'string') {
      throw TypeError('options.type must be a string')
    }
    this.type = options.type || ''

    const values = options.values || options.vals || []
    if (options.vals) {
      warning.emit('LDAP_ATTRIBUTE_DEP_001')
    }
    this.values = values
  }

  get [Symbol.toStringTag] () {
    return 'LdapAttribute'
  }

  /**
   * A copy of the buffers that represent the values for the attribute.
   *
   * @returns {Buffer[]}
   */
  get buffers () {
    return this.#buffers.slice(0)
  }

  /**
   * Serializes the attribute to a plain JavaScript object representation.
   *
   * @returns {object}
   */
  get pojo () {
    return {
      type: this.type,
      values: this.values
    }
  }

  /**
   * The attribute name as provided during construction.
   *
   * @returns {string}
   */
  get type () {
    return this.#type
  }

  /**
   * Set the attribute name.
   *
   * @param {string} name
   */
  set type (name) {
    this.#type = name
  }

  /**
   * The set of attribute values as strings.
   *
   * @returns {string[]}
   */
  get values () {
    const encoding = _bufferEncoding(this.#type)
    return this.#buffers.map(function (v) {
      return v.toString(encoding)
    })
  }

  /**
   * Set the attribute's associated values. This will replace any values set
   * at construction time.
   *
   * @param {string|string[]} vals
   */
  set values (vals) {
    if (Array.isArray(vals) === false) {
      return this.addValue(vals)
    }
    for (const value of vals) {
      this.addValue(value)
    }
  }

  /**
   * Use {@link values} instead.
   *
   * @deprecated
   * @returns {string[]}
   */
  get vals () {
    warning.emit('LDAP_ATTRIBUTE_DEP_003')
    return this.values
  }

  /**
   * Use {@link values} instead.
   *
   * @deprecated
   * @param {string|string[]} values
   */
  set vals (values) {
    warning.emit('LDAP_ATTRIBUTE_DEP_003')
    this.values = values
  }

  /**
   * Append a new value, or set of values, to the current set of values
   * associated with the attributes.
   *
   * @param {string|string[]} value
   */
  addValue (value) {
    if (Buffer.isBuffer(value)) {
      this.#buffers.push(value)
    } else {
      this.#buffers.push(
        Buffer.from(value + '', _bufferEncoding(this.#type))
      )
    }
  }

  /**
   * Replaces instance properties with those found in a given BER.
   *
   * @param {import('@ldapjs/asn1').BerReader} ber
   *
   * @deprecated Use {@link fromBer} instead.
   */
  parse (ber) {
    const attr = Attribute.fromBer(ber)
    this.#type = attr.type
    this.values = attr.values
  }

  /**
   * Convert the {@link Attribute} instance to a {@link BerReader} capable of
   * being used in an LDAP message.
   *
   * @returns {BerReader}
   */
  toBer () {
    const ber = new BerWriter()

    ber.startSequence()
    ber.writeString(this.type)
    ber.startSequence(LBER_SET)

    if (this.#buffers.length > 0) {
      for (const buffer of this.#buffers) {
        ber.writeByte(BerTypes.OctetString)
        ber.writeLength(buffer.length)
        ber.appendBuffer(buffer)
      }
    } else {
      ber.writeStringArray([])
    }
    ber.endSequence()
    ber.endSequence()

    return new BerReader(ber.buffer)
  }

  toJSON () {
    return this.pojo
  }

  /**
   * Given two {@link Attribute} instances, determine if they are equal or
   * different.
   *
   * @param {Attribute} attr1 The first object to compare.
   * @param {Attribute} attr2 The second object to compare.
   *
   * @returns {number} `0` if the attributes are equal in value, `-1` if
   * `attr1` should come before `attr2` when sorted, and `1` if `attr2` should
   * come before `attr1` when sorted.
   *
   * @throws When either input object is not an {@link Attribute}.
   */
  static compare (attr1, attr2) {
    if (Attribute.isAttribute(attr1) === false || Attribute.isAttribute(attr2) === false) {
      throw TypeError('can only compare Attribute instances')
    }

    if (attr1.type < attr2.type) return -1
    if (attr1.type > attr2.type) return 1

    const aValues = attr1.values
    const bValues = attr2.values
    if (aValues.length < bValues.length) return -1
    if (aValues.length > bValues.length) return 1

    for (let i = 0; i < aValues.length; i++) {
      if (aValues[i] < bValues[i]) return -1
      if (aValues[i] > bValues[i]) return 1
    }

    return 0
  }

  /**
   * Read a BER representation of an attribute, and its values, and
   * create a new {@link Attribute} instance. The BER must start
   * at the beginning of a sequence.
   *
   * @param {import('@ldapjs/asn1').BerReader} ber
   *
   * @returns {Attribute}
   */
  static fromBer (ber) {
    ber.readSequence()

    const type = ber.readString()
    const values = []

    // If the next byte represents a BER "SET" sequence...
    if (ber.peek() === LBER_SET) {
      // .. read that sequence ...
      /* istanbul ignore else */
      if (ber.readSequence(LBER_SET)) {
        const end = ber.offset + ber.length
        // ... and read all values in that set.
        while (ber.offset < end) {
          values.push(
            ber.readString(BerTypes.OctetString, true)
          )
        }
      }
    }

    const result = new Attribute({
      type,
      values
    })
    return result
  }

  /**
   * Given an object of attribute types mapping to attribute values, construct
   * a set of Attributes.
   *
   * @param {object} obj Each key is an attribute type, and each value is an
   * attribute value or set of values.
   *
   * @returns {Attribute[]}
   *
   * @throws If an attribute cannot be constructed correctly.
   */
  static fromObject (obj) {
    const attributes = []
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value) === true) {
        attributes.push(new Attribute({
          type: key,
          values: value
        }))
      } else {
        attributes.push(new Attribute({
          type: key,
          values: [value]
        }))
      }
    }
    return attributes
  }

  /**
   * Determine if an object represents an {@link Attribute}.
   *
   * @param {object} attr The object to check. It can be an instance of
   * {@link Attribute} or a plain JavaScript object that looks like an
   * {@link Attribute} and can be passed to the constructor to create one.
   *
   * @returns {boolean}
   */
  static isAttribute (attr) {
    if (typeof attr !== 'object') {
      return false
    }

    if (Object.prototype.toString.call(attr) === '[object LdapAttribute]') {
      return true
    }

    const typeOk = typeof attr.type === 'string'
    let valuesOk = Array.isArray(attr.values)
    if (valuesOk === true) {
      for (const val of attr.values) {
        if (typeof val !== 'string' && Buffer.isBuffer(val) === false) {
          valuesOk = false
          break
        }
      }
    }
    if (typeOk === true && valuesOk === true) {
      return true
    }

    return false
  }
}

module.exports = Attribute

/**
 * Determine the encoding for values based upon whether the binary
 * option is set on the attribute.
 *
 * @param {string} type
 *
 * @returns {string} Either "utf8" for a plain string value, or "base64" for
 * a binary attribute.
 *
 * @private
 */
function _bufferEncoding (type) {
  return /;binary$/.test(type) ? 'base64' : 'utf8'
}
