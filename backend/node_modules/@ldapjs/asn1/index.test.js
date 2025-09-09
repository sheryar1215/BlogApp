'use strict'

const tap = require('tap')
const asn1 = require('./index')

tap.test('exports BerReader', async t => {
  const { BerReader } = asn1
  t.ok(BerReader)

  const reader = new BerReader(Buffer.from([0x00]))
  t.type(reader, BerReader)
  t.equal(Object.prototype.toString.call(reader), '[object BerReader]')
})

tap.test('exports BerTypes', async t => {
  const { BerTypes } = asn1
  t.type(BerTypes, Object)
  t.equal(BerTypes.LDAPSequence, 0x30)
})

tap.test('exports BerWriter', async t => {
  const { BerWriter } = asn1
  t.ok(BerWriter)

  const writer = new BerWriter()
  t.type(writer, BerWriter)
  t.equal(Object.prototype.toString.call(writer), '[object BerWriter]')
})
