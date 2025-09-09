'use strict'

const { BerReader, BerWriter } = require('@ldapjs/asn1')

/**
 * Baseline LDAP filter object. This exists solely to define the interface
 * and baseline properties and methods for actual LDAP filters.
 */
class FilterString {
  /**
   * The BER tag for the filter as defined in
   * https://datatracker.ietf.org/doc/html/rfc4511#section-4.5.1.
   */
  TAG = 0x30
  // For this base `FilterString` we repurpose the sequence start tag. We
  // represent it as a sequence that contains a null value.
  // So we do this because it is nonsense to have an empty filter string.

  /**
   * Local name of the filter.
   */
  type = 'FilterString'

  /**
   * String value denoting which LDAP attribute the filter targets. For example,
   * in the filter `(&(cn=Foo Bar))`, the value would be "cn".
   */
  attribute = ''

  #value

  #clauses = []

  /**
   * @typedef {object} FilterStringParams
   * @property {string} attribute The name of the attribute the filter
   * will target.
   * @property {*} value The right hand side of the filter.
   */

  /**
   * Creates a new filter object and sets the `attribute`.
   *
   * @param {FilterStringParams} input
   *
   * @returns {FilterString}
   */
  constructor ({ attribute = '', value, clauses = [] } = {}) {
    this.attribute = attribute
    this.#value = value

    if (Array.isArray(clauses) === false) {
      throw Error('clauses must be an array')
    }
    Array.prototype.push.apply(this.#clauses, clauses)
  }

  get [Symbol.toStringTag] () {
    return 'FilterString'
  }

  /**
   * String or Buffer representing the righthand side of the filter string.
   *
   * @property {string|Buffer} value
   */
  get value () {
    return this.#value
  }

  set value (val) {
    this.#value = val
  }

  /**
   * Determines if a filter instance meets specific criteria.
   * Each type of filter provides its own logic for this method.
   * Thus, the documentation for the method should be consulted on each
   * specific filter. This baseline implementation always returns `false`.
   *
   * @returns {boolean} Always `false`.
   */
  matches () {
    return false
  }

  /**
   * Generate a string representation of the filter.
   *
   * @returns {string}
   */
  toString () {
    return '()'
  }

  /**
   * Returns a BER instance of the filter. This is typically used when
   * constructing search messages to send to an LDAP server.
   *
   * @returns {object} A `BerReader` instance from `@ldapjs/asn1`.
   */
  toBer () {
    const ber = new BerWriter()

    ber.startSequence(this.TAG)
    this._toBer(ber)
    ber.endSequence()

    return new BerReader(ber.buffer)
  }

  _toBer (ber) {
    ber.writeNull()
  }

  /**
   * Get a "JSON" (plain JavaScript object) representation of the filter.
   * Do not rely on this property to exist.
   *
   * @deprecated 2022-06-12
   * @property {object}
   */
  get json () {
    return {
      type: this.type,
      attribute: this.attribute,
      value: this.#value
    }
  }

  /**
   * Alias for the filter itself. This is added for backward compatibility.
   * Do not rely on this property.
   *
   * @deprecated 2022-06-12
   * @property {FilterString}
   */
  get filter () {
    return this
  }

  /**
   * Alias for accessing the filter clauses. This is added for backward
   * compatibility. Do not rely on this property.
   *
   * @deprecated 2022-06-12
   * @property {FilterString[]}
   */
  get filters () {
    return this.#clauses
  }

  /**
   * Most filters, e.g. "and" and "not" filters, can have multiple filter
   * clauses. For example, the filter `(&(foo=a)(bar=b))` is an "and" filter
   * with two clauses: `(foo=a)` and `(bar=b)`. This property provides access
   * to the sibling clauses, which are themselves `FilterString` instances.
   *
   * @property {FilterString[]}
   */
  get clauses () {
    return this.#clauses
  }

  /**
   * @callback filterForEachCallback
   * @param {FilterString}
   */
  /**
   * For every filter clause in the filter, apply a callback function.
   * This includes the root filter.
   *
   * @param {filterForEachCallback} callback
   */
  forEach (callback) {
    this.#clauses.forEach(clause => clause.forEach(callback))
    callback(this) // eslint-disable-line
  }

  /**
   * @callback filterMapCallback
   * @param {FilterString}
   */
  /**
   * For every filter clause in the filter, including the root filter,
   * apply a mutation callback.
   *
   * @param {filterMapCallback} callback
   * @returns {FilterString|*} The result of applying the callback to the
   * root filter.
   */
  map (callback) {
    if (this.#clauses.length === 0) {
      return callback(this) // eslint-disable-line
    }

    const child = this.#clauses
      .map(clause => clause.map(callback))
      .filter(clause => clause !== null)
    if (child.length === 0) {
      return null
    }
    this.#clauses = child
    return callback(this) // eslint-disable-line
  }

  /**
   * Alias for `.addClause`. This is added for backward compatibility.
   * Do not rely on this.
   *
   * @deprecated 2022-06-12
   * @param {FilterString} filter
   */
  addFilter (filter) {
    this.addClause(filter)
  }

  /**
   * Adds a new filter clause to the filter.
   *
   * @see clauses
   * @param {FilterString} clause
   */
  addClause (clause) {
    if (clause instanceof FilterString === false) {
      throw Error('clause must be an instance of FilterString')
    }
    this.#clauses.push(clause)
  }

  /**
   * Parses a `Buffer` instance and returns a new `FilterString` representation.
   * Each `FilterString` implementation must implement this method.
   *
   * @param {Buffer} buffer
   *
   * @throws When the input `buffer` does not match the expected format.
   *
   * @returns {FilterString}
   */
  static parse (buffer) {
    // It is actually nonsense to implement this method for the base
    // `FilteSring`, but we do it any way for completeness sake. We effectively
    // just validate that the input buffer is the one we expect for our made up
    // "empty" filter string and return a new instance if the buffer validates.

    if (buffer.length !== 4) {
      throw Error(`expected buffer length 4, got ${buffer.length}`)
    }

    const reader = new BerReader(buffer)
    let seq = reader.readSequence()
    if (seq !== 0x30) {
      throw Error(`expected sequence start, got 0x${seq.toString(16).padStart(2, '0')}`)
    }

    seq = reader.readSequence()
    if (seq !== 0x05) {
      throw Error(`expected null sequence start, got 0x${seq.toString(16).padStart(2, '0')}`)
    }

    return new FilterString()
  }
}

module.exports = FilterString
