'use strict'

const { operations } = require('@ldapjs/protocol')
const { getControl } = require('@ldapjs/controls')

const messageClasses = {
  AbandonRequest: require('./messages/abandon-request'),
  AddRequest: require('./messages/add-request'),
  BindRequest: require('./messages/bind-request'),
  CompareRequest: require('./messages/compare-request'),
  DeleteRequest: require('./messages/delete-request'),
  ExtensionRequest: require('./messages/extension-request'),
  ModifyRequest: require('./messages/modify-request'),
  ModifyDnRequest: require('./messages/modifydn-request'),
  SearchRequest: require('./messages/search-request'),
  UnbindRequest: require('./messages/unbind-request'),

  AbandonResponse: require('./messages/abandon-response'),
  AddResponse: require('./messages/add-response'),
  BindResponse: require('./messages/bind-response'),
  CompareResponse: require('./messages/compare-response'),
  DeleteResponse: require('./messages/delete-response'),
  ExtensionResponse: require('./messages/extension-response'),
  ModifyResponse: require('./messages/modify-response'),
  ModifyDnResponse: require('./messages/modifydn-response'),

  // Search result messages.
  SearchResultEntry: require('./messages/search-result-entry'),
  SearchResultReference: require('./messages/search-result-reference'),
  SearchResultDone: require('./messages/search-result-done'),

  // Miscellaneous messages.
  IntermediateResponse: require('./messages/intermediate-response')
}

/**
 * Utility function that inspects a BER object and parses it into an instance
 * of a specific LDAP message.
 *
 * @param {import('@ldapjs/asn1').BerReader} ber An object that represents a
 * full LDAP Message sequence as described in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.1.1.
 *
 * @returns {LdapMessage} Some specific instance of the base LDAP Message
 * type.
 *
 * @throws When the input data is malformed.
 */
module.exports = function parseToMessage (ber) {
  const inputType = Object.prototype.toString.apply(ber)
  if (inputType !== '[object BerReader]') {
    throw TypeError(`Expected BerReader but got ${inputType}.`)
  }

  ber.readSequence()

  const messageId = ber.readInt()
  const messageType = identifyType(ber)
  const MessageClass = messageClasses[messageType]
  const pojoMessage = MessageClass.parseToPojo(ber)
  const message = new MessageClass({
    messageId,
    ...pojoMessage
  })

  // Look for controls
  if (ber.peek() === 0xa0) {
    ber.readSequence()
    const end = ber.offset + ber.length
    while (ber.offset < end) {
      const c = getControl(ber)
      /* istanbul ignore else */
      if (c) {
        message.addControl(c)
      }
    }
  }

  return message
}

/**
 * Determines the type of LDAP message the BER represents, e.g. a "Bind Request"
 * message.
 *
 * @param {BerReader} ber
 *
 * @returns {string}
 */
function identifyType (ber) {
  let result
  switch (ber.peek()) {
    case operations.LDAP_REQ_ABANDON: {
      result = 'AbandonRequest'
      break
    }

    case 0x00: {
      result = 'AbandonResponse'
      break
    }

    case operations.LDAP_REQ_ADD: {
      result = 'AddRequest'
      break
    }

    case operations.LDAP_RES_ADD: {
      result = 'AddResponse'
      break
    }

    case operations.LDAP_REQ_BIND: {
      result = 'BindRequest'
      break
    }

    case operations.LDAP_RES_BIND: {
      result = 'BindResponse'
      break
    }

    case operations.LDAP_REQ_COMPARE: {
      result = 'CompareRequest'
      break
    }

    case operations.LDAP_RES_COMPARE: {
      result = 'CompareResponse'
      break
    }

    case operations.LDAP_REQ_DELETE: {
      result = 'DeleteRequest'
      break
    }

    case operations.LDAP_RES_DELETE: {
      result = 'DeleteResponse'
      break
    }

    case operations.LDAP_REQ_EXTENSION: {
      result = 'ExtensionRequest'
      break
    }

    case operations.LDAP_RES_EXTENSION: {
      result = 'ExtensionResponse'
      break
    }

    case operations.LDAP_REQ_MODIFY: {
      result = 'ModifyRequest'
      break
    }

    case operations.LDAP_RES_MODIFY: {
      result = 'ModifyResponse'
      break
    }

    case operations.LDAP_REQ_MODRDN: {
      result = 'ModifyDnRequest'
      break
    }

    case operations.LDAP_RES_MODRDN: {
      result = 'ModifyDnResponse'
      break
    }

    case operations.LDAP_REQ_SEARCH: {
      result = 'SearchRequest'
      break
    }

    case operations.LDAP_RES_SEARCH_ENTRY: {
      result = 'SearchResultEntry'
      break
    }

    case operations.LDAP_RES_SEARCH_REF: {
      result = 'SearchResultReference'
      break
    }

    case operations.LDAP_RES_SEARCH_DONE: {
      result = 'SearchResultDone'
      break
    }

    case operations.LDAP_REQ_UNBIND: {
      result = 'UnbindRequest'
      break
    }

    case operations.LDAP_RES_INTERMEDIATE: {
      result = 'IntermediateResponse'
      break
    }
  }

  return result
}
