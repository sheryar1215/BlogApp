'use strict'

/**
 * Represents an EXTENSION response that is for a password change
 * without providing a new one (server generates password).
 * Taken from https://web.archive.org/web/20220518193613/https://nawilson.com/ldapv3-wire-protocol-reference-extended/
 */
module.exports.withGeneratedPasswordBytes = [
  0x30, 0x2f, // start sequence, 47 bytes
  0x02, 0x01, 0x01, // message ID (integer value 1)
  0x78, 0x2a, // protocol op (0x78), 42 bytes
  0x0a, 0x01, 0x00, // success result code (enumerated value 0)
  0x04, 0x00, // no matched DN (0-byte octet string)
  0x04, 0x00, // no diagnostic message (0-byte octet string)

  0x8b, 0x21, // sequence (response value), 33 bytes
  0x30, 0x1f, // sequence, 31 bytes

  0x80, 0x1d, // extension specific string, 29 bytes
  // "AdapterStevensonGrainPlaymate"
  0x41, 0x64, 0x61, 0x70, 0x74, 0x65, 0x72, 0x53,
  0x74, 0x65, 0x76, 0x65, 0x6e, 0x73, 0x6f, 0x6e,
  0x47, 0x72, 0x61, 0x69, 0x6e, 0x50, 0x6c, 0x61,
  0x79, 0x6d, 0x61, 0x74, 0x65
]

module.exports.basicResponse = [
  0x30, 0x0c, // start sequence, 47 bytes
  0x02, 0x01, 0x01, // message ID (integer value 1)
  0x78, 0x2a, // protocol op (0x78), 42 bytes
  0x0a, 0x01, 0x00, // success result code (enumerated value 0)
  0x04, 0x00, // no matched DN (0-byte octet string)
  0x04, 0x00 // no diagnostic message (0-byte octet string)
]
