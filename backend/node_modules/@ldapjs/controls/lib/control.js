'use strict'

const { BerWriter } = require('@ldapjs/asn1')

/**
 * Baseline LDAP control object. Implements
 * https://tools.ietf.org/html/rfc4511#section-4.1.11
 *
 * @class
 */
class Control {
  /**
   * @typedef {object} ControlParams
   * @property {string} [type=''] The dotted decimal control type value.
   * @property {boolean} [criticality=false] Criticality value for the control.
   * @property {string|Buffer} [value] The value for the control. If this is
   * a `string` then it will be written as-is. If it is an instance of `Buffer`
   * then it will be written by `value.toString()` when generating a BER
   * instance.
   */

  /**
   * Create a new baseline LDAP control.
   *
   * @param {ControlParams} [options]
   */
  constructor (options = {}) {
    const opts = Object.assign({ type: '', criticality: false, value: null }, options)
    this.type = opts.type
    this.criticality = opts.criticality
    this.value = opts.value
  }

  get [Symbol.toStringTag] () {
    return 'LdapControl'
  }

  /**
   * Serializes the control into a plain JavaScript object that can be passed
   * to the constructor as an options object. If an instance has a `_pojo(obj)`
   * method then the built object will be sent to that method and the resulting
   * mutated object returned.
   *
   * @returns {object} A plain JavaScript object that represents an LDAP control.
   */
  get pojo () {
    const obj = {
      type: this.type,
      value: this.value,
      criticality: this.criticality
    }

    if (typeof this._pojo === 'function') {
      this._pojo(obj)
    }

    return obj
  }

  /**
   * Converts the instance into a [BER](http://luca.ntop.org/Teaching/Appunti/asn1.html)
   * representation.
   *
   * @param {BerWriter} [ber] An empty `BerWriter` instance to populate.
   *
   * @returns {object} A BER object.
   */
  toBer (ber = new BerWriter()) {
    ber.startSequence()
    ber.writeString(this.type || '')
    ber.writeBoolean(this.criticality)

    /* istanbul ignore else */
    if (typeof (this._toBer) === 'function') {
      this._toBer(ber)
    } else if (this.value !== undefined) {
      if (typeof this.value === 'string') {
        ber.writeString(this.value)
      } else if (Buffer.isBuffer(this.value)) {
        ber.writeString(this.value.toString())
      }
    }

    ber.endSequence()
    return ber
  }
}
module.exports = Control
