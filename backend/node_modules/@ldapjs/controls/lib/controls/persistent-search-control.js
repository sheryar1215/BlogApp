'use strict'

const { BerReader, BerWriter } = require('@ldapjs/asn1')
const isObject = require('../is-object')
const hasOwn = require('../has-own')
const Control = require('../control')

/**
 * @typedef {object} PersistentSearchControlValue
 * @property {number} changeTypes A bitwise OR of 1 (add), 2 (delete),
 * 4 (modify), and 8 (modifyDN).
 * @property {boolean} changesOnly
 * @property {boolean} returnECs
 */

/**
 * Implements:
 * https://datatracker.ietf.org/doc/html/draft-ietf-ldapext-psearch-03.txt
 *
 * @extends Control
 */
class PersistentSearchControl extends Control {
  static OID = '2.16.840.1.113730.3.4.3'

  /**
   * @typedef {ControlParams} PersistentSearchParams
   * @property {PersistentSearchControlValue | Buffer} [value]
   */

  /**
   * Creates a new persistent search control.
   *
   * @param {PersistentSearchParams} [options]
   */
  constructor (options = {}) {
    options.type = PersistentSearchControl.OID
    super(options)

    this._value = {
      changeTypes: 15,
      changesOnly: true,
      returnECs: true
    }

    if (hasOwn(options, 'value') === false) {
      return
    }

    if (Buffer.isBuffer(options.value)) {
      this.#parse(options.value)
    } else if (isObject(options.value)) {
      this._value = options.value
    } else {
      throw new TypeError('options.value must be a Buffer or Object')
    }
  }

  get value () {
    return this._value
  }

  set value (obj) {
    this._value = Object.assign({}, this._value, obj)
  }

  /**
   * Given a BER buffer that represents a {@link PersistentSearchControlValue},
   * read that buffer into the current instance.
   */
  #parse (buffer) {
    const ber = new BerReader(buffer)

    /* istanbul ignore else */
    if (ber.readSequence()) {
      this._value = {
        changeTypes: ber.readInt(),
        changesOnly: ber.readBoolean(),
        returnECs: ber.readBoolean()
      }
    }
  }

  _toBer (ber) {
    const writer = new BerWriter()
    writer.startSequence()
    writer.writeInt(this._value.changeTypes)
    writer.writeBoolean(this._value.changesOnly)
    writer.writeBoolean(this._value.returnECs)
    writer.endSequence()

    ber.writeBuffer(writer.buffer, 0x04)
    return ber
  }

  _updatePlainObject (obj) {
    obj.controlValue = this.value
    return obj
  }
}
module.exports = PersistentSearchControl
