'use strict'

const types = require('./types')
const bufferToHexDump = require('../buffer-to-hex-dump')

/**
 * Given a buffer of ASN.1 data encoded according to Basic Encoding Rules (BER),
 * the reader provides methods for iterating that data and decoding it into
 * regular JavaScript types.
 */
class BerReader {
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
   * An ASN.1 field consists of a tag, a length, and a value. This property
   * records the length of the current field.
   *
   * @type {number}
   */
  #currentFieldLength = 0

  /**
   * Records the offset in the buffer where the most recent {@link readSequence}
   * was invoked. This is used to facilitate slicing of whole sequences from
   * the buffer as a new {@link BerReader} instance.
   *
   * @type {number}
   */
  #currentSequenceStart = 0

  /**
   * As the BER buffer is read, this property records the current position
   * in the buffer.
   *
   * @type {number}
   */
  #offset = 0

  /**
   * @param {Buffer} buffer
   */
  constructor (buffer) {
    if (Buffer.isBuffer(buffer) === false) {
      throw TypeError('Must supply a Buffer instance to read.')
    }

    this.#buffer = buffer.subarray(0)
    this.#size = this.#buffer.length
  }

  get [Symbol.toStringTag] () { return 'BerReader' }

  /**
   * Get a buffer that represents the underlying data buffer.
   *
   * @type {Buffer}
   */
  get buffer () {
    return this.#buffer.subarray(0)
  }

  /**
   * The length of the current field being read.
   *
   * @type {number}
   */
  get length () {
    return this.#currentFieldLength
  }

  /**
   * Current read position in the underlying data buffer.
   *
   * @type {number}
   */
  get offset () {
    return this.#offset
  }

  /**
   * The number of bytes remaining in the backing buffer that have not
   * been read.
   *
   * @type {number}
   */
  get remain () {
    return this.#size - this.#offset
  }

  /**
   * Read the next byte in the buffer without advancing the offset.
   *
   * @return {number | null} The next byte or null if not enough data.
   */
  peek () {
    return this.readByte(true)
  }

  /**
   * Reads a boolean from the current offset and advances the offset.
   *
   * @param {number} [tag] The tag number that is expected to be read.
   *
   * @returns {boolean} True if the tag value represents `true`, otherwise
   * `false`.
   *
   * @throws When there is an error reading the tag.
   */
  readBoolean (tag = types.Boolean) {
    const intBuffer = this.readTag(tag)
    this.#offset += intBuffer.length
    const int = parseIntegerBuffer(intBuffer)

    return (int !== 0)
  }

  /**
   * Reads a single byte and advances offset; you can pass in `true` to make
   * this a "peek" operation (i.e. get the byte, but don't advance the offset).
   *
   * @param {boolean} [peek=false] `true` means don't move the offset.
   * @returns {number | null} The next byte, `null` if not enough data.
   */
  readByte (peek = false) {
    if (this.#size - this.#offset < 1) {
      return null
    }

    const byte = this.#buffer[this.#offset] & 0xff

    if (peek !== true) {
      this.#offset += 1
    }

    return byte
  }

  /**
   * Reads an enumeration (integer) from the current offset and advances the
   * offset.
   *
   * @returns {number} The integer represented by the next sequence of bytes
   * in the buffer from the current offset. The current offset must be at a
   * byte whose value is equal to the ASN.1 enumeration tag.
   *
   * @throws When there is an error reading the tag.
   */
  readEnumeration () {
    const intBuffer = this.readTag(types.Enumeration)
    this.#offset += intBuffer.length

    return parseIntegerBuffer(intBuffer)
  }

  /**
   * Reads an integer from the current offset and advances the offset.
   *
   * @param {number} [tag] The tag number that is expected to be read.
   *
   * @returns {number} The integer represented by the next sequence of bytes
   * in the buffer from the current offset. The current offset must be at a
   * byte whose value is equal to the ASN.1 integer tag.
   *
   * @throws When there is an error reading the tag.
   */
  readInt (tag = types.Integer) {
    const intBuffer = this.readTag(tag)
    this.#offset += intBuffer.length

    return parseIntegerBuffer(intBuffer)
  }

  /**
   * Reads a length value from the BER buffer at the given offset. This
   * method is not really meant to be called directly, as callers have to
   * manipulate the internal buffer afterwards.
   *
   * This method does not advance the reader offset.
   *
   * As a result of this method, the `.length` property can be read for the
   * current field until another method invokes `readLength`.
   *
   * Note: we only support up to 4 bytes to describe the length of a value.
   *
   * @param {number} [offset] Read a length value starting at the specified
   * position in the underlying buffer.
   *
   * @return {number | null} The position the buffer should be advanced to in
   * order for the reader to be at the start of the value for the field. See
   * {@link setOffset}. If the offset, or length, exceeds the size of the
   * underlying buffer, `null` will be returned.
   *
   * @throws When an unsupported length value is encountered.
   */
  readLength (offset) {
    if (offset === undefined) { offset = this.#offset }

    if (offset >= this.#size) { return null }

    let lengthByte = this.#buffer[offset++] & 0xff
    // TODO: we are commenting this out because it seems to be unreachable.
    // It is not clear to me how we can ever check `lenB === null` as `null`
    // is a primitive type, and seemingly cannot be represented by a byte.
    // If we find that removal of this line does not affect the larger suite
    // of ldapjs tests, we should just completely remove it from the code.
    /* if (lenB === null) { return null } */

    if ((lengthByte & 0x80) === 0x80) {
      lengthByte &= 0x7f

      // https://www.rfc-editor.org/rfc/rfc4511.html#section-5.1 prohibits
      // indefinite form (0x80).
      if (lengthByte === 0) { throw Error('Indefinite length not supported.') }

      // We only support up to 4 bytes to describe encoding length. So the only
      // valid indicators are 0x81, 0x82, 0x83, and 0x84.
      if (lengthByte > 4) { throw Error('Encoding too long.') }

      if (this.#size - offset < lengthByte) { return null }

      this.#currentFieldLength = 0
      for (let i = 0; i < lengthByte; i++) {
        this.#currentFieldLength = (this.#currentFieldLength << 8) +
          (this.#buffer[offset++] & 0xff)
      }
    } else {
    // Wasn't a variable length
      this.#currentFieldLength = lengthByte
    }

    return offset
  }

  /**
   * At the current offset, read the next tag, length, and value as an
   * object identifier (OID) and return the OID string.
   *
   * @param {number} [tag] The tag number that is expected to be read.
   *
   * @returns {string | null} Will return `null` if the buffer is an invalid
   * length. Otherwise, returns the OID as a string.
   */
  readOID (tag = types.OID) {
    // See https://web.archive.org/web/20221008202056/https://learn.microsoft.com/en-us/windows/win32/seccertenroll/about-object-identifier?redirectedfrom=MSDN
    const oidBuffer = this.readString(tag, true)
    if (oidBuffer === null) { return null }

    const values = []
    let value = 0

    for (let i = 0; i < oidBuffer.length; i++) {
      const byte = oidBuffer[i] & 0xff

      value <<= 7
      value += byte & 0x7f
      if ((byte & 0x80) === 0) {
        values.push(value)
        value = 0
      }
    }

    value = values.shift()
    values.unshift(value % 40)
    values.unshift((value / 40) >> 0)

    return values.join('.')
  }

  /**
   * Get a new {@link Buffer} instance that represents the full set of bytes
   * for a BER representation of a specified tag. For example, this is useful
   * when construction objects from an incoming LDAP message and the object
   * constructor can read a BER representation of itself to create a new
   * instance, e.g. when reading the filter section of a "search request"
   * message.
   *
   * @param {number} tag The expected tag that starts the TLV series of bytes.
   * @param {boolean} [advanceOffset=true] Indicates if the instance's internal
   * offset should be advanced or not after reading the buffer.
   *
   * @returns {Buffer|null} If there is a problem reading the buffer, e.g.
   * the number of bytes indicated by the length do not exist in the value, then
   * `null` will be returned. Otherwise, a new {@link Buffer} of bytes that
   * represents a full TLV.
   */
  readRawBuffer (tag, advanceOffset = true) {
    if (Number.isInteger(tag) === false) {
      throw Error('must specify an integer tag')
    }

    const foundTag = this.peek()
    if (foundTag !== tag) {
      const expected = tag.toString(16).padStart(2, '0')
      const found = foundTag.toString(16).padStart(2, '0')
      throw Error(`Expected 0x${expected}: got 0x${found}`)
    }

    const currentOffset = this.#offset
    const valueOffset = this.readLength(currentOffset + 1)
    if (valueOffset === null) { return null }
    const valueBytesLength = this.length

    const numTagAndLengthBytes = valueOffset - currentOffset

    // Buffer.subarray is not inclusive. We need to account for the
    // tag and length bytes.
    const endPos = currentOffset + valueBytesLength + numTagAndLengthBytes
    if (endPos > this.buffer.byteLength) {
      return null
    }
    const buffer = this.buffer.subarray(currentOffset, endPos)
    if (advanceOffset === true) {
      this.setOffset(currentOffset + (valueBytesLength + numTagAndLengthBytes))
    }

    return buffer
  }

  /**
   * At the current buffer offset, read the next tag as a sequence tag, and
   * advance the offset to the position of the tag of the first item in the
   * sequence.
   *
   * @param {number} [tag] The tag number that is expected to be read.
   *
   * @returns {number|null} The read sequence tag value. Should match the
   * function input parameter value.
   *
   * @throws If the `tag` does not match or if there is an error reading
   * the length of the sequence.
   */
  readSequence (tag) {
    const foundTag = this.peek()
    if (tag !== undefined && tag !== foundTag) {
      const expected = tag.toString(16).padStart(2, '0')
      const found = foundTag.toString(16).padStart(2, '0')
      throw Error(`Expected 0x${expected}: got 0x${found}`)
    }

    this.#currentSequenceStart = this.#offset
    const valueOffset = this.readLength(this.#offset + 1) // stored in `length`
    if (valueOffset === null) { return null }

    this.#offset = valueOffset
    return foundTag
  }

  /**
   * At the current buffer offset, read the next value as a string and advance
   * the offset.
   *
   * @param {number} [tag] The tag number that is expected to be read. Should
   * be `ASN1.String`.
   * @param {boolean} [asBuffer=false] When true, the raw buffer will be
   * returned. Otherwise, a native string.
   *
   * @returns {string | Buffer | null} Will return `null` if the buffer is
   * malformed.
   *
   * @throws If there is a problem reading the length.
   */
  readString (tag = types.OctetString, asBuffer = false) {
    const tagByte = this.peek()

    if (tagByte !== tag) {
      const expected = tag.toString(16).padStart(2, '0')
      const found = tagByte.toString(16).padStart(2, '0')
      throw Error(`Expected 0x${expected}: got 0x${found}`)
    }

    const valueOffset = this.readLength(this.#offset + 1) // stored in `length`
    if (valueOffset === null) { return null }
    if (this.length > this.#size - valueOffset) { return null }

    this.#offset = valueOffset

    if (this.length === 0) { return asBuffer ? Buffer.alloc(0) : '' }

    const str = this.#buffer.subarray(this.#offset, this.#offset + this.length)
    this.#offset += this.length

    return asBuffer ? str : str.toString('utf8')
  }

  /**
   * At the current buffer offset, read the next set of bytes represented
   * by the given tag, and return the resulting buffer. For example, if the
   * BER represents a sequence with a string "foo", i.e.
   * `[0x30, 0x05, 0x04, 0x03, 0x66, 0x6f, 0x6f]`, and the current offset is
   * `0`, then the result of `readTag(0x30)` is the buffer
   * `[0x04, 0x03, 0x66, 0x6f, 0x6f]`.
   *
   * @param {number} tag The tag number that is expected to be read.
   *
   * @returns {Buffer | null} The buffer representing the tag value, or null if
   * the buffer is in some way malformed.
   *
   * @throws When there is an error interpreting the buffer, or the buffer
   * is not formed correctly.
   */
  readTag (tag) {
    if (tag == null) {
      throw Error('Must supply an ASN.1 tag to read.')
    }

    const byte = this.peek()
    if (byte !== tag) {
      const tagString = tag.toString(16).padStart(2, '0')
      const byteString = byte.toString(16).padStart(2, '0')
      throw Error(`Expected 0x${tagString}: got 0x${byteString}`)
    }

    const fieldOffset = this.readLength(this.#offset + 1) // stored in `length`
    if (fieldOffset === null) { return null }

    if (this.length > this.#size - fieldOffset) { return null }
    this.#offset = fieldOffset

    return this.#buffer.subarray(this.#offset, this.#offset + this.length)
  }

  /**
   * Returns the current sequence as a new {@link BerReader} instance. This
   * method relies on {@link readSequence} having been invoked first. If it has
   * not been invoked, the returned reader will represent an undefined portion
   * of the underlying buffer.
   *
   * @returns {BerReader}
   */
  sequenceToReader () {
    // Represents the number of bytes that constitute the "length" portion
    // of the TLV tuple.
    const lengthValueLength = this.#offset - this.#currentSequenceStart
    const buffer = this.#buffer.subarray(
      this.#currentSequenceStart,
      this.#currentSequenceStart + (lengthValueLength + this.#currentFieldLength)
    )
    return new BerReader(buffer)
  }

  /**
   * Set the internal offset to a given position in the underlying buffer.
   * This method is to support manual advancement of the reader.
   *
   * @param {number} position
   *
   * @throws If the given `position` is not an integer.
   */
  setOffset (position) {
    if (Number.isInteger(position) === false) {
      throw Error('Must supply an integer position.')
    }
    this.#offset = position
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
}

/**
 * Given a buffer that represents an integer TLV, parse it and return it
 * as a decimal value. This accounts for signedness.
 *
 * @param {Buffer} integerBuffer
 *
 * @returns {number}
 */
function parseIntegerBuffer (integerBuffer) {
  let value = 0
  let i
  for (i = 0; i < integerBuffer.length; i++) {
    value <<= 8
    value |= (integerBuffer[i] & 0xff)
  }

  if ((integerBuffer[0] & 0x80) === 0x80 && i !== 4) { value -= (1 << (i * 8)) }

  return value >> 0
}

module.exports = BerReader
