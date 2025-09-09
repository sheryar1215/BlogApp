'use strict'

const tap = require('tap')
const { BerReader } = require('@ldapjs/asn1')
const parseToMessage = require('./parse-to-message')

const messageBytesArrays = require('./messages/_fixtures/message-byte-arrays')

tap.test('throws if input not a BerReader', async t => {
  const input = Buffer.from([0x30, 0x01, 0x64])
  t.throws(
    () => parseToMessage(input),
    Error('Expected BerReader but got [object Uint8Array]')
  )
})

tap.test('throws if sequence is invalid', async t => {
  const input = new BerReader(Buffer.from([0x0a, 0x01, 0x64]))
  t.throws(
    () => parseToMessage(input),
    Error('Expected 0x02: got 0x64')
  )
})

tap.test('parses messages correctly', async t => {
  for (const [name, messageBytes] of Object.entries(messageBytesArrays)) {
    t.comment(`verifying message bytes: ${name}`)
    const expected = Buffer.from(messageBytes)
    const reader = new BerReader(expected)
    const message = parseToMessage(reader)
    const found = message.toBer().buffer
    const isEqual = t.equal(expected.compare(found), 0, `${name} comparison`)

    if (isEqual === false) {
      const diff = {}
      for (let i = 0; i < expected.length; i += 1) {
        if (expected[i] !== found[i]) {
          diff[i] = {
            expected: Number(expected[i]).toString(16),
            found: Number(found[i]).toString(16)
          }
        }
      }
      t.fail(`${name} differs`, diff)
    }
  }
})

tap.test('parses search req with evolution filter', async t => {
  const messageBytes = require('./_fixtures/evolution-filter-req')
  const messageBuffer = Buffer.from(messageBytes)
  const message = parseToMessage(new BerReader(messageBuffer))
  t.equal(messageBuffer.compare(message.toBer().buffer), 0)
})
