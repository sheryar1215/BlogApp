'use strict'

const tap = require('tap')
const { BerReader } = require('@ldapjs/asn1')
const {
  abandonResponseBytes
} = require('./_fixtures/message-byte-arrays')
const AbandonResponse = require('./abandon-response')

tap.test('basic', async t => {
  const res = new AbandonResponse()
  t.equal(res.protocolOp, 0x00)
  t.equal(res.type, 'AbandonResponse')
})

tap.test('toBer', t => {
  tap.test('returns basic bytes', async t => {
    const res = new AbandonResponse({ messageId: 1 })
    const ber = res.toBer()
    const expected = Buffer.from(abandonResponseBytes)
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('parses a basic object', async t => {
    const bytes = abandonResponseBytes.slice(5)
    const reader = new BerReader(Buffer.from(bytes))
    const pojo = AbandonResponse.parseToPojo(reader)
    t.strictSame(pojo, {
      status: 0,
      matchedDN: '',
      diagnosticMessage: '',
      referrals: []
    })
  })

  t.test('throws if protocol op is wrong', async t => {
    const bytes = abandonResponseBytes.slice(5)
    bytes[0] = 0x68
    const reader = new BerReader(Buffer.from(bytes))
    t.throws(
      () => AbandonResponse.parseToPojo(reader),
      Error('found wrong protocol operation: 0x68')
    )
  })

  t.comment('see the LdapResult test suite for further tests')

  t.end()
})
