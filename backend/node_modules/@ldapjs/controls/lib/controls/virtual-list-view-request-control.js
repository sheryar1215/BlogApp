'use strict'

const { BerReader, BerWriter } = require('@ldapjs/asn1')
const isObject = require('../is-object')
const hasOwn = require('../has-own')
const Control = require('../control')

/**
 * @typedef {object} VirtualListViewControlValue
 * @property {number} beforeCount
 * @property {number} afterCount
 *
 */

/**
 * Implements:
 * https://datatracker.ietf.org/doc/html/draft-ietf-ldapext-ldapv3-vlv-07#section-6.1
 *
 * @extends Control
 */
class VirtualListViewRequestControl extends Control {
  static OID = '2.16.840.1.113730.3.4.9'

  /**
   * @typedef {ControlParams} VirtualListViewRequestParams
   * @property {Buffer|VirtualListViewControlValue} [value]
   */

  /**
   * @param {VirtualListViewRequestParams} [options]
   */
  constructor (options = {}) {
    options.type = VirtualListViewRequestControl.OID
    super(options)

    if (hasOwn(options, 'value') === false) {
      // return
      throw Error('control is not enabled')
    }

    if (Buffer.isBuffer(options.value)) {
      this.#parse(options.value)
    } else if (isObject(options.value)) {
      if (Object.prototype.hasOwnProperty.call(options.value, 'beforeCount') === false) {
        throw new Error('Missing required key: beforeCount')
      }
      if (Object.prototype.hasOwnProperty.call(options.value, 'afterCount') === false) {
        throw new Error('Missing required key: afterCount')
      }
      this._value = options.value
    } else {
      throw new TypeError('options.value must be a Buffer or Object')
    }

    throw Error('control is not enabled')
  }

  get value () {
    return this._value
  }

  set value (items) {
    if (Buffer.isBuffer(items) === true) return
    if (Array.isArray(items) === false) {
      this._value = [items]
      return
    }
    this._value = items
  }

  #parse (buffer) {
    const ber = new BerReader(buffer)
    if (ber.readSequence()) {
      this._value = {}
      this._value.beforeCount = ber.readInt()
      this._value.afterCount = ber.readInt()
      if (ber.peek() === 0xa0) {
        if (ber.readSequence(0xa0)) {
          this._value.targetOffset = ber.readInt()
          this._value.contentCount = ber.readInt()
        }
      }
      if (ber.peek() === 0x81) {
        this._value.greaterThanOrEqual = ber.readString(0x81)
      }
      return true
    }
    return false
  }

  _pojo (obj) {
    obj.value = this.value
    return obj
  }

  _toBer (ber) {
    if (!this._value || this._value.length === 0) {
      return
    }
    const writer = new BerWriter()
    writer.startSequence(0x30)
    writer.writeInt(this._value.beforeCount)
    writer.writeInt(this._value.afterCount)
    if (this._value.targetOffset !== undefined) {
      writer.startSequence(0xa0)
      writer.writeInt(this._value.targetOffset)
      writer.writeInt(this._value.contentCount)
      writer.endSequence()
    } else if (this._value.greaterThanOrEqual !== undefined) {
      writer.writeString(this._value.greaterThanOrEqual, 0x81)
    }
    writer.endSequence()
    ber.writeBuffer(writer.buffer, 0x04)
  }
}
module.exports = VirtualListViewRequestControl
