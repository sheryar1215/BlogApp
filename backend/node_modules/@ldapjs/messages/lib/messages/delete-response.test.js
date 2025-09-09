'use strict'

const tap = require('tap')
const { BerReader } = require('@ldapjs/asn1')
const { operations } = require('@ldapjs/protocol')
const {
  deleteResponseBytes
} = require('./_fixtures/message-byte-arrays')
const DeleteResponse = require('./delete-response')

tap.test('basic', async t => {
  const res = new DeleteResponse()
  t.equal(res.protocolOp, operations.LDAP_RES_DELETE)
  t.equal(res.type, 'DeleteResponse')
})

tap.test('toBer', t => {
  tap.test('returns basic bytes', async t => {
    const res = new DeleteResponse({ messageId: 2 })
    const ber = res.toBer()
    const expected = Buffer.from(deleteResponseBytes)
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('parses a basic object', async t => {
    const bytes = deleteResponseBytes.slice(5)
    const reader = new BerReader(Buffer.from(bytes))
    const pojo = DeleteResponse.parseToPojo(reader)
    t.strictSame(pojo, {
      status: 0,
      matchedDN: '',
      diagnosticMessage: '',
      referrals: []
    })
  })

  t.test('throws if protocol op is wrong', async t => {
    const bytes = deleteResponseBytes.slice(5)
    bytes[0] = 0x68
    const reader = new BerReader(Buffer.from(bytes))
    t.throws(
      () => DeleteResponse.parseToPojo(reader),
      Error('found wrong protocol operation: 0x68')
    )
  })

  t.end()
})
