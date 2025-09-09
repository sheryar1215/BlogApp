'use strict'

module.exports = escapeFilterValue

/**
 * Escapes LDAP filter attribute values. For example,
 * in the filter `(cn=föo)`, this function would be used
 * to encode `föo` to `f\c3\b6o`. Already encoded values
 * will be left intact.
 *
 * @param {string|Buffer} toEscape
 *
 * @returns {string}
 *
 * @see https://datatracker.ietf.org/doc/html/rfc4515
 */
function escapeFilterValue (toEscape) {
  if (typeof toEscape === 'string') {
    return escapeBuffer(Buffer.from(toEscape))
  }

  if (Buffer.isBuffer(toEscape)) {
    return escapeBuffer(toEscape)
  }

  throw Error('toEscape must be a string or a Buffer')
}

function escapeBuffer (buf) {
  let result = ''
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] >= 0xc0 && buf[i] <= 0xdf) {
      // Represents the first byte in a 2-byte UTF-8 character.
      result += '\\' + buf[i].toString(16) + '\\' + buf[i + 1].toString(16)
      i += 1
      continue
    }

    if (buf[i] >= 0xe0 && buf[i] <= 0xef) {
      // Represents the first byte in a 3-byte UTF-8 character.
      result += [
        '\\', buf[i].toString(16),
        '\\', buf[i + 1].toString(16),
        '\\', buf[i + 2].toString(16)
      ].join('')
      i += 2
      continue
    }

    if (buf[i] <= 31) {
      // It's an ASCII control character so we will straight
      // encode it (excluding the "space" character).
      result += '\\' + buf[i].toString(16).padStart(2, '0')
      continue
    }

    const char = String.fromCharCode(buf[i])
    switch (char) {
      case '*': {
        result += '\\2a'
        break
      }

      case '(': {
        result += '\\28'
        break
      }

      case ')': {
        result += '\\29'
        break
      }

      case '\\': {
        // result += '\\5c'
        // It looks like we have encountered an already escaped sequence
        // of characters. So we will attempt to read that sequence as-is.
        const escapedChars = readEscapedCharacters(buf, i)
        i += escapedChars.length
        result += escapedChars.join('')
        break
      }

      default: {
        result += char
        break
      }
    }
  }
  return result
}

/**
 * In a buffer that represents a string with escaped character code
 * sequences, e.g. `'foo\\2a'`, read the escaped character code sequence
 * and return it as a string. If an invalid escape sequence is encountered,
 * it will be assumed that the sequence needs to be escaped and the returned
 * string will include the escaped sequence.
 *
 * @param {Buffer} buf
 * @param {number} start Starting offset of the escaped character sequence
 * in the buffer
 *
 * @returns {string}
 */
function readEscapedCharacters (buf, start) {
  const chars = []

  for (let i = start; ;) {
    if (buf[i] === undefined) {
      // The sequence was a terminating `\`. So we actually want
      // to escape it. Therefore, replace the read `\` with the
      // ecape sequence.
      chars[-1] = '\\5c'
      break
    }

    if (buf[i] === 0x5c) { // read `\` character
      chars.push('\\')
      i += 1
      continue
    }

    const strHexCode = String.fromCharCode(buf[i]) + String.fromCharCode(buf[i + 1])
    const hexCode = parseInt(strHexCode, 16)
    if (Number.isNaN(hexCode)) {
      // The next two bytes do not comprise a hex code. Therefore,
      // we really want to escape the previous `\` character and append
      // the next two characters.
      chars.push('5c' + strHexCode)
      break
    }

    if (hexCode >= 0xc0 && hexCode <= 0xdf) {
      // Handle 2-byte character code.
      chars.push(hexCode.toString(16).padEnd(2, '0'))
      for (let x = i + 2; x < i + 4; x += 1) {
        chars.push(String.fromCharCode(buf[x]))
      }
      break
    }

    if (hexCode >= 0xe0 && hexCode <= 0xef) {
      // Handle 3-byte character code.
      chars.push(hexCode.toString(16).padStart(2, '0'))
      for (let x = i + 2; x < i + 8; x += 1) {
        chars.push(String.fromCharCode(buf[x]))
      }
      break
    }

    // Single byte escaped code.
    chars.push(hexCode.toString(16).padStart(2, '0'))
    break
  }

  return chars
}
