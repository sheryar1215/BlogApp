'use strict'

const types = require('./types')
const bufferToHexDump = require('../buffer-to-hex-dump')

class BerWriter {
  /**
   * The source buffer as it was passed in when creating the instance.
   *
   * @type {Buffer}
   */
  #buffer

  /**
   * The total bytes in the backing buffer.
   *
   * @type {number}
   */
  #size

  /**
   * As the BER buffer is written, this property records the current position
   * in the buffer.
   *
   * @type {number}
   */
  #offset = 0

  /**
   * A list of offsets in the buffer where we need to insert sequence tag and
   * length pairs.
   */
  #sequenceOffsets = []

  /**
   * Coeffecient used when increasing the buffer to accomodate writes that
   * exceed the available space left in the buffer.
   *
   * @type {number}
   */
  #growthFactor

  constructor ({ size = 1024, growthFactor = 8 } = {}) {
    this.#buffer = Buffer.alloc(size)
    this.#size = this.#buffer.length
    this.#offset = 0
    this.#growthFactor = growthFactor
  }

  get [Symbol.toStringTag] () { return 'BerWriter' }

  get buffer () {
    // TODO: handle sequence check

    return this.#buffer.subarray(0, this.#offset)
  }

  /**
   * The size of the backing buffer.
   *
   * @return {number}
   */
  get size () {
    return this.#size
  }

  /**
   * Append a raw buffer to the current writer instance. No validation to
   * determine if the buffer represents a valid BER encoding is performed.
   *
   * @param {Buffer} buffer The buffer to append. If this is not a valid BER
   * sequence of data, it will invalidate the BER represented by the `BerWriter`.
   *
   * @throws If the input is not an instance of Buffer.
   */
  appendBuffer (buffer) {
    if (Buffer.isBuffer(buffer) === false) {
      throw Error('buffer must be an instance of Buffer')
    }
    this.#ensureBufferCapacity(buffer.length)
    buffer.copy(this.#buffer, this.#offset, 0, buffer.length)
    this.#offset += buffer.length
  }

  /**
   * Complete a sequence started with {@link startSequence}.
   *
   * @throws When the sequence is too long and would exceed the 4 byte
   * length descriptor limitation.
   */
  endSequence () {
    const sequenceStartOffset = this.#sequenceOffsets.pop()
    const start = sequenceStartOffset + 3
    const length = this.#offset - start

    if (length <= 0x7f) {
      this.#shift(start, length, -2)
      this.#buffer[sequenceStartOffset] = length
    } else if (length <= 0xff) {
      this.#shift(start, length, -1)
      this.#buffer[sequenceStartOffset] = 0x81
      this.#buffer[sequenceStartOffset + 1] = length
    } else if (length <= 0xffff) {
      this.#buffer[sequenceStartOffset] = 0x82
      this.#buffer[sequenceStartOffset + 1] = length >> 8
      this.#buffer[sequenceStartOffset + 2] = length
    } else if (length <= 0xffffff) {
      this.#shift(start, length, 1)
      this.#buffer[sequenceStartOffset] = 0x83
      this.#buffer[sequenceStartOffset + 1] = length >> 16
      this.#buffer[sequenceStartOffset + 2] = length >> 8
      this.#buffer[sequenceStartOffset + 3] = length
    } else {
      throw Error('sequence too long')
    }
  }

  /**
   * Write a sequence tag to the buffer and advance the offset to the starting
   * position of the value. Sequences must be completed with a subsequent
   * invocation of {@link endSequence}.
   *
   * @param {number} [tag=0x30] The tag to use for the sequence.
   *
   * @throws When the tag is not a number.
   */
  startSequence (tag = (types.Sequence | types.Constructor)) {
    if (typeof tag !== 'number') {
      throw TypeError('tag must be a Number')
    }

    this.writeByte(tag)
    this.#sequenceOffsets.push(this.#offset)
    this.#ensureBufferCapacity(3)
    this.#offset += 3
  }

  /**
   * @param {HexDumpParams} params The `buffer` parameter will be ignored.
   *
   * @see bufferToHexDump
   */
  toHexDump (params) {
    bufferToHexDump({
      ...params,
      buffer: this.buffer
    })
  }

  /**
   * Write a boolean TLV to the buffer.
   *
   * @param {boolean} boolValue
   * @param {tag} [number=0x01] A custom tag for the boolean.
   *
   * @throws When a parameter is of the wrong type.
   */
  writeBoolean (boolValue, tag = types.Boolean) {
    if (typeof boolValue !== 'boolean') {
      throw TypeError('boolValue must be a Boolean')
    }
    if (typeof tag !== 'number') {
      throw TypeError('tag must be a Number')
    }

    this.#ensureBufferCapacity(3)
    this.#buffer[this.#offset++] = tag
    this.#buffer[this.#offset++] = 0x01
    this.#buffer[this.#offset++] = boolValue === true ? 0xff : 0x00
  }

  /**
   * Write an arbitrary buffer of data to the backing buffer using the given
   * tag.
   *
   * @param {Buffer} buffer
   * @param {number} tag The tag to use for the ASN.1 TLV sequence.
   *
   * @throws When either input parameter is of the wrong type.
   */
  writeBuffer (buffer, tag) {
    if (typeof tag !== 'number') {
      throw TypeError('tag must be a Number')
    }
    if (Buffer.isBuffer(buffer) === false) {
      throw TypeError('buffer must be an instance of Buffer')
    }

    this.writeByte(tag)
    this.writeLength(buffer.length)
    this.#ensureBufferCapacity(buffer.length)
    buffer.copy(this.#buffer, this.#offset, 0, buffer.length)
    this.#offset += buffer.length
  }

  /**
   * Write a single byte to the backing buffer and advance the offset. The
   * backing buffer will be automatically expanded to accomodate the new byte
   * if no room in the buffer remains.
   *
   * @param {number} byte The byte to be written.
   *
   * @throws When the passed in parameter is not a `Number` (aka a byte).
   */
  writeByte (byte) {
    if (typeof byte !== 'number') {
      throw TypeError('argument must be a Number')
    }

    this.#ensureBufferCapacity(1)
    this.#buffer[this.#offset++] = byte
  }

  /**
   * Write an enumeration TLV to the buffer.
   *
   * @param {number} value
   * @param {number} [tag=0x0a] A custom tag for the enumeration.
   *
   * @throws When a passed in parameter is not of the correct type, or the
   * value requires too many bytes (must be <= 4).
   */
  writeEnumeration (value, tag = types.Enumeration) {
    if (typeof value !== 'number') {
      throw TypeError('value must be a Number')
    }
    if (typeof tag !== 'number') {
      throw TypeError('tag must be a Number')
    }
    this.writeInt(value, tag)
  }

  /**
   * Write an, up to 4 byte, integer TLV to the buffer.
   *
   * @param {number} intToWrite
   * @param {number} [tag=0x02]
   *
   * @throws When either parameter is not of the write type, or if the
   * integer consists of too many bytes.
   */
  writeInt (intToWrite, tag = types.Integer) {
    if (typeof intToWrite !== 'number') {
      throw TypeError('intToWrite must be a Number')
    }
    if (typeof tag !== 'number') {
      throw TypeError('tag must be a Number')
    }

    let intSize = 4
    while (
      (
        ((intToWrite & 0xff800000) === 0) ||
        ((intToWrite & 0xff800000) === (0xff800000 >> 0))
      ) && (intSize > 1)
    ) {
      intSize--
      intToWrite <<= 8
    }

    // TODO: figure out how to cover this in a test.
    /* istanbul ignore if: needs test */
    if (intSize > 4) {
      throw Error('BER ints cannot be > 0xffffffff')
    }

    this.#ensureBufferCapacity(2 + intSize)
    this.#buffer[this.#offset++] = tag
    this.#buffer[this.#offset++] = intSize

    while (intSize-- > 0) {
      this.#buffer[this.#offset++] = ((intToWrite & 0xff000000) >>> 24)
      intToWrite <<= 8
    }
  }

  /**
   * Write a set of length bytes to the backing buffer. Per
   * https://www.rfc-editor.org/rfc/rfc4511.html#section-5.1, LDAP message
   * BERs prohibit greater than 4 byte lengths. Given we are supporing
   * the `ldapjs` module, we limit ourselves to 4 byte lengths.
   *
   * @param {number} len The length value to write to the buffer.
   *
   * @throws When the length is not a number or requires too many bytes.
   */
  writeLength (len) {
    if (typeof len !== 'number') {
      throw TypeError('argument must be a Number')
    }

    this.#ensureBufferCapacity(4)

    if (len <= 0x7f) {
      this.#buffer[this.#offset++] = len
    } else if (len <= 0xff) {
      this.#buffer[this.#offset++] = 0x81
      this.#buffer[this.#offset++] = len
    } else if (len <= 0xffff) {
      this.#buffer[this.#offset++] = 0x82
      this.#buffer[this.#offset++] = len >> 8
      this.#buffer[this.#offset++] = len
    } else if (len <= 0xffffff) {
      this.#buffer[this.#offset++] = 0x83
      this.#buffer[this.#offset++] = len >> 16
      this.#buffer[this.#offset++] = len >> 8
      this.#buffer[this.#offset++] = len
    } else {
      throw Error('length too long (> 4 bytes)')
    }
  }

  /**
   * Write a NULL tag and value to the buffer.
   */
  writeNull () {
    this.writeByte(types.Null)
    this.writeByte(0x00)
  }

  /**
   * Given an OID string, e.g. `1.2.840.113549.1.1.1`, split it into
   * octets, encode the octets, and write it to the backing buffer.
   *
   * @param {string} oidString
   * @param {number} [tag=0x06] A custom tag to use for the OID.
   *
   * @throws When the parameters are not of the correct types, or if the
   * OID is not in the correct format.
   */
  writeOID (oidString, tag = types.OID) {
    if (typeof oidString !== 'string') {
      throw TypeError('oidString must be a string')
    }
    if (typeof tag !== 'number') {
      throw TypeError('tag must be a Number')
    }

    if (/^([0-9]+\.){3,}[0-9]+$/.test(oidString) === false) {
      throw Error('oidString is not a valid OID string')
    }

    const parts = oidString.split('.')
    const bytes = []
    bytes.push(parseInt(parts[0], 10) * 40 + parseInt(parts[1], 10))
    for (const part of parts.slice(2)) {
      encodeOctet(bytes, parseInt(part, 10))
    }

    this.#ensureBufferCapacity(2 + bytes.length)
    this.writeByte(tag)
    this.writeLength(bytes.length)
    this.appendBuffer(Buffer.from(bytes))

    function encodeOctet (bytes, octet) {
      if (octet < 128) {
        bytes.push(octet)
      } else if (octet < 16_384) {
        bytes.push((octet >>> 7) | 0x80)
        bytes.push(octet & 0x7F)
      } else if (octet < 2_097_152) {
        bytes.push((octet >>> 14) | 0x80)
        bytes.push(((octet >>> 7) | 0x80) & 0xFF)
        bytes.push(octet & 0x7F)
      } else if (octet < 268_435_456) {
        bytes.push((octet >>> 21) | 0x80)
        bytes.push(((octet >>> 14) | 0x80) & 0xFF)
        bytes.push(((octet >>> 7) | 0x80) & 0xFF)
        bytes.push(octet & 0x7F)
      } else {
        bytes.push(((octet >>> 28) | 0x80) & 0xFF)
        bytes.push(((octet >>> 21) | 0x80) & 0xFF)
        bytes.push(((octet >>> 14) | 0x80) & 0xFF)
        bytes.push(((octet >>> 7) | 0x80) & 0xFF)
        bytes.push(octet & 0x7F)
      }
    }
  }

  /**
   * Write a string TLV to the buffer.
   *
   * @param {string} stringToWrite
   * @param {number} [tag=0x04] The tag to use.
   *
   * @throws When either input parameter is of the wrong type.
   */
  writeString (stringToWrite, tag = types.OctetString) {
    if (typeof stringToWrite !== 'string') {
      throw TypeError('stringToWrite must be a string')
    }
    if (typeof tag !== 'number') {
      throw TypeError('tag must be a number')
    }

    const toWriteLength = Buffer.byteLength(stringToWrite)
    this.writeByte(tag)
    this.writeLength(toWriteLength)
    if (toWriteLength > 0) {
      this.#ensureBufferCapacity(toWriteLength)
      this.#buffer.write(stringToWrite, this.#offset)
      this.#offset += toWriteLength
    }
  }

  /**
   * Given a set of strings, write each as a string TLV to the buffer.
   *
   * @param {string[]} strings
   *
   * @throws When the input is not an array.
   */
  writeStringArray (strings) {
    if (Array.isArray(strings) === false) {
      throw TypeError('strings must be an instance of Array')
    }
    for (const string of strings) {
      this.writeString(string)
    }
  }

  /**
   * Given a number of bytes to be written into the buffer, verify the buffer
   * has enough free space. If not, allocate a new buffer, copy the current
   * backing buffer into the new buffer, and promote the new buffer to be the
   * current backing buffer.
   *
   * @param {number} numberOfBytesToWrite How many bytes are required to be
   * available for writing in the backing buffer.
   */
  #ensureBufferCapacity (numberOfBytesToWrite) {
    if (this.#size - this.#offset < numberOfBytesToWrite) {
      let newSize = this.#size * this.#growthFactor
      if (newSize - this.#offset < numberOfBytesToWrite) {
        newSize += numberOfBytesToWrite
      }

      const newBuffer = Buffer.alloc(newSize)

      this.#buffer.copy(newBuffer, 0, 0, this.#offset)
      this.#buffer = newBuffer
      this.#size = newSize
    }
  }

  /**
   * Shift a region of the buffer indicated by `start` and `length` a number
   * of bytes indicated by `shiftAmount`.
   *
   * @param {number} start The starting position in the buffer for the region
   * of bytes to be shifted.
   * @param {number} length The number of bytes that constitutes the region
   * of the buffer to be shifted.
   * @param {number} shiftAmount The number of bytes to shift the region by.
   * This may be negative.
   */
  #shift (start, length, shiftAmount) {
    // TODO: this leaves garbage behind. We should either zero out the bytes
    // left behind, or device a better algorightm that generates a clean
    // buffer.
    this.#buffer.copy(this.#buffer, start + shiftAmount, start, start + length)
    this.#offset += shiftAmount
  }
}

module.exports = BerWriter
