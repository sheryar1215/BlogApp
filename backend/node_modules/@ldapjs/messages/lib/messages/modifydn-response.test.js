'use strict'

const tap = require('tap')
const { BerReader } = require('@ldapjs/asn1')
const { operations } = require('@ldapjs/protocol')
const {
  modifyDnResponseBytes
} = require('./_fixtures/message-byte-arrays')
const ModifyDnResponse = require('./modifydn-response')

tap.test('basic', async t => {
  const res = new ModifyDnResponse()
  t.equal(res.protocolOp, operations.LDAP_RES_MODRDN)
  t.equal(res.type, 'ModifyDnResponse')
})

tap.test('toBer', t => {
  tap.test('returns basic bytes', async t => {
    const res = new ModifyDnResponse({ messageId: 2 })
    const ber = res.toBer()
    const expected = Buffer.from(modifyDnResponseBytes)
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.comment('see the LdapResult test suite for further tests')

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('parses a basic object', async t => {
    const bytes = modifyDnResponseBytes.slice(5)
    const reader = new BerReader(Buffer.from(bytes))
    const pojo = ModifyDnResponse.parseToPojo(reader)
    t.strictSame(pojo, {
      status: 0,
      matchedDN: '',
      diagnosticMessage: '',
      referrals: []
    })
  })

  t.test('throws if protocol op is wrong', async t => {
    const bytes = modifyDnResponseBytes.slice(5)
    bytes[0] = 0x68
    const reader = new BerReader(Buffer.from(bytes))
    t.throws(
      () => ModifyDnResponse.parseToPojo(reader),
      Error('found wrong protocol operation: 0x68')
    )
  })

  t.comment('see the LdapResult test suite for further tests')

  t.end()
})
