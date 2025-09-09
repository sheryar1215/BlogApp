'use strict'

const { Ber, BerReader, BerWriter } = require('@ldapjs/asn1')
const isObject = require('../is-object')
const hasOwn = require('../has-own')
const Control = require('../control')

/**
 * @typedef {object} PagedResultsControlValue
 * @property {number} size The requested page size from a client, or the result
 * set size estimate from the server.
 * @property {Buffer} cookie Identifier for the result set.
 */

/**
 * Implements:
 * https://datatracker.ietf.org/doc/html/rfc2696#section-2
 *
 * @extends Control
 */
class PagedResultsControl extends Control {
  static OID = '1.2.840.113556.1.4.319'

  /**
   * @typedef {ControlParams} PagedResultsParams
   * @property {PagedResultsControlValue | Buffer} [value]
   */

  /**
   * Creates a new paged results control.
   *
   * @param {PagedResultsParams} [options]
   */
  constructor (options = {}) {
    options.type = PagedResultsControl.OID
    super(options)

    this._value = {
      size: 0,
      cookie: Buffer.alloc(0)
    }

    if (hasOwn(options, 'value') === false) {
      return
    }

    if (Buffer.isBuffer(options.value)) {
      this.#parse(options.value)
    } else if (isObject(options.value)) {
      this.value = options.value
    } else {
      throw new TypeError('options.value must be a Buffer or Object')
    }
  }

  get value () {
    return this._value
  }

  set value (obj) {
    this._value = Object.assign({}, this._value, obj)
    if (typeof this._value.cookie === 'string') {
      this._value.cookie = Buffer.from(this._value.cookie)
    }
  }

  #parse (buffer) {
    const ber = new BerReader(buffer)

    /* istanbul ignore else */
    if (ber.readSequence()) {
      this._value = {}
      this._value.size = ber.readInt()
      this._value.cookie = ber.readString(Ber.OctetString, true)
      // readString returns '' instead of a zero-length buffer
      if (!this._value.cookie) {
        this._value.cookie = Buffer.alloc(0)
      }
    }
  }

  _toBer (ber) {
    const writer = new BerWriter()
    writer.startSequence()
    writer.writeInt(this._value.size)
    if (this._value.cookie && this._value.cookie.length > 0) {
      writer.writeBuffer(this._value.cookie, Ber.OctetString)
    } else {
      // writeBuffer rejects zero-length buffers
      writer.writeString('')
    }
    writer.endSequence()

    ber.writeBuffer(writer.buffer, Ber.OctetString)
    return ber
  }

  _updatePlainObject (obj) {
    obj.controlValue = this.value
    return obj
  }
}
module.exports = PagedResultsControl
