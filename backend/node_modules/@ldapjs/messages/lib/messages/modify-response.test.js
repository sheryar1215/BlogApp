'use strict'

const tap = require('tap')
const { BerReader } = require('@ldapjs/asn1')
const { operations, resultCodes } = require('@ldapjs/protocol')
const {
  modifyResponseBytes
} = require('./_fixtures/message-byte-arrays')
const ModifyResponse = require('./modify-response')

tap.test('basic', async t => {
  const res = new ModifyResponse()
  t.equal(res.protocolOp, operations.LDAP_RES_MODIFY)
  t.equal(res.type, 'ModifyResponse')
})

tap.test('toBer', t => {
  tap.test('returns basic bytes', async t => {
    const res = new ModifyResponse({
      messageId: 2,
      status: resultCodes.SUCCESS
    })
    const ber = res.toBer()
    const expected = Buffer.from(modifyResponseBytes)
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('parses a basic object', async t => {
    const bytes = modifyResponseBytes.slice(5)
    const reader = new BerReader(Buffer.from(bytes))
    const pojo = ModifyResponse.parseToPojo(reader)
    t.strictSame(pojo, {
      status: resultCodes.SUCCESS,
      matchedDN: '',
      diagnosticMessage: '',
      referrals: []
    })
  })

  t.test('throws if protocol op is wrong', async t => {
    const bytes = modifyResponseBytes.slice(5)
    bytes[0] = 0x68
    const reader = new BerReader(Buffer.from(bytes))
    t.throws(
      () => ModifyResponse.parseToPojo(reader),
      Error('found wrong protocol operation: 0x68')
    )
  })

  t.end()
})
