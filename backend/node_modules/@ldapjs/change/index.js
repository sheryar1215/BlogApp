'use strict'

const { BerReader, BerWriter } = require('@ldapjs/asn1')
const Attribute = require('@ldapjs/attribute')

/**
 * Implements an LDAP CHANGE sequence as described in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.6.
 */
class Change {
  #operation
  #modification

  /**
   * @typedef {object} ChangeParameters
   * @property {string | number} operation One of `add` (0), `delete` (1), or
   * `replace` (2). Default: `add`.
   * @property {object | import('@ldapjs/attribute')} modification An attribute
   * instance or an object that is shaped like an attribute.
   */

  /**
   * @param {ChangeParameters} input
   *
   * @throws When the `modification` parameter is invalid.
   */
  constructor ({ operation = 'add', modification }) {
    this.operation = operation
    this.modification = modification
  }

  get [Symbol.toStringTag] () {
    return 'LdapChange'
  }

  /**
   * The attribute that will be modified by the {@link Change}.
   *
   * @returns {import('@ldapjs/attribute')}
   */
  get modification () {
    return this.#modification
  }

  /**
   * Define the attribute to be modified by the {@link Change}.
   *
   * @param {object|import('@ldapjs/attribute')} mod
   *
   * @throws When `mod` is not an instance of `Attribute` or is not an
   * `Attribute` shaped object.
   */
  set modification (mod) {
    if (Attribute.isAttribute(mod) === false) {
      throw Error('modification must be an Attribute')
    }
    if (Object.prototype.toString.call(mod) !== '[object LdapAttribute]') {
      mod = new Attribute(mod)
    }
    this.#modification = mod
  }

  /**
   * Get a plain JavaScript object representation of the change.
   *
   * @returns {object}
   */
  get pojo () {
    return {
      operation: this.operation,
      modification: this.modification.pojo
    }
  }

  /**
   * The string name of the operation that will be performed.
   *
   * @returns {string} One of `add`, `delete`, or `replace`.
   */
  get operation () {
    switch (this.#operation) {
      case 0x00: {
        return 'add'
      }

      case 0x01: {
        return 'delete'
      }

      case 0x02: {
        return 'replace'
      }
    }
  }

  /**
   * Define the operation that the {@link Change} represents.
   *
   * @param {string|number} op May be one of `add` (0), `delete` (1),
   * or `replace` (2).
   *
   * @throws When the `op` is not recognized.
   */
  set operation (op) {
    if (typeof op === 'string') {
      op = op.toLowerCase()
    }

    switch (op) {
      case 0x00:
      case 'add': {
        this.#operation = 0x00
        break
      }

      case 0x01:
      case 'delete': {
        this.#operation = 0x01
        break
      }

      case 0x02:
      case 'replace': {
        this.#operation = 0x02
        break
      }

      default: {
        const type = Number.isInteger(op)
          ? '0x' + Number(op).toString(16)
          : op
        throw Error(`invalid operation type: ${type}`)
      }
    }
  }

  /**
   * Serialize the instance to a BER.
   *
   * @returns {import('@ldapjs/asn1').BerReader}
   */
  toBer () {
    const writer = new BerWriter()
    writer.startSequence()
    writer.writeEnumeration(this.#operation)

    const attrBer = this.#modification.toBer()
    writer.appendBuffer(attrBer.buffer)
    writer.endSequence()

    return new BerReader(writer.buffer)
  }

  /**
   * See {@link pojo}.
   *
   * @returns {object}
   */
  toJSON () {
    return this.pojo
  }

  /**
   * Applies a {@link Change} to a `target` object.
   *
   * @example
   * const change = new Change({
   *   operation: 'add',
   *   modification: {
   *     type: 'cn',
   *     values: ['new']
   *   }
   * })
   * const target = {
   *   cn: ['old']
   * }
   * Change.apply(change, target)
   * // target = { cn: ['old', 'new'] }
   *
   * @param {Change} change The change to apply.
   * @param {object} target The object to modify. This object will be mutated
   * by the function. It should have properties that match the `modification`
   * of the change.
   * @param {boolean} scalar When `true`, will convert single-item arrays
   * to scalar values. Default: `false`.
   *
   * @returns {object} The mutated `target`.
   *
   * @throws When the `change` is not an instance of {@link Change}.
   */
  static apply (change, target, scalar = false) {
    if (Change.isChange(change) === false) {
      throw Error('change must be an instance of Change')
    }

    const type = change.modification.type
    const values = change.modification.values

    let data = target[type]
    if (data === undefined) {
      data = []
    } else if (Array.isArray(data) === false) {
      data = [data]
    }

    switch (change.operation) {
      case 'add': {
        // Add only new unique entries.
        const newValues = values.filter(v => data.indexOf(v) === -1)
        Array.prototype.push.apply(data, newValues)
        break
      }

      case 'delete': {
        data = data.filter(v => values.indexOf(v) === -1)
        if (data.length === 0) {
          // An empty list indicates the attribute should be removed
          // completely.
          delete target[type]
          return target
        }
        break
      }

      case 'replace': {
        if (values.length === 0) {
          // A new value set that is empty is a delete.
          delete target[type]
          return target
        }
        data = values
        break
      }
    }

    if (scalar === true && data.length === 1) {
      // Replace array value with a scalar value if the modified set is
      // single valued and the operation calls for a scalar.
      target[type] = data[0]
    } else {
      target[type] = data
    }

    return target
  }

  /**
   * Determines if an object is an instance of {@link Change}, or at least
   * resembles the shape of a {@link Change} object. A plain object will match
   * if it has a `modification` property that matches an `Attribute`,
   * an `operation` property that is a string or number, and has a `toBer`
   * method. An object that resembles a {@link Change} does not guarantee
   * compatibility. A `toString` check is much more accurate.
   *
   * @param {Change|object} change
   *
   * @returns {boolean}
   */
  static isChange (change) {
    if (Object.prototype.toString.call(change) === '[object LdapChange]') {
      return true
    }
    if (Object.prototype.toString.call(change) !== '[object Object]') {
      return false
    }
    if (
      Attribute.isAttribute(change.modification) === true &&
      (typeof change.operation === 'string' || typeof change.operation === 'number')
    ) {
      return true
    }
    return false
  }

  /**
   * Compares two {@link Change} instance to determine the priority of the
   * changes relative to each other.
   *
   * @param {Change} change1
   * @param {Change} change2
   *
   * @returns {number} -1 for lower priority, 1 for higher priority, and 0
   * for equal priority in relation to `change1`, e.g. -1 would mean `change`
   * has lower priority than `change2`.
   *
   * @throws When neither parameter resembles a {@link Change} object.
   */
  static compare (change1, change2) {
    if (Change.isChange(change1) === false || Change.isChange(change2) === false) {
      throw Error('can only compare Change instances')
    }
    if (change1.operation < change2.operation) {
      return -1
    }
    if (change1.operation > change2.operation) {
      return 1
    }
    return Attribute.compare(change1.modification, change2.modification)
  }

  /**
   * Parse a BER into a new {@link Change} object.
   *
   * @param {import('@ldapjs/asn1').BerReader} ber The BER to process. It must
   * be at an offset that starts a new change sequence. The reader will be
   * advanced to the end of the change sequence by this method.
   *
   * @returns {Change}
   *
   * @throws When there is an error processing the BER.
   */
  static fromBer (ber) {
    ber.readSequence()
    const operation = ber.readEnumeration()
    const modification = Attribute.fromBer(ber)
    return new Change({ operation, modification })
  }
}

module.exports = Change
