'use strict'

const FilterString = require('../filter-string')
const { search } = require('@ldapjs/protocol')

/**
 * Represents a set of filters that must all match for the filter to
 * match, e.g. `(|(cn=foo)(sn=bar))`.
 */
class OrFilter extends FilterString {
  /**
   * @typedef {FilterStringParams} OrParams
   * @property {FilterString[]} [filters=[]] A set of filters which comprise
   * the clauses of the `OR` filter.
   */

  /**
   * @param {OrParams} input
   *
   * @throws When a filter is not an instance of {@link FilterString}.
   */
  constructor ({ filters = [] } = {}) {
    super({})

    // OR filters do not have an `attribute` property.
    this.attribute = undefined

    for (const filter of filters) {
      this.addClause(filter)
    }

    Object.defineProperties(this, {
      TAG: { value: search.FILTER_OR },
      type: { value: 'OrFilter' }
    })
  }

  get json () {
    return {
      type: this.type,
      filters: this.clauses.map(clause => clause.json)
    }
  }

  toString () {
    let result = '(|'
    for (const clause of this.clauses) {
      result += clause.toString()
    }
    result += ')'
    return result
  }

  /**
   * Determines if an object represents an equivalent filter instance.
   * Both the filter attribute and filter value must match the comparison
   * object. Any clause of the `OR` filter, that is all "sub filters", may
   * match for the result to be `true`.
   *
   * @example
   * const eqFilter = new EqualityFilter({ attribute: 'foo', value: 'bar' })
   * const filter = new OrFilter({ filters: [eqFilter] })
   * assert.equal(filter.matches({ foo: 'bar' }), true)
   *
   * @param {object} obj An object to check for match.
   * @param {boolean} [strictAttrCase=true] If `false`, "fOo" will match
   * "foo" in the attribute position (left hand side).
   *
   * @throws When input types are not correct.
   *
   * @returns {boolean}
   */
  matches (obj, strictAttrCase = true) {
    if (this.clauses.length === 0) {
      // https://datatracker.ietf.org/doc/html/rfc4526#section-2
      return false
    }

    for (const clause of this.clauses) {
      if (Array.isArray(obj) === true) {
        for (const attr of obj) {
          // For each passed in attribute, we need to determine if the current
          // clause matches the attribute name. If it does, we need to
          // determine if the values match.
          if (Object.prototype.toString.call(attr) !== '[object LdapAttribute]') {
            throw Error('array element must be an instance of LdapAttribute')
          }
          if (attr.type !== clause.attribute) {
            continue
          }
          if (clause.matches(attr, strictAttrCase) === true) {
            return true
          }
        }
      } else {
        if (clause.matches(obj, strictAttrCase) === true) {
          return true
        }
      }
    }

    return false
  }

  _toBer (ber) {
    for (const clause of this.clauses) {
      const filterBer = clause.toBer()
      ber.appendBuffer(filterBer.buffer)
    }
    return ber
  }

  /**
   * Parses a BER encoded `Buffer` and returns a new filter.
   *
   * @param {Buffer} buffer BER encoded buffer.
   *
   * @throws When the buffer does not start with the proper BER tag.
   *
   * @returns {OrFilter}
   */
  static parse (buffer) {
    const parseNestedFilter = require('./utils/parse-nested-filter')
    return parseNestedFilter({
      buffer,
      constructor: OrFilter,
      startTag: search.FILTER_OR
    })
  }
}

module.exports = OrFilter
