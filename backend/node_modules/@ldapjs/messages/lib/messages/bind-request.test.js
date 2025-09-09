'use strict'

const tap = require('tap')
const { BerReader } = require('@ldapjs/asn1')
const BindRequest = require('./bind-request')

const {
  bindRequestBytes,
  bindRequestAnonymousBytes
} = require('./_fixtures/message-byte-arrays')

tap.test('basic', t => {
  t.test('constructor no args', async t => {
    const req = new BindRequest()
    t.strictSame(req.pojo, {
      messageId: 1,
      protocolOp: 0x60,
      type: 'BindRequest',
      version: 3,
      name: null,
      authenticationType: 'simple',
      credentials: '',
      controls: []
    })
  })

  t.test('properties return correct values', async t => {
    const req = new BindRequest({
      messageId: 1,
      version: 999,
      name: 'foobar',
      authentication: 'nonsense',
      credentials: 'secret'
    })

    t.equal(req.credentials, 'secret')
    t.equal(req.name, 'foobar')
    t.equal(req.type, 'BindRequest')
    t.equal(req.version, 999)
    t.equal(req._dn, 'foobar')
  })

  t.end()
})

tap.test('toBer', t => {
  t.test('converts BindRequest to BER', async t => {
    const reqBuffer = Buffer.from(bindRequestBytes)
    const reader = new BerReader(reqBuffer)
    const message = BindRequest.parse(reader)

    const ber = message.toBer()
    t.equal('[object BerReader]', Object.prototype.toString.call(ber))
    t.equal(reqBuffer.compare(ber.buffer), 0)
  })

  t.test('converts an anonymous bind request', async t => {
    const reqBuffer = Buffer.from(bindRequestAnonymousBytes)
    const message = new BindRequest()
    const ber = message.toBer()
    t.equal(reqBuffer.compare(ber.buffer), 0)
  })

  t.end()
})

tap.test('_pojo', t => {
  t.test('returns implementation properties', async t => {
    const message = new BindRequest()
    const pojo = message._pojo()
    t.strictSame(pojo, {
      version: 3,
      name: null,
      authenticationType: 'simple',
      credentials: ''
    })
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('throws if operation incorrect', async t => {
    const reqBuffer = Buffer.from(bindRequestBytes)
    reqBuffer[5] = 0x61

    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    t.throws(
      () => BindRequest.parseToPojo(reader),
      Error('found wrong protocol operation: 0x61')
    )
  })

  t.test('throws if simple auth credentials is tagged wrong', async t => {
    const reqBuffer = Buffer.from(bindRequestBytes)
    reqBuffer[31] = 0x83

    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    t.throws(
      () => BindRequest.parseToPojo(reader),
      Error('authentication 0x83 not supported')
    )
  })

  t.test('returns a pojo representation', async t => {
    const reqBuffer = Buffer.from(bindRequestBytes)
    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    const pojo = BindRequest.parseToPojo(reader)
    t.strictSame(pojo, {
      protocolOp: 0x60,
      version: 3,
      name: 'uid=admin,ou=system',
      authentication: 'simple',
      credentials: 'secret'
    })
  })

  t.end()
})
