'use strict'

const tap = require('tap')
const { BerReader } = require('@ldapjs/asn1')
const { operations } = require('@ldapjs/protocol')
const {
  addResponseBasicBytes
} = require('./_fixtures/message-byte-arrays')
const AddResponse = require('./add-response')

tap.test('basic', async t => {
  const res = new AddResponse()
  t.equal(res.protocolOp, operations.LDAP_RES_ADD)
  t.equal(res.type, 'AddResponse')
})

tap.test('toBer', t => {
  tap.test('returns basic bytes', async t => {
    const res = new AddResponse({ messageId: 2 })
    const ber = res.toBer()
    const expected = Buffer.from(addResponseBasicBytes)
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.comment('see the LdapResult test suite for further tests')

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('parses a basic object', async t => {
    const bytes = addResponseBasicBytes.slice(5)
    const reader = new BerReader(Buffer.from(bytes))
    const pojo = AddResponse.parseToPojo(reader)
    t.strictSame(pojo, {
      status: 0,
      matchedDN: '',
      diagnosticMessage: '',
      referrals: []
    })
  })

  t.test('throws if protocol op is wrong', async t => {
    const bytes = addResponseBasicBytes.slice(5)
    bytes[0] = 0x68
    const reader = new BerReader(Buffer.from(bytes))
    t.throws(
      () => AddResponse.parseToPojo(reader),
      Error('found wrong protocol operation: 0x68')
    )
  })

  t.comment('see the LdapResult test suite for further tests')

  t.end()
})
