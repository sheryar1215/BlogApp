'use strict'

const { BerReader, BerWriter } = require('@ldapjs/asn1')
const isObject = require('../is-object')
const hasOwn = require('../has-own')
const Control = require('../control')

/**
 * @typedef {object} PasswordPolicyResponseControlValue
 * @property {number} error One of 0 (passwordExpired), 1 (accountLocked),
 * 2 (changeAfterReset), 3 (passwordModNotAllowed), 4 (mustSupplyOldPassword),
 * 5 (insufficientPasswordQuality), 6 (passwordTooShort), 7 (passwordTooYoung),
 * 8 (passwordInHistory), 9 (passwordTooYoung)
 * @property {number} timeBeforeExpiration
 * @property {number} graceAuthNsRemaining
 */

/**
 * Implements both request and response controls:
 * https://datatracker.ietf.org/doc/html/draft-behera-ldap-password-policy-11#name-controls-used-for-password-
 *
 * @extends Control
 */
class PasswordPolicyControl extends Control {
  static OID = '1.3.6.1.4.1.42.2.27.8.5.1'

  /**
   * @typedef {ControlParams} PasswordPolicyResponseParams
   * @property {PasswordPolicyResponseControlValue | Buffer} [value]
   */

  /**
   * Creates a new password policy control.
   *
   * @param {PasswordPolicyResponseParams} [options]
   */
  constructor (options = {}) {
    options.type = PasswordPolicyControl.OID
    super(options)

    this._value = {}

    if (hasOwn(options, 'value') === false) {
      return
    }

    if (Buffer.isBuffer(options.value)) {
      this.#parse(options.value)
    } else if (isObject(options.value)) {
      if (hasOwn(options.value, 'timeBeforeExpiration') === true && hasOwn(options.value, 'graceAuthNsRemaining') === true) {
        throw new Error('options.value must contain either timeBeforeExpiration or graceAuthNsRemaining, not both')
      }
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
   * {@link PasswordPolicyResponseControlValue}, read that buffer into the
   * current instance.
   */
  #parse (buffer) {
    const ber = new BerReader(buffer)
    if (ber.readSequence()) {
      this._value = {}
      if (ber.peek() === 0xa0) {
        ber.readSequence(0xa0)
        if (ber.peek() === 0x80) {
          this._value.timeBeforeExpiration = ber._readTag(0x80)
        } else if (ber.peek() === 0x81) {
          this._value.graceAuthNsRemaining = ber._readTag(0x81)
        }
      }
      if (ber.peek() === 0x81) {
        this._value.error = ber._readTag(0x81)
      }
    }
  }

  _toBer (ber) {
    if (!this._value || Object.keys(this._value).length === 0) { return }

    const writer = new BerWriter()
    writer.startSequence()
    if (hasOwn(this._value, 'timeBeforeExpiration')) {
      writer.startSequence(0xa0)
      writer.writeInt(this._value.timeBeforeExpiration, 0x80)
      writer.endSequence()
    } else if (hasOwn(this._value, 'graceAuthNsRemaining')) {
      writer.startSequence(0xa0)
      writer.writeInt(this._value.graceAuthNsRemaining, 0x81)
      writer.endSequence()
    }
    if (hasOwn(this._value, 'error')) {
      writer.writeInt(this._value.error, 0x81)
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
module.exports = PasswordPolicyControl
