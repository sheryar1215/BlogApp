'use strict'

const ExtensionResponse = require('../extension-response')

/**
 * Implements the "Who Am I" extension defined by
 * https://www.rfc-editor.org/rfc/rfc4532.
 */
class WhoAmIResponse extends ExtensionResponse {
  /**
   * Given a basic {@link ExtensionResponse} with a buffer string in
   * `responseValue`, parse into a specific {@link WhoAmIResponse}
   * instance.
   *
   * @param {ExtensionResponse} response
   *
   * @returns {WhoAmIResponse}
   */
  static fromResponse (response) {
    if (response.responseValue === undefined) {
      return new WhoAmIResponse()
    }

    const valueBuffer = Buffer.from(response.responseValue.substring(8), 'hex')
    const responseValue = valueBuffer.toString('utf8')
    return new WhoAmIResponse({ responseValue })
  }
}

module.exports = WhoAmIResponse
