'use strict'

const tap = require('tap')
const { operations } = require('@ldapjs/protocol')
const { BerReader, BerWriter } = require('@ldapjs/asn1')
const SearchResultReference = require('./search-result-reference')

const {
  searchResultReferenceBytes
} = require('./_fixtures/message-byte-arrays')

tap.test('basic', t => {
  t.test('constructor no args', async t => {
    const expected = {
      messageId: 1,
      protocolOp: operations.LDAP_RES_SEARCH_REF,
      type: 'SearchResultReference',
      uri: [],
      controls: []
    }

    const res = new SearchResultReference()
    t.strictSame(res.pojo, expected)

    t.equal(res.type, 'SearchResultReference')
  })

  t.test('constructor with args', async t => {
    const expected = {
      messageId: 1,
      protocolOp: operations.LDAP_RES_SEARCH_REF,
      type: 'SearchResultReference',
      uri: ['ldap://foo', 'ldap://bar'],
      controls: []
    }

    let res = new SearchResultReference({
      uri: ['ldap://foo', 'ldap://bar']
    })
    t.strictSame(res.pojo, expected)

    res = new SearchResultReference({
      uris: ['ldap://foo', 'ldap://bar']
    })
    t.strictSame(res.pojo, expected)
  })

  t.end()
})

tap.test('.uri/.uris', t => {
  t.test('sets/gets', async t => {
    const res = new SearchResultReference()
    t.strictSame(res.uri, [])
    t.strictSame(res.uris, [])

    res.uri = ['ldap://foo']
    t.strictSame(res.uri, ['ldap://foo'])

    res.uris = ['ldap://bar']
    t.strictSame(res.uris, ['ldap://bar'])
    t.strictSame(res.uri, ['ldap://bar'])
  })

  t.test('throws for bad input', async t => {
    const res = new SearchResultReference()
    const expected = Error('uri must be an array of strings')

    t.throws(
      () => {
        res.uri = 'ldap://foo'
      },
      expected
    )

    t.throws(
      () => {
        res.uris = 'ldap://foo'
      },
      expected
    )

    t.throws(
      () => {
        res.uri = ['ldap://foo', { foo: 'foo' }, 'ldap://bar']
      },
      expected
    )
  })

  t.end()
})

tap.test('_toBer', t => {
  tap.test('converts instance to BER', async t => {
    const res = new SearchResultReference({
      uri: [
        'ldap://ds1.example.com:389/dc=example,dc=com??sub?',
        'ldap://ds2.example.com:389/dc=example,dc=com??sub?'
      ]
    })
    const writer = new BerWriter()
    res._toBer(writer)

    t.equal(
      Buffer.from(searchResultReferenceBytes.slice(5)).compare(writer.buffer),
      0
    )
  })

  t.end()
})

tap.test('_pojo', t => {
  t.test('returns a pojo representation', async t => {
    const res = new SearchResultReference({
      uri: [
        'ldap://ds1.example.com:389/dc=example,dc=com??sub?',
        'ldap://ds2.example.com:389/dc=example,dc=com??sub?'
      ]
    })
    t.strictSame(res._pojo(), {
      uri: [
        'ldap://ds1.example.com:389/dc=example,dc=com??sub?',
        'ldap://ds2.example.com:389/dc=example,dc=com??sub?'
      ]
    })
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('throws if operation incorrect', async t => {
    const reqBuffer = Buffer.from(searchResultReferenceBytes)
    reqBuffer[5] = 0x61

    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    t.throws(
      () => SearchResultReference.parseToPojo(reader),
      Error('found wrong protocol operation: 0x61')
    )
  })

  t.test('returns a pojo representation', async t => {
    const reqBuffer = Buffer.from(searchResultReferenceBytes)
    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    const pojo = SearchResultReference.parseToPojo(reader)
    t.equal(pojo.protocolOp, operations.LDAP_RES_SEARCH_REF)
    t.equal(pojo.uri[0], 'ldap://ds1.example.com:389/dc=example,dc=com??sub?')
    t.equal(pojo.uri[1], 'ldap://ds2.example.com:389/dc=example,dc=com??sub?')
  })

  t.end()
})
