'use strict'

const AndFilter = require('../filters/and')
const OrFilter = require('../filters/or')
const NotFilter = require('../filters/not')
const parseExpression = require('./parse-expression')

const unbalancedError = Error('unbalanced parentheses')

/**
 * @type {object} ParseFilterResult
 * @property {number} end The ending position of the most recent iteration
 * of the function.
 * @property {FilterString} filter The parsed filter instance.
 */

/**
 * Recursively parse an LDAP filter string into a set of {@link FilterString}
 * instances. For example, the filter `(&(cn=foo)(sn=bar))` will return an
 * {@link AndFilter} instance that has two {@link EqualityFilter} clauses.
 *
 * @param {string} inputString The filter string, including starting and ending
 * parentheticals, to parse.
 * @param {number} [start=0] The starting position in the string to start the
 * parsing from. Used during recursion when a new sub-expression is encounterd.
 *
 * @returns {ParseFilterResult}
 *
 * @throws When any error occurs during parsing.
 */
module.exports = function parseFilter (inputString, start = 0) {
  let cur = start
  const len = inputString.length
  let res
  let end
  let output
  const children = []

  if (inputString[cur++] !== '(') {
    throw Error('missing opening parentheses')
  }

  if (inputString[cur] === '&') {
    cur++
    if (inputString[cur] === ')') {
      output = new AndFilter({})
    } else {
      do {
        res = parseFilter(inputString, cur)
        children.push(res.filter)
        cur = res.end + 1
      } while (cur < len && inputString[cur] !== ')')

      output = new AndFilter({ filters: children })
    }
  } else if (inputString[cur] === '|') {
    cur++
    do {
      res = parseFilter(inputString, cur)
      children.push(res.filter)
      cur = res.end + 1
    } while (cur < len && inputString[cur] !== ')')

    output = new OrFilter({ filters: children })
  } else if (inputString[cur] === '!') {
    res = parseFilter(inputString, cur + 1)
    output = new NotFilter({ filter: res.filter })
    cur = res.end + 1
    if (inputString[cur] !== ')') {
      throw unbalancedError
    }
  } else {
    end = inputString.indexOf(')', cur)
    if (end === -1) {
      throw unbalancedError
    }

    output = parseExpression(inputString.substring(cur, end))
    cur = end
  }

  return {
    end: cur,
    filter: output
  }
}
