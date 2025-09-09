'use strict'

const tap = require('tap')
const { BerReader } = require('@ldapjs/asn1')
const warning = require('../deprecations')
const AbandonRequest = require('./abandon-request')

// Silence the standard warning logs. We will test the messages explicitly.
process.removeAllListeners('warning')

const { abandonRequestBytes } = require('./_fixtures/message-byte-arrays')

tap.test('basic', t => {
  t.test('constructor no args', async t => {
    const req = new AbandonRequest()
    t.strictSame(req.pojo, {
      messageId: 1,
      protocolOp: 0x50,
      type: 'AbandonRequest',
      abandonId: 0,
      controls: []
    })
  })

  t.test('emits warning for abandonID', t => {
    process.on('warning', handler)
    t.teardown(async () => {
      process.removeListener('warning', handler)
      warning.emitted.set('LDAP_MESSAGE_DEP_003', false)
    })

    const req = new AbandonRequest({
      abandonID: 1
    })
    t.ok(req)

    function handler (error) {
      t.equal(
        error.message,
        'abandonID is deprecated. Use abandonId instead.'
      )
      t.end()
    }
  })

  t.test('properties return correct values', t => {
    process.on('warning', handler)
    t.teardown(async () => {
      process.removeListener('warning', handler)
      warning.emitted.set('LDAP_MESSAGE_DEP_003', false)
    })

    const req = new AbandonRequest({
      abandonId: 1
    })

    t.equal(req.abandonId, 1)
    t.equal(req.abandonID, 1)

    function handler (error) {
      t.equal(
        error.message,
        'abandonID is deprecated. Use abandonId instead.'
      )
      t.end()
    }
  })

  t.end()
})

tap.test('toBer', t => {
  t.test('converts AbandonRequest to BER', async t => {
    const reqBuffer = Buffer.from(abandonRequestBytes)
    const reader = new BerReader(reqBuffer)
    const message = AbandonRequest.parse(reader)

    const ber = message.toBer()
    t.equal('[object BerReader]', Object.prototype.toString.call(ber))
    t.equal(reqBuffer.compare(ber.buffer), 0)
  })

  t.end()
})

tap.test('_pojo', t => {
  t.test('returns implementation properties', async t => {
    const message = new AbandonRequest()
    const pojo = message._pojo()
    t.strictSame(pojo, { abandonId: 0 })
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('throws if operation incorrect', async t => {
    const reqBuffer = Buffer.from(abandonRequestBytes)
    reqBuffer[5] = 0x61

    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    t.throws(
      () => AbandonRequest.parseToPojo(reader),
      Error('found wrong protocol operation: 0x61')
    )
  })

  t.test('returns a pojo representation', async t => {
    const reqBuffer = Buffer.from(abandonRequestBytes)
    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    const pojo = AbandonRequest.parseToPojo(reader)
    t.strictSame(pojo, {
      protocolOp: 0x50,
      abandonId: 5
    })
  })

  t.end()
})
