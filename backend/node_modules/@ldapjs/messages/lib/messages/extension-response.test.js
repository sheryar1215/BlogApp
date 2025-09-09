'use strict'

const tap = require('tap')
const { BerReader, BerWriter } = require('@ldapjs/asn1')
const { operations, resultCodes } = require('@ldapjs/protocol')
const {
  extensionDisconnectionNotificationResponseBytes
} = require('./_fixtures/message-byte-arrays')
const ExtensionResponse = require('./extension-response')

tap.test('basic', async t => {
  const res = new ExtensionResponse()
  t.equal(res.protocolOp, operations.LDAP_RES_EXTENSION)
  t.equal(res.type, 'ExtensionResponse')
})

tap.test('.responseName', t => {
  t.test('gets and sets', async t => {
    const res = new ExtensionResponse()
    t.equal(res.responseName, undefined)
    res.responseName = 'foo'
    t.equal(res.responseName, 'foo')
  })

  t.end()
})

tap.test('.responseValue', t => {
  t.test('gets and sets', async t => {
    const res = new ExtensionResponse()
    t.equal(res.responseValue, undefined)
    res.responseValue = 'foo'
    t.equal(res.responseValue, 'foo')
  })

  t.end()
})

tap.test('toBer', t => {
  tap.test('returns basic bytes', async t => {
    const res = new ExtensionResponse({
      messageId: 0,
      status: resultCodes.UNAVAILABLE,
      diagnosticMessage: 'The Directory Server is shutting down',
      responseName: '1.3.6.1.4.1.1466.20036'
    })
    const ber = res.toBer()
    const expected = Buffer.from(extensionDisconnectionNotificationResponseBytes)
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.end()
})

tap.test('_writeResponse', t => {
  t.test('writes a response with a name', async t => {
    const req = new ExtensionResponse({ responseName: 'foo' })
    const expected = Buffer.from([0x8a, 0x03, 0x66, 0x6f, 0x6f])
    const writer = new BerWriter()
    req._writeResponse(writer)
    t.equal(expected.compare(writer.buffer), 0)
  })

  t.test('writes response with value', async t => {
    const req = new ExtensionResponse({ responseValue: 'foo' })
    const expected = Buffer.from([0x8b, 0x03, 0x66, 0x6f, 0x6f])
    const writer = new BerWriter()
    req._writeResponse(writer)
    t.equal(expected.compare(writer.buffer), 0)
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('throws if protocol op is wrong', async t => {
    const bytes = extensionDisconnectionNotificationResponseBytes.slice(5)
    bytes[0] = 0x68
    const reader = new BerReader(Buffer.from(bytes))
    t.throws(
      () => ExtensionResponse.parseToPojo(reader),
      Error('found wrong protocol operation: 0x68')
    )
  })

  t.test('parses a basic object', async t => {
    const bytes = extensionDisconnectionNotificationResponseBytes.slice(5)
    const reader = new BerReader(Buffer.from(bytes))
    const pojo = ExtensionResponse.parseToPojo(reader)
    t.strictSame(pojo, {
      status: resultCodes.UNAVAILABLE,
      matchedDN: '',
      diagnosticMessage: 'The Directory Server is shutting down',
      referrals: [],
      responseName: '1.3.6.1.4.1.1466.20036'
    })
  })

  t.test('values are buffer strings', async t => {
    const {
      withGeneratedPasswordBytes
    } = require('./extension-responses/_fixtures/password-modify')
    const bytes = withGeneratedPasswordBytes.slice(5)
    const reader = new BerReader(Buffer.from(bytes))
    const pojo = ExtensionResponse.parseToPojo(reader)
    t.strictSame(pojo, {
      status: 0,
      matchedDN: '',
      diagnosticMessage: '',
      referrals: [],
      responseName: undefined,
      responseValue: '<buffer>301f801d4164617074657253746576656e736f6e477261696e506c61796d617465'
    })
  })

  t.end()
})
