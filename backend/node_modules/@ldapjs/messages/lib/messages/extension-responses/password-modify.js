'use strict'

const { BerReader } = require('@ldapjs/asn1')
const ExtensionResponse = require('../extension-response')

/**
 * Implements the password modify extension defined by
 * https://www.rfc-editor.org/rfc/rfc3062.
 */
class PasswordModifyResponse extends ExtensionResponse {
  /**
   * Given a basic {@link ExtensionResponse} with a buffer string in
   * `responseValue`, parse into a specific {@link PasswordModifyResponse}
   * instance.
   *
   * @param {ExtensionResponse} response
   *
   * @returns {PasswordModifyResponse}
   */
  static fromResponse (response) {
    if (response.responseValue === undefined) {
      return new PasswordModifyResponse()
    }

    const valueBuffer = Buffer.from(response.responseValue.substring(8), 'hex')
    const reader = new BerReader(valueBuffer)
    reader.readSequence()
    const responseValue = reader.readString(0x80)
    return new PasswordModifyResponse({ responseValue })
  }
}

module.exports = PasswordModifyResponse
