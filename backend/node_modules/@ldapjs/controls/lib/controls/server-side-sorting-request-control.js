'use strict'

const { Ber, BerReader, BerWriter } = require('@ldapjs/asn1')
const isObject = require('../is-object')
const hasOwn = require('../has-own')
const Control = require('../control')

/**
 * @typedef {object} SortKeyItem
 * @property {string} attributeType
 * @property {string} orderingRule
 * @property {boolean} reverseOrder
 */

/**
 * @typedef {SortKeyItem[]} ServerSideSortingRequestControlValue
 */

/**
 * Implements:
 * https://datatracker.ietf.org/doc/html/draft-ietf-ldapext-sorting#section-3.1
 *
 * @extends Control
 */
class ServerSideSortingRequestControl extends Control {
  static OID = '1.2.840.113556.1.4.473'

  /**
   * @typedef {ControlParams} ServerSideSortingRequestParams
   * @property {ServerSideSortingRequestControlValue | SortKeyItem | Buffer} [value]
   */

  /**
   * Creates a new server side sorting request control.
   *
   * @param {ServerSideSortingRequestParams} [options]
   */
  constructor (options = { value: [] }) {
    options.type = ServerSideSortingRequestControl.OID
    super(options)

    const inputValue = options.value ?? []
    if (Buffer.isBuffer(inputValue)) {
      this.#parse(inputValue)
    } else if (Array.isArray(inputValue)) {
      for (const obj of inputValue) {
        if (isObject(obj) === false) {
          throw new Error('Control value must be an object')
        }
        if (hasOwn(obj, 'attributeType') === false) {
          throw new Error('Missing required key: attributeType')
        }
      }
      this.value = inputValue
    } else if (isObject(inputValue)) {
      if (hasOwn(inputValue, 'attributeType') === false) {
        throw new Error('Missing required key: attributeType')
      }
      this.value = [inputValue]
    } else {
      throw new TypeError('options.value must be a Buffer, Array or Object')
    }
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
    let item
    /* istanbul ignore else */
    if (ber.readSequence(0x30)) {
      this.value = []

      while (ber.readSequence(0x30)) {
        item = {}
        item.attributeType = ber.readString(Ber.OctetString)
        /* istanbul ignore else */
        if (ber.peek() === 0x80) {
          item.orderingRule = ber.readString(0x80)
        }
        /* istanbul ignore else */
        if (ber.peek() === 0x81) {
          item.reverseOrder = (ber._readTag(0x81) !== 0)
        }
        this.value.push(item)
      }
    }
  }

  _pojo (obj) {
    obj.value = this.value
    return obj
  }

  _toBer (ber) {
    if (this.value.length === 0) { return }

    const writer = new BerWriter()
    writer.startSequence(0x30)
    for (let i = 0; i < this.value.length; i++) {
      const item = this.value[i]
      writer.startSequence(0x30)
      /* istanbul ignore else */
      if (hasOwn(item, 'attributeType')) {
        writer.writeString(item.attributeType, Ber.OctetString)
      }
      /* istanbul ignore else */
      if (hasOwn(item, 'orderingRule')) {
        writer.writeString(item.orderingRule, 0x80)
      }
      /* istanbul ignore else */
      if (hasOwn(item, 'reverseOrder')) {
        writer.writeBoolean(item.reverseOrder, 0x81)
      }
      writer.endSequence()
    }
    writer.endSequence()
    ber.writeBuffer(writer.buffer, 0x04)
  }
}
module.exports = ServerSideSortingRequestControl
