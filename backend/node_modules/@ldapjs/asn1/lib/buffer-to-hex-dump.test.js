'use strict'

const tap = require('tap')
const path = require('path')
const { Writable } = require('stream')
const { tmpdir } = require('os')
const { randomUUID } = require('crypto')
const { readFile, rm } = require('fs/promises')
const { setTimeout } = require('timers/promises')
const bufferToHexDump = require('./buffer-to-hex-dump')

const input = Buffer.from([
  0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09,
  0x0a, 0x0b, 0x0c
])

tap.test('writes to stream', t => {
  const expected = [
    '[0x00, 0x01, 0x02, 0x03, \n',
    '0x04, 0x05, 0x06, 0x07, \n',
    '0x08, 0x09, 0x0a, 0x0b, \n',
    '0x0c]'
  ].join('')

  let found = ''
  const destination = new Writable({
    write (chunk, encoding, callback) {
      found += chunk.toString()
      callback()
    }
  })

  destination.on('finish', () => {
    t.equal(found, expected)
    t.end()
  })

  bufferToHexDump({
    buffer: input,
    prefix: '0x',
    separator: ', ',
    wrapCharacters: ['[', ']'],
    width: 4,
    closeDestination: true,
    destination
  })
})

tap.test('writes to file', async t => {
  const expected = [
    '00010203\n',
    '04050607\n',
    '08090a0b\n',
    '0c'
  ].join('')
  const destination = path.join(tmpdir(), randomUUID())

  t.teardown(async () => {
    await rm(destination)
  })

  bufferToHexDump({
    buffer: input,
    width: 4,
    destination
  })

  // Give a little time for the write stream to create and
  // close the file.
  await setTimeout(100)

  const contents = await readFile(destination)
  t.equal(contents.toString(), expected)
})
