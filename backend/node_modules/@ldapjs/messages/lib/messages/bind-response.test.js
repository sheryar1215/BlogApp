'use strict'

const tap = require('tap')
const { BerReader } = require('@ldapjs/asn1')
const { operations } = require('@ldapjs/protocol')
const {
  bindResponseBytes
} = require('./_fixtures/message-byte-arrays')
const BindResponse = require('./bind-response')

tap.test('basic', async t => {
  const res = new BindResponse()
  t.equal(res.protocolOp, operations.LDAP_RES_BIND)
  t.equal(res.type, 'BindResponse')
})

tap.test('toBer', t => {
  tap.test('returns basic bytes', async t => {
    const res = new BindResponse({ messageId: 1 })
    const ber = res.toBer()
    const expected = Buffer.from(bindResponseBytes)
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('parses a basic object', async t => {
    const bytes = bindResponseBytes.slice(5)
    const reader = new BerReader(Buffer.from(bytes))
    const pojo = BindResponse.parseToPojo(reader)
    t.strictSame(pojo, {
      status: 0,
      matchedDN: '',
      diagnosticMessage: '',
      referrals: []
    })
  })

  t.test('throws if protocol op is wrong', async t => {
    const bytes = bindResponseBytes.slice(5)
    bytes[0] = 0x68
    const reader = new BerReader(Buffer.from(bytes))
    t.throws(
      () => BindResponse.parseToPojo(reader),
      Error('found wrong protocol operation: 0x68')
    )
  })

  t.comment('see the LdapResult test suite for further tests')

  t.end()
})
