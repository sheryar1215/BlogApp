'use strict'

const { createWriteStream } = require('fs')

/**
 * @typedef {object} HexDumpParams
 * @property {Buffer} buffer The buffer instance to serialize into a hex dump.
 * @property {string} [prefix=''] A string to prefix each byte with, e.g.
 * `0x`.
 * @property {string} [separator=''] A string to separate each byte with, e.g.
 * `, '.
 * @property {string[]} [wrapCharacters=[]] A set of characters to wrap the
 * output with. For example, `wrapCharacters=['[', ']']` will start the hex
 * dump with `[` and end it with `]`.
 * @property {number} [width=10] How many bytes to write per line.
 * @property {WriteStream | string} [destination=process.stdout] Where to
 * write the serialized data. If a string is provided, it is assumed to be
 * the path to a file. This file will be completely overwritten.
 * @property {boolean} [closeDestination=false] Indicates whether the
 * `destination` should be closed when done. This _should_ be `true` when the
 * passed in `destination` is a stream that you control. If a string path is
 * supplied for the `destination`, this will automatically be handled.
 */

// We'd like to put this coverage directive after the doc block,
// but that confuses doc tooling (e.g. WebStorm).
/* istanbul ignore next: defaults don't need 100% coverage */
/**
 * Given a buffer of bytes, generate a hex dump that can be loaded later
 * or viewed in a hex editor (e.g. [Hex Fiend](https://hexfiend.com)).
 *
 * @param {HexDumpParams} params
 *
 * @throws When the destination cannot be accessed.
 */
module.exports = function bufferToHexDump ({
  buffer,
  prefix = '',
  separator = '',
  wrapCharacters = [],
  width = 10,
  destination = process.stdout,
  closeDestination = false
}) {
  let closeStream = closeDestination
  if (typeof destination === 'string') {
    destination = createWriteStream(destination)
    closeStream = true
  }

  if (wrapCharacters[0]) {
    destination.write(wrapCharacters[0])
  }

  for (const [i, byte] of buffer.entries()) {
    const outByte = Number(byte).toString(16).padStart(2, '0')
    destination.write(prefix + outByte)
    if (i !== buffer.byteLength - 1) {
      destination.write(separator)
    }
    if ((i + 1) % width === 0) {
      destination.write('\n')
    }
  }

  if (wrapCharacters[1]) {
    destination.write(wrapCharacters[1])
  }

  /* istanbul ignore else */
  if (closeStream === true) {
    destination.end()
  }
}
