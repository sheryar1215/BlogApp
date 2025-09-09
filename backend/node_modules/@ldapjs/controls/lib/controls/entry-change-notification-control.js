'use strict'

const { BerReader, BerWriter } = require('@ldapjs/asn1')
const isObject = require('../is-object')
const hasOwn = require('../has-own')
const Control = require('../control')

/**
 * @typedef {object} EntryChangeNotificationControlValue
 * @property {number} changeType One of 1 (add), 2 (delete), 4 (modify),
 * or 8 (modifyDN).
 * @property {string} previousDN Only set when operation is a modifyDN op.
 * @property {number} changeNumber
 */

/**
 * Implements:
 * https://datatracker.ietf.org/doc/html/draft-ietf-ldapext-psearch-03.txt#section-5
 *
 * @extends Control
 */
class EntryChangeNotificationControl extends Control {
  static OID = '2.16.840.1.113730.3.4.7'

  /**
   * @typedef {ControlParams} EntryChangeNotificationParams
   * @property {EntryChangeNotificationControlValue | Buffer} [value]
   */

  /**
   * Creates a new persistent search control.
   *
   * @param {EntryChangeNotificationParams} [options]
   */
  constructor (options = {}) {
    options.type = EntryChangeNotificationControl.OID
    super(options)

    this._value = {
      changeType: 4
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
   * Given a BER buffer that represents a
   * {@link EntryChangeNotificationControlValue}, read that buffer into the
   * current instance.
   */
  #parse (buffer) {
    const ber = new BerReader(buffer)
    /* istanbul ignore else */
    if (ber.readSequence()) {
      this._value = {
        changeType: ber.readInt()
      }

      /* istanbul ignore else */
      if (this._value.changeType === 8) {
        // If the operation was moddn, then parse the optional previousDN attr.
        this._value.previousDN = ber.readString()
      }

      this._value.changeNumber = ber.readInt()
    }
  }

  _toBer (ber) {
    const writer = new BerWriter()
    writer.startSequence()
    writer.writeInt(this._value.changeType)
    if (this._value.previousDN) { writer.writeString(this._value.previousDN) }

    if (Object.prototype.hasOwnProperty.call(this._value, 'changeNumber')) {
      writer.writeInt(parseInt(this._value.changeNumber, 10))
    }
    writer.endSequence()

    ber.writeBuffer(writer.buffer, 0x04)
    return ber
  }

  _updatePlainObject (obj) {
    obj.controlValue = this.value
    return obj
  }
}
module.exports = EntryChangeNotificationControl
