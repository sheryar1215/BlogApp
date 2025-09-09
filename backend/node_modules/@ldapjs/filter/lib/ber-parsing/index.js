'use strict'

const { search } = require('@ldapjs/protocol')

const FILTERS = {
  [search.FILTER_AND]: require('../filters/and'),
  [search.FILTER_APPROX]: require('../filters/approximate'),
  [search.FILTER_EQUALITY]: require('../filters/equality'),
  [search.FILTER_EXT]: require('../filters/extensible'),
  [search.FILTER_GE]: require('../filters/greater-than-equals'),
  [search.FILTER_LE]: require('../filters/less-than-equals'),
  [search.FILTER_NOT]: require('../filters/not'),
  [search.FILTER_OR]: require('../filters/or'),
  [search.FILTER_PRESENT]: require('../filters/presence'),
  [search.FILTER_SUBSTRINGS]: require('../filters/substring')
}

/**
 * Reads a buffer that is encoded BER data and returns the appropriate
 * filter that it represents.
 *
 * @param {BerReader} ber The BER buffer to parse.
 *
 * @returns {FilterString}
 *
 * @throws If input is not of correct type or there is an error is parsing.
 */
module.exports = function parseBer (ber) {
  if (Object.prototype.toString.call(ber) !== '[object BerReader]') {
    throw new TypeError('ber (BerReader) required')
  }

  return _parse(ber)
}

function _parse (ber) {
  let f

  const filterStartOffset = ber.offset
  const type = ber.readSequence()
  switch (type) {
    case search.FILTER_AND:
    case search.FILTER_OR: {
      f = new FILTERS[type]()
      parseSet(f)
      break
    }

    case search.FILTER_NOT: {
      const innerFilter = _parse(ber)
      f = new FILTERS[type]({ filter: innerFilter })
      break
    }

    case search.FILTER_APPROX:
    case search.FILTER_EQUALITY:
    case search.FILTER_EXT:
    case search.FILTER_GE:
    case search.FILTER_LE:
    case search.FILTER_PRESENT:
    case search.FILTER_SUBSTRINGS: {
      f = FILTERS[type].parse(getBerBuffer(ber))
      break
    }

    default: {
      throw Error(
        'invalid search filter type: 0x' + type.toString(16).padStart(2, '0')
      )
    }
  }

  return f

  function parseSet (f) {
    const end = ber.offset + ber.length
    while (ber.offset < end) {
      const parsed = _parse(ber)
      f.addClause(parsed)
    }
  }

  function getBerBuffer (inputBer) {
    // Since our new filter code does not allow "empty" constructors,
    // we need to pass a BER into the filter's `.parse` method in order
    // to get a new instance. In order to do that, we need to read the
    // full BER section of the buffer for the filter. When we enter this
    // function, the tag and length has already been read in order to determine
    // what type of filter is being constructed. Since need those bytes to
    // construct a valid TLV buffer, we must rewind the offset by 2 bytes.
    ber.setOffset(filterStartOffset)

    // Next, we need the tag so that we can supply it to the raw buffer read
    // method.
    const tag = inputBer.peek()

    // We must advance the internal offset of the passed in BER here.
    // Again, this is due to the original side effect reliant nature of
    // ldapjs.
    return inputBer.readRawBuffer(tag)
  }
}
