'use strict'

const tap = require('tap')
const { operations } = require('@ldapjs/protocol')
const Attribute = require('@ldapjs/attribute')
const { DN } = require('@ldapjs/dn')
const { BerWriter, BerReader } = require('@ldapjs/asn1')
const SearchResultEntry = require('./search-result-entry')

const {
  searchResultEntryBytes,
  searchResultEntryNoValuesBytes
} = require('./_fixtures/message-byte-arrays')

tap.test('basic', t => {
  t.test('constructor no args', async t => {
    const res = new SearchResultEntry()
    t.strictSame(res.pojo, {
      messageId: 1,
      protocolOp: operations.LDAP_RES_SEARCH_ENTRY,
      type: 'SearchResultEntry',
      objectName: '',
      attributes: [],
      controls: []
    })

    t.equal(res.type, 'SearchResultEntry')
  })

  t.test('constructor with args', async t => {
    const res = new SearchResultEntry({
      objectName: 'dc=example,dc=com',
      attributes: [{ type: 'cn', values: ['foo'] }]
    })
    t.strictSame(res.pojo, {
      messageId: 1,
      protocolOp: operations.LDAP_RES_SEARCH_ENTRY,
      type: 'SearchResultEntry',
      objectName: 'dc=example,dc=com',
      attributes: [{ type: 'cn', values: ['foo'] }],
      controls: []
    })
  })

  t.end()
})

tap.test('.attributes', t => {
  t.test('sets/gets', async t => {
    const res = new SearchResultEntry()
    t.strictSame(res.attributes, [])

    res.attributes = [new Attribute({ type: 'cn', values: 'foo' })]
    t.strictSame(res.attributes, [new Attribute({ type: 'cn', values: 'foo' })])
  })

  t.test('rejects non-array', async t => {
    const res = new SearchResultEntry()
    t.throws(
      () => {
        res.attributes = { type: 'cn', values: ['foo'] }
      },
      'attrs must be an array'
    )
  })

  t.test('rejects non-attribute objects', async t => {
    const res = new SearchResultEntry()
    t.throws(
      () => {
        res.attributes = [{ foo: 'bar' }]
      },
      'attr must be an Attribute instance or Attribute-like object'
    )
  })

  t.end()
})

tap.test('.objectName', t => {
  t.test('sets/gets', async t => {
    const res = new SearchResultEntry()
    t.equal(res.objectName.toString(), '')
    t.equal(res._dn.toString(), '')

    res.objectName = 'cn=foo'
    t.equal(res.objectName.toString(), 'cn=foo')

    res.objectName = DN.fromString('sn=bar')
    t.equal(res.objectName.toString(), 'sn=bar')
  })

  t.test('throws for invalid value', async t => {
    const res = new SearchResultEntry()
    t.throws(
      () => {
        res.objectName = ['invalid input']
      },
      'objectName must be a DN string or instance of LdapDn'
    )
  })

  t.end()
})

tap.test('_toBer', t => {
  t.test('converts instance to BER', async t => {
    let res = new SearchResultEntry({
      objectName: 'dc=example,dc=com',
      attributes: [
        { type: 'objectClass', values: ['top', 'domain'] },
        { type: 'dc', values: ['example'] }
      ]
    })
    let writer = new BerWriter()
    res._toBer(writer)

    t.equal(
      Buffer.from(searchResultEntryBytes.slice(5)).compare(writer.buffer),
      0
    )

    res = new SearchResultEntry({
      objectName: 'dc=example,dc=com',
      attributes: [
        { type: 'objectClass', values: [] },
        { type: 'dc', values: [] }
      ]
    })
    writer = new BerWriter()
    res._toBer(writer)

    t.equal(
      Buffer.from(searchResultEntryNoValuesBytes.slice(5)).compare(writer.buffer),
      0
    )
  })

  t.end()
})

tap.test('_pojo', t => {
  t.test('returns a pojo representation', async t => {
    const req = new SearchResultEntry({
      objectName: 'cn=foo',
      attributes: [{ type: 'bar', values: ['baz'] }]
    })
    t.strictSame(req._pojo(), {
      objectName: 'cn=foo',
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
    const reqBuffer = Buffer.from(searchResultEntryBytes)
    reqBuffer[5] = 0x61

    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    t.throws(
      () => SearchResultEntry.parseToPojo(reader),
      Error('found wrong protocol operation: 0x61')
    )
  })

  t.test('returns a pojo representation', async t => {
    const reqBuffer = Buffer.from(searchResultEntryBytes)
    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    const pojo = SearchResultEntry.parseToPojo(reader)
    t.equal(pojo.protocolOp, operations.LDAP_RES_SEARCH_ENTRY)
    t.equal(pojo.objectName, 'dc=example,dc=com')
    t.strictSame(pojo.attributes[0].pojo, {
      type: 'objectClass',
      values: ['top', 'domain']
    })
    t.strictSame(pojo.attributes[1].pojo, {
      type: 'dc',
      values: ['example']
    })
  })

  t.end()
})
