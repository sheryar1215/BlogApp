'use strict'

const tap = require('tap')
const { operations } = require('@ldapjs/protocol')
const UnbindRequest = require('./unbind-request')

const { unbindRequestBytes } = require('./_fixtures/message-byte-arrays')
const { BerReader, BerWriter } = require('@ldapjs/asn1')

tap.test('basic', t => {
  t.test('constructor no args', async t => {
    const req = new UnbindRequest()
    t.strictSame(req.pojo, {
      messageId: 1,
      protocolOp: operations.LDAP_REQ_UNBIND,
      type: 'UnbindRequest',
      controls: []
    })
    t.equal(req.type, 'UnbindRequest')
  })

  t.end()
})

tap.test('_toBer', t => {
  tap.test('converts instance to BER', async t => {
    const req = new UnbindRequest()
    const writer = new BerWriter()
    req._toBer(writer)

    t.equal(
      Buffer.from(unbindRequestBytes.slice(5)).compare(writer.buffer),
      0
    )
  })

  t.end()
})

tap.test('_pojo', t => {
  t.test('returns a pojo representation', async t => {
    const req = new UnbindRequest()
    t.strictSame(req._pojo(), {})
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('throws if operation incorrect', async t => {
    const reqBuffer = Buffer.from(unbindRequestBytes)
    reqBuffer[5] = 0x61

    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    t.throws(
      () => UnbindRequest.parseToPojo(reader),
      Error('found wrong protocol operation: 0x61')
    )
  })

  t.test('returns a pojo representation', async t => {
    const reqBuffer = Buffer.from(unbindRequestBytes)
    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    const pojo = UnbindRequest.parseToPojo(reader)
    t.equal(pojo.protocolOp, operations.LDAP_REQ_UNBIND)
  })

  t.end()
})
