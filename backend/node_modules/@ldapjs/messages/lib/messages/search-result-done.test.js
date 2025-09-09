'use strict'

const tap = require('tap')
const { BerReader } = require('@ldapjs/asn1')
const { operations } = require('@ldapjs/protocol')
const {
  searchResultDoneBytes
} = require('./_fixtures/message-byte-arrays')
const SearchResultDone = require('./search-result-done')

tap.test('basic', async t => {
  const res = new SearchResultDone()
  t.equal(res.protocolOp, operations.LDAP_RES_SEARCH_DONE)
  t.equal(res.type, 'SearchResultDone')
})

tap.test('toBer', t => {
  tap.test('returns basic bytes', async t => {
    const res = new SearchResultDone({ messageId: 2 })
    const ber = res.toBer()
    const expected = Buffer.from(searchResultDoneBytes)
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('parses a basic object', async t => {
    const bytes = searchResultDoneBytes.slice(5)
    const reader = new BerReader(Buffer.from(bytes))
    const pojo = SearchResultDone.parseToPojo(reader)
    t.strictSame(pojo, {
      status: 0,
      matchedDN: '',
      diagnosticMessage: '',
      referrals: []
    })
  })

  t.test('throws if protocol op is wrong', async t => {
    const bytes = searchResultDoneBytes.slice(5)
    bytes[0] = 0x68
    const reader = new BerReader(Buffer.from(bytes))
    t.throws(
      () => SearchResultDone.parseToPojo(reader),
      Error('found wrong protocol operation: 0x68')
    )
  })

  t.end()
})
