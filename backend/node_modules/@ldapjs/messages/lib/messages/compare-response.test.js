'use strict'

const tap = require('tap')
const { BerReader } = require('@ldapjs/asn1')
const { operations, resultCodes } = require('@ldapjs/protocol')
const {
  compareResponseBytes
} = require('./_fixtures/message-byte-arrays')
const CompareResponse = require('./compare-response')

tap.test('basic', async t => {
  const res = new CompareResponse()
  t.equal(res.protocolOp, operations.LDAP_RES_COMPARE)
  t.equal(res.type, 'CompareResponse')
})

tap.test('toBer', t => {
  tap.test('returns basic bytes', async t => {
    const res = new CompareResponse({
      messageId: 2,
      status: resultCodes.COMPARE_TRUE
    })
    const ber = res.toBer()
    const expected = Buffer.from(compareResponseBytes)
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('parses a basic object', async t => {
    const bytes = compareResponseBytes.slice(5)
    const reader = new BerReader(Buffer.from(bytes))
    const pojo = CompareResponse.parseToPojo(reader)
    t.strictSame(pojo, {
      status: resultCodes.COMPARE_TRUE,
      matchedDN: '',
      diagnosticMessage: '',
      referrals: []
    })
  })

  t.test('throws if protocol op is wrong', async t => {
    const bytes = compareResponseBytes.slice(5)
    bytes[0] = 0x68
    const reader = new BerReader(Buffer.from(bytes))
    t.throws(
      () => CompareResponse.parseToPojo(reader),
      Error('found wrong protocol operation: 0x68')
    )
  })

  t.end()
})
