'use strict'

const tap = require('tap')
const Attribute = require('@ldapjs/attribute')
const { BerReader, BerWriter } = require('@ldapjs/asn1')
const { DN } = require('@ldapjs/dn')
const AddRequest = require('./add-request')

const { addRequestBytes } = require('./_fixtures/message-byte-arrays')

tap.test('basic', t => {
  t.test('constructor no args', async t => {
    const req = new AddRequest()
    t.strictSame(req.pojo, {
      messageId: 1,
      protocolOp: 0x68,
      type: 'AddRequest',
      entry: null,
      attributes: [],
      controls: []
    })
  })

  t.test('constructor with args', async t => {
    const req = new AddRequest({
      entry: 'dn=foo,dc=example,dc=com',
      attributes: [{
        type: 'cn',
        values: ['foo']
      }]
    })
    t.strictSame(req.pojo, {
      messageId: 1,
      protocolOp: 0x68,
      type: 'AddRequest',
      entry: 'dn=foo,dc=example,dc=com',
      attributes: [{
        type: 'cn',
        values: ['foo']
      }],
      controls: []
    })
  })

  t.end()
})

tap.test('.attributes', t => {
  t.test('returns a copy of the attributes', async t => {
    const inputAttrs = [{ type: 'cn', values: ['foo'] }]
    const req = new AddRequest({
      entry: 'cn=foo',
      attributes: inputAttrs
    })
    const attrs = req.attributes
    t.not(attrs, inputAttrs)
    t.equal(attrs.length, inputAttrs.length)
  })

  t.test('replaces attributes list', async t => {
    const req = new AddRequest({
      entry: 'cn=foo',
      attributes: [new Attribute({ type: 'cn', values: ['foo'] })]
    })
    t.strictSame(req.attributes[0].pojo, { type: 'cn', values: ['foo'] })

    req.attributes = [new Attribute({ type: 'sn', values: ['bar'] })]
    t.strictSame(req.attributes[0].pojo, { type: 'sn', values: ['bar'] })
  })

  t.test('throws if not an array', async t => {
    const input = { type: 'cn', values: ['foo'] }
    t.throws(
      () => new AddRequest({ entry: 'cn=foo', attributes: input }),
      Error('attrs must be an array')
    )
  })

  t.test('throws if attribute is invalid', async t => {
    const input = [{ type: 42, values: ['foo'] }]
    t.throws(
      () => new AddRequest({ entry: 'cn=foo', attributes: input }),
      Error('attr must be an Attribute instance or Attribute-like object')
    )
  })

  t.end()
})

tap.test('.entry', t => {
  t.test('gets and sets', async t => {
    let req = new AddRequest({ entry: 'cn=foo' })
    t.equal(req.entry.toString(), 'cn=foo')
    t.equal(req._dn.toString(), 'cn=foo')

    req.entry = 'sn=bar'
    t.equal(req.entry.toString(), 'sn=bar')
    t.equal(req._dn.toString(), 'sn=bar')

    req.entry = DN.fromString('cn=baz')
    t.equal(req.entry.toString(), 'cn=baz')

    req = new AddRequest()
    t.equal(req.entry, null)
  })

  t.test('throws for bad value', async t => {
    const req = new AddRequest()
    t.throws(
      () => {
        req.entry = { cn: 'foo' }
      },
      'entry must be a valid DN string or instance of LdapDn'
    )
  })

  t.end()
})

tap.test('addAttribute', t => {
  t.test('throws for invalid input', async t => {
    const req = new AddRequest({ entry: 'cn=foo' })
    t.throws(
      () => req.addAttribute({ type: 'foo', values: ['foo'] }),
      Error('attr must be an instance of Attribute')
    )
  })

  t.test('adds an attribute', async t => {
    const req = new AddRequest({ entry: 'cn=foo' })
    req.addAttribute(new Attribute({ type: 'bar', values: ['baz'] }))
    t.strictSame(req.pojo, {
      messageId: 1,
      protocolOp: 0x68,
      type: 'AddRequest',
      entry: 'cn=foo',
      attributes: [{
        type: 'bar',
        values: ['baz']
      }],
      controls: []
    })
  })

  t.end()
})

tap.test('attributeNames', t => {
  t.test('returns the names list', async t => {
    const req = new AddRequest({
      entry: 'cn=foo',
      attributes: [
        new Attribute({ type: 'bar' }),
        new Attribute({ type: 'baz' }),
        new Attribute({ type: 'foobar' }),
        new Attribute({ type: 'barfoo' })
      ]
    })
    t.strictSame(req.attributeNames(), [
      'bar',
      'baz',
      'foobar',
      'barfoo'
    ])
  })

  t.end()
})

tap.test('getAttribute', t => {
  t.test('throws for invalid parameter', async t => {
    const req = new AddRequest({ entry: 'cn=foo' })
    t.throws(
      () => req.getAttribute(42),
      Error('attributeName must be a string')
    )
  })

  t.test('returns null for not found', async t => {
    const req = new AddRequest({ entry: 'cn=foo' })
    t.equal(req.getAttribute('bar'), null)
  })

  t.test('returns the correct attribute', async t => {
    const req = new AddRequest({
      entry: 'cn=foo',
      attributes: [
        new Attribute({ type: 'bar' }),
        new Attribute({ type: 'baz', values: ['baz', 'baz', 'baz'] }),
        new Attribute({ type: 'foobar' }),
        new Attribute({ type: 'barfoo' })
      ]
    })
    const attr = req.getAttribute('baz')
    t.strictSame(attr.pojo, {
      type: 'baz',
      values: ['baz', 'baz', 'baz']
    })
  })

  t.end()
})

tap.test('indexOf', t => {
  t.test('throws for invalid parameter', async t => {
    const req = new AddRequest({ entry: 'cn=foo' })
    t.throws(
      () => req.indexOf(42),
      Error('attributeName must be a string')
    )
  })

  t.test('finds an attribute', async t => {
    const req = new AddRequest({
      entry: 'cn=foo',
      attributes: [
        new Attribute({ type: 'bar' }),
        new Attribute({ type: 'baz' }),
        new Attribute({ type: 'foobar' }),
        new Attribute({ type: 'barfoo' })
      ]
    })
    t.equal(req.indexOf('foobar'), 2)
  })

  t.test('returns for not found', async t => {
    const req = new AddRequest({
      entry: 'cn=foo',
      attributes: [
        new Attribute({ type: 'bar' }),
        new Attribute({ type: 'baz' }),
        new Attribute({ type: 'foobar' }),
        new Attribute({ type: 'barfoo' })
      ]
    })
    t.equal(req.indexOf('zifbang'), -1)
  })

  t.end()
})

tap.test('_toBer', t => {
  tap.test('converts instance to BER', async t => {
    const req = new AddRequest({
      entry: 'dc=example,dc=com',
      attributes: [
        new Attribute({ type: 'objectclass', values: ['top', 'domain'] }),
        new Attribute({ type: 'dc', values: ['example'] })
      ]
    })
    const writer = new BerWriter()
    req._toBer(writer)

    t.equal(
      Buffer.from(addRequestBytes.slice(5)).compare(writer.buffer),
      0
    )
  })

  t.end()
})

tap.test('_pojo', t => {
  t.test('returns a pojo representation', async t => {
    const req = new AddRequest({
      entry: 'cn=foo',
      attributes: [{ type: 'bar', values: ['baz'] }]
    })
    t.strictSame(req._pojo(), {
      entry: 'cn=foo',
      attributes: [{
        type: 'bar',
        values: ['baz']
      }]
    })
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('throws if operation incorrect', async t => {
    const reqBuffer = Buffer.from(addRequestBytes)
    reqBuffer[5] = 0x61

    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    t.throws(
      () => AddRequest.parseToPojo(reader),
      Error('found wrong protocol operation: 0x61')
    )
  })

  t.test('returns a pojo representation', async t => {
    const reqBuffer = Buffer.from(addRequestBytes)
    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    const pojo = AddRequest.parseToPojo(reader)
    t.equal(pojo.protocolOp, 0x68)
    t.equal(pojo.entry, 'dc=example,dc=com')
    t.strictSame(pojo.attributes[0].pojo, {
      type: 'objectclass',
      values: ['top', 'domain']
    })
    t.strictSame(pojo.attributes[1].pojo, {
      type: 'dc',
      values: ['example']
    })
  })

  t.end()
})
