'use strict'

const tap = require('tap')
const { operations } = require('@ldapjs/protocol')
const ExtensionRequest = require('./extension-request')

const {
  extensionCancelRequestBytes,
  extensionNameAndValueRequestBytes,
  extensionNameAndNoValueRequestBytes,
  extensionChangePasswordRequestBytes,
  extensionChangePasswordWithNewPasswordBytes
} = require('./_fixtures/message-byte-arrays')
const { BerReader, BerWriter } = require('@ldapjs/asn1')

tap.test('basic', t => {
  t.test('constructor no args', async t => {
    const req = new ExtensionRequest()
    t.strictSame(req.pojo, {
      messageId: 1,
      protocolOp: operations.LDAP_REQ_EXTENSION,
      type: 'ExtensionRequest',
      requestName: '',
      requestValue: undefined,
      controls: []
    })
  })

  t.test('constructor with args', async t => {
    const req = new ExtensionRequest({
      requestName: 'foo',
      requestValue: 'bar'
    })
    t.strictSame(req.pojo, {
      messageId: 1,
      protocolOp: operations.LDAP_REQ_EXTENSION,
      type: 'ExtensionRequest',
      requestName: 'foo',
      requestValue: 'bar',
      controls: []
    })
  })

  t.test('.type', async t => {
    const req = new ExtensionRequest()
    t.equal(req.type, 'ExtensionRequest')
  })

  t.test('.dn', async t => {
    const req = new ExtensionRequest({ requestName: 'foo' })
    t.equal(req.dn, 'foo')
  })

  t.test('#recognizedOIDs returns map', async t => {
    const oids = ExtensionRequest.recognizedOIDs()
    t.type(oids, 'Map')
  })

  t.end()
})

tap.test('.name', t => {
  t.test('gets and sets', async t => {
    const req = new ExtensionRequest()
    t.equal(req.requestName, '')
    req.requestName = 'foo'
    t.equal(req.requestName, 'foo')
  })

  t.end()
})

tap.test('.value', t => {
  t.test('gets and sets', async t => {
    const req = new ExtensionRequest()
    t.equal(req.requestValue, undefined)
    req.requestValue = 'foo'
    t.equal(req.requestValue, 'foo')
  })

  t.end()
})

tap.test('_toBer', t => {
  t.test('converts simple instance to BER', async t => {
    const req = new ExtensionRequest({
      requestName: '1.3.6.1.1',
      requestValue: 'foobar'
    })
    const writer = new BerWriter()
    req._toBer(writer)

    t.equal(
      Buffer.from(extensionNameAndValueRequestBytes.slice(5)).compare(writer.buffer),
      0
    )
  })

  t.test('converts a simple instance with no value to BER', async t => {
    const req = new ExtensionRequest({ requestName: '1.3.6.1.1' })
    const writer = new BerWriter()
    req._toBer(writer)

    t.equal(
      Buffer.from(extensionNameAndNoValueRequestBytes.slice(5)).compare(writer.buffer),
      0
    )
  })

  t.test('converts a cancel request', async t => {
    const req = new ExtensionRequest({
      requestName: '1.3.6.1.1.8',
      requestValue: 1
    })
    const writer = new BerWriter()
    req._toBer(writer)

    t.equal(
      Buffer.from(extensionCancelRequestBytes.slice(5)).compare(writer.buffer),
      0
    )
  })

  t.test('converts a modify password request with userIdentity and oldPassword', async t => {
    const req = new ExtensionRequest({
      requestName: '1.3.6.1.4.1.4203.1.11.1',
      requestValue: {
        userIdentity: 'uid=jdoe,ou=People,dc=example,dc=com',
        oldPassword: 'secret123'
      }
    })
    const writer = new BerWriter()
    req._toBer(writer)

    t.equal(
      Buffer.from(extensionChangePasswordRequestBytes.slice(5)).compare(writer.buffer),
      0
    )
  })

  t.test('converts a modify password request with newPassword', async t => {
    const req = new ExtensionRequest({
      requestName: '1.3.6.1.4.1.4203.1.11.1',
      requestValue: {
        newPassword: 'secret123'
      }
    })
    const writer = new BerWriter()
    req._toBer(writer)

    t.equal(
      Buffer.from(extensionChangePasswordWithNewPasswordBytes.slice(5)).compare(writer.buffer),
      0
    )
  })

  t.end()
})

tap.test('_pojo', t => {
  t.test('returns a pojo representation', async t => {
    const req = new ExtensionRequest({
      requestName: 'foo',
      requestValue: 'bar'
    })
    t.strictSame(req._pojo(), {
      requestName: 'foo',
      requestValue: 'bar'
    })
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('throws if operation incorrect', async t => {
    const reqBuffer = Buffer.from(extensionNameAndValueRequestBytes)
    reqBuffer[5] = 0x61

    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    t.throws(
      () => ExtensionRequest.parseToPojo(reader),
      Error('found wrong protocol operation: 0x61')
    )
  })

  t.test('returns a pojo for a name only operation', async t => {
    const reqBuffer = Buffer.from(extensionNameAndNoValueRequestBytes)
    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    const pojo = ExtensionRequest.parseToPojo(reader)
    t.equal(pojo.requestName, '1.3.6.1.1')
    t.equal(pojo.requestValue, undefined)
  })

  t.test('returns a pojo for simple string name and value operation', async t => {
    const reqBuffer = Buffer.from(extensionNameAndValueRequestBytes)
    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    const pojo = ExtensionRequest.parseToPojo(reader)
    t.equal(pojo.requestName, '1.3.6.1.1')
    t.equal(pojo.requestValue, 'foobar')
  })

  t.test('returns pojo for a cancel request', async t => {
    const reqBuffer = Buffer.from(extensionCancelRequestBytes)
    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    const pojo = ExtensionRequest.parseToPojo(reader)
    t.equal(pojo.requestName, '1.3.6.1.1.8')
    t.equal(pojo.requestValue, 1)
  })

  t.test('returns a pojo for a modify password with user and old pass', async t => {
    const reqBuffer = Buffer.from(extensionChangePasswordRequestBytes)
    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    const pojo = ExtensionRequest.parseToPojo(reader)
    t.equal(pojo.requestName, '1.3.6.1.4.1.4203.1.11.1')
    t.strictSame(pojo.requestValue, {
      userIdentity: 'uid=jdoe,ou=People,dc=example,dc=com',
      oldPassword: 'secret123',
      newPassword: undefined
    })
  })

  t.test('returns a pojo for a modify password new pass', async t => {
    const reqBuffer = Buffer.from(extensionChangePasswordWithNewPasswordBytes)
    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    const pojo = ExtensionRequest.parseToPojo(reader)
    t.equal(pojo.requestName, '1.3.6.1.4.1.4203.1.11.1')
    t.strictSame(pojo.requestValue, {
      userIdentity: undefined,
      oldPassword: undefined,
      newPassword: 'secret123'
    })
  })

  t.end()
})
