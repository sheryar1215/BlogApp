'use strict'

const tap = require('tap')
const { operations } = require('@ldapjs/protocol')
const { BerWriter, BerReader } = require('@ldapjs/asn1')
const IntermediateResponse = require('./intermediate-response')

const {
  intermediateResponseBytes,
  intermediateResponseNoValueBytes,
  intermediateResponseNoNameBytes
} = require('./_fixtures/message-byte-arrays')

tap.test('basic', t => {
  t.test('constructor no args', async t => {
    const res = new IntermediateResponse()
    t.strictSame(res.pojo, {
      messageId: 1,
      protocolOp: operations.LDAP_RES_INTERMEDIATE,
      type: 'IntermediateResponse',
      responseName: undefined,
      responseValue: undefined,
      controls: []
    })

    t.equal(res.type, 'IntermediateResponse')
  })

  t.test('constructor with args', async t => {
    const res = new IntermediateResponse({
      responseName: '1.2.3',
      responseValue: 'foo'
    })
    t.strictSame(res.pojo, {
      messageId: 1,
      protocolOp: operations.LDAP_RES_INTERMEDIATE,
      type: 'IntermediateResponse',
      responseName: '1.2.3',
      responseValue: 'foo',
      controls: []
    })
  })

  t.end()
})

tap.test('.responseName', t => {
  t.test('sets/gets', async t => {
    const res = new IntermediateResponse()
    t.equal(res.responseName, undefined)

    res.responseName = '1.2.3'
    t.equal(res.responseName, '1.2.3')
  })

  t.test('rejects bad value', async t => {
    const res = new IntermediateResponse()
    t.throws(
      () => {
        res.responseName = 'foo bar'
      },
      'responseName must be a numeric OID'
    )
    t.throws(
      () => {
        res.responseName = 1.2
      },
      'responseName must be a numeric OID'
    )
  })

  t.end()
})

tap.test('.responseValue', t => {
  t.test('sets/gets', async t => {
    const res = new IntermediateResponse()
    t.equal(res.responseValue, undefined)

    res.responseValue = '1.2.3'
    t.equal(res.responseValue, '1.2.3')
  })

  t.test('rejects bad value', async t => {
    const res = new IntermediateResponse()
    t.throws(
      () => {
        res.responseValue = { foo: 'foo' }
      },
      'responseValue must be a string'
    )
  })

  t.end()
})

tap.test('_toBer', t => {
  t.test('converts instance to BER', async t => {
    let res = new IntermediateResponse({
      messageId: 2,
      responseName: '1.2.3',
      responseValue: 'foo'
    })
    let writer = new BerWriter()
    res._toBer(writer)

    t.equal(
      Buffer.from(intermediateResponseBytes.slice(5)).compare(writer.buffer),
      0
    )

    res = new IntermediateResponse({
      messageId: 2,
      responseName: '1.2.3'
    })
    writer = new BerWriter()
    res._toBer(writer)

    t.equal(
      Buffer.from(intermediateResponseNoValueBytes.slice(5)).compare(writer.buffer),
      0
    )

    res = new IntermediateResponse({
      messageId: 2,
      responseValue: 'foo'
    })
    writer = new BerWriter()
    res._toBer(writer)

    t.equal(
      Buffer.from(intermediateResponseNoNameBytes.slice(5)).compare(writer.buffer),
      0
    )
  })

  t.end()
})

tap.test('_pojo', t => {
  t.test('returns a pojo representation', async t => {
    const req = new IntermediateResponse({
      responseName: '1.2.3',
      responseValue: 'foo'
    })
    t.strictSame(req._pojo(), {
      responseName: '1.2.3',
      responseValue: 'foo'
    })
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('throws if operation incorrect', async t => {
    const reqBuffer = Buffer.from(intermediateResponseBytes)
    reqBuffer[5] = 0x61

    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    t.throws(
      () => IntermediateResponse.parseToPojo(reader),
      Error('found wrong protocol operation: 0x61')
    )
  })

  t.test('returns a pojo representation', async t => {
    let reqBuffer = Buffer.from(intermediateResponseBytes)
    let reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    let pojo = IntermediateResponse.parseToPojo(reader)
    t.equal(pojo.protocolOp, operations.LDAP_RES_INTERMEDIATE)
    t.equal(pojo.responseName, '1.2.3')
    t.equal(pojo.responseValue, 'foo')

    reqBuffer = Buffer.from(intermediateResponseNoNameBytes)
    reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()
    pojo = IntermediateResponse.parseToPojo(reader)
    t.equal(pojo.responseName, undefined)
    t.equal(pojo.responseValue, 'foo')
  })

  t.end()
})
