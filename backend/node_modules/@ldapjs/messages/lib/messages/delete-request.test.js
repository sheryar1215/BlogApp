'use strict'

const tap = require('tap')
const { BerReader, BerWriter } = require('@ldapjs/asn1')
const { DN } = require('@ldapjs/dn')
const DeleteRequest = require('./delete-request')

tap.test('constructor', t => {
  t.test('no args', async t => {
    const req = new DeleteRequest()
    t.strictSame(req.pojo, {
      messageId: 1,
      type: 'DeleteRequest',
      protocolOp: 0x4a,
      entry: null,
      controls: []
    })
  })

  t.test('with options', async t => {
    const req = new DeleteRequest({
      messageId: 5,
      entry: 'dc=example,dc=com'
    })
    t.strictSame(req.pojo, {
      messageId: 5,
      type: 'DeleteRequest',
      protocolOp: 0x4a,
      entry: 'dc=example,dc=com',
      controls: []
    })

    t.equal(req._dn.toString(), 'dc=example,dc=com')
    t.equal(req.entry.toString(), 'dc=example,dc=com')
    t.equal(req.type, 'DeleteRequest')
  })

  t.end()
})

tap.test('.entry', t => {
  t.test('sets/gets', async t => {
    const req = new DeleteRequest()
    t.equal(req.entry, null)
    t.equal(req._dn, null)

    req.entry = 'cn=foo'
    t.equal(req.entry.toString(), 'cn=foo')
    t.equal(req._dn.toString(), 'cn=foo')

    req.entry = DN.fromString('sn=bar')
    t.equal(req.entry.toString(), 'sn=bar')
  })

  t.test('throws for bad value', async t => {
    const req = new DeleteRequest()
    t.throws(
      () => {
        req.entry = { cn: 'foo' }
      },
      'entry must be a valid DN string or instance of LdapDn'
    )
  })

  t.end()
})

tap.test('_toBer', t => {
  t.test('writes a correct sequence', async t => {
    const req = new DeleteRequest({ entry: 'cn=foo' })
    const ber = new BerWriter()
    req._toBer(ber)

    const expected = Buffer.from([
      0x4a, 0x06, 0x63, 0x6e,
      0x3d, 0x66, 0x6f, 0x6f
    ])
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.end()
})

tap.test('_pojo', t => {
  t.test('returns implementation properties', async t => {
    const req = new DeleteRequest({ entry: 'cn=foo' })
    t.strictSame(req._pojo(), {
      protocolOp: 0x4a,
      entry: 'cn=foo'
    })
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('throws if tag is wrong', async t => {
    const input = Buffer.from([0x4b, 0x03, 0x66, 0x6f, 0x6f])
    t.throws(
      () => DeleteRequest.parseToPojo(new BerReader(input)),
      Error('found wrong protocol operation: 0x4b')
    )
  })

  t.test('returns a pojo', async t => {
    const input = Buffer.from([0x4a, 0x03, 0x66, 0x6f, 0x6f])
    const pojo = DeleteRequest.parseToPojo(new BerReader(input))
    t.strictSame(pojo, {
      protocolOp: 0x4a,
      entry: 'foo'
    })
  })

  t.end()
})
