'use strict'

const LdapMessage = require('../ldap-message')
const { operations, search } = require('@ldapjs/protocol')
const { DN } = require('@ldapjs/dn')
const filter = require('@ldapjs/filter')
const { BerReader, BerTypes } = require('@ldapjs/asn1')
const warning = require('../deprecations')

const recognizedScopes = new Map([
  ['base', [search.SCOPE_BASE_OBJECT, 'base']],
  ['single', [search.SCOPE_ONE_LEVEL, 'single', 'one']],
  ['subtree', [search.SCOPE_SUBTREE, 'subtree', 'sub']]
])
const scopeAliasToScope = alias => {
  alias = typeof alias === 'string' ? alias.toLowerCase() : alias
  if (recognizedScopes.has(alias)) {
    return recognizedScopes.get(alias)[0]
  }
  for (const value of recognizedScopes.values()) {
    if (value.includes(alias)) {
      return value[0]
    }
  }
  return undefined
}

const isValidAttributeString = str => {
  // special filter strings
  if (['*', '1.1', '+'].includes(str) === true) {
    return true
  }
  // "@<object_clas>"
  if (/^@[a-zA-Z][\w\d.-]*$/.test(str) === true) {
    return true
  }
  // ascii attribute names per RFC 4512 §2.5
  if (/^[a-zA-Z][\w\d.;-]*$/.test(str) === true) {
    return true
  }
  // Matches the non-standard `range=<low>-<high>` ActiveDirectory
  // extension as described in §3.1.1.3.1.3.3 (revision 57.0) of
  // https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-adts/d2435927-0999-4c62-8c6d-13ba31a52e1a.
  if (/^[a-zA-Z][\w\d.-]*(;[\w\d.-]+)*;range=\d+-(\d+|\*)(;[\w\d.-]+)*$/.test(str) === true) {
    return true
  }
  return false
}

/**
 * Implements the add request message as described in
 * https://www.rfc-editor.org/rfc/rfc4511.html#section-4.5.1.
 *
 * Various constants for searching and options can be used from the `search`
 * object in the `@ldapjs/protocol` package. The same constants are exported
 * here as static properties for convenience.
 */
class SearchRequest extends LdapMessage {
  /**
   * Limit searches to the specified {@link baseObject}.
   *
   * @type {number}
   */
  static SCOPE_BASE = search.SCOPE_BASE_OBJECT

  /**
   * Limit searches to the immediate children of the specified
   * {@link baseObject}.
   *
   * @type {number}
   */
  static SCOPE_SINGLE = search.SCOPE_ONE_LEVEL

  /**
   * Limit searches to the {@link baseObject} and all descendents of that
   * object.
   *
   * @type {number}
   */
  static SCOPE_SUBTREE = search.SCOPE_SUBTREE

  /**
   * Do not perform any dereferencing of aliases at all.
   *
   * @type {number}
   */
  static DEREF_ALIASES_NEVER = search.NEVER_DEREF_ALIASES

  /**
   * Dereference aliases in subordinate searches of the {@link baseObject}.
   *
   * @type {number}
   */
  static DEREF_IN_SEARCHING = search.DEREF_IN_SEARCHING

  /**
   * Dereference aliases when finding the base object only.
   *
   * @type {number}
   */
  static DEREF_BASE_OBJECT = search.DEREF_BASE_OBJECT

  /**
   * Dereference aliases when finding the base object and when searching
   * subordinates.
   *
   * @type {number}
   */
  static DEREF_ALWAYS = search.DEREF_ALWAYS

  #baseObject
  #scope
  #derefAliases
  #sizeLimit
  #timeLimit
  #typesOnly
  #filter
  #attributes = []

  /**
   * @typedef {LdapMessageOptions} SearchRequestOptions
   * @property {string | import('@ldapjs/dn').DN} baseObject The path to the
   * LDAP object that will serve as the basis of the search.
   * @property {number | string} scope The type of search to be performed.
   * May be one of {@link SCOPE_BASE}, {@link SCOPE_SINGLE},
   * {@link SCOPE_SUBTREE}, `'base'`, `'single'` (`'one'`), or `'subtree'`
   * (`'sub'`).
   * @property {number} derefAliases Indicates if aliases should be dereferenced
   * during searches. May be one of {@link DEREF_ALIASES_NEVER},
   * {@link DEREF_BASE_OBJECT}, {@link DEREF_IN_SEARCHING}, or
   * {@link DEREF_ALWAYS}.
   * @property {number} sizeLimit The number of search results the server should
   * limit the result set to. `0` indicates no desired limit.
   * @property {number} timeLimit The number of seconds the server should work
   * before aborting the search request. `0` indicates no desired limit.
   * @property {boolean} typesOnly Indicates if only attribute names should
   * be returned (`true`), or both names and values should be returned (`false`).
   * @property {string | import('@ldapjs/filter').FilterString} filter The
   * filter to apply when searching.
   * @property {string[]} attributes A set of attribute filtering strings
   * to apply. See the docs for the {@link attributes} setter.
   */

  /**
   * @param {SearchRequestOptions} options
   */
  constructor (options = {}) {
    options.protocolOp = operations.LDAP_REQ_SEARCH
    super(options)

    this.baseObject = options.baseObject ?? ''
    this.scope = options.scope ?? search.SCOPE_BASE_OBJECT
    this.derefAliases = options.derefAliases ?? search.NEVER_DEREF_ALIASES
    this.sizeLimit = options.sizeLimit ?? 0
    this.timeLimit = options.timeLimit ?? 0
    this.typesOnly = options.typesOnly ?? false
    this.filter = options.filter ?? new filter.PresenceFilter({ attribute: 'objectclass' })
    this.attributes = options.attributes ?? []
  }

  /**
   * Alias of {@link baseObject}.
   *
   * @type {import('@ldapjs/dn').DN}
   */
  get _dn () {
    return this.#baseObject
  }

  /**
   * The name of the request type.
   *
   * @type {string}
   */
  get type () {
    return 'SearchRequest'
  }

  /**
   * The list of attributes to match against.
   *
   * @returns {string[]}
   */
  get attributes () {
    return this.#attributes
  }

  /**
   * Set the list of attributes to match against. Overwrites any existing
   * attributes. The list is a set of spec defined strings. They are not
   * instances of `@ldapjs/attribute`.
   *
   * See:
   * + https://www.rfc-editor.org/rfc/rfc4511.html#section-4.5.1.8
   * + https://www.rfc-editor.org/rfc/rfc3673.html
   * + https://www.rfc-editor.org/rfc/rfc4529.html
   *
   * @param {string)[]} attrs
   */
  set attributes (attrs) {
    if (Array.isArray(attrs) === false) {
      throw Error('attributes must be an array of attribute strings')
    }
    const newAttrs = []
    for (const attr of attrs) {
      if (typeof attr === 'string' && isValidAttributeString(attr) === true) {
        newAttrs.push(attr)
      } else if (typeof attr === 'string' && attr === '') {
        // TODO: emit warning about spec violation via log and/or telemetry
        warning.emit('LDAP_ATTRIBUTE_SPEC_ERR_001')
      } else {
        throw Error('attribute must be a valid string')
      }
    }
    this.#attributes = newAttrs
  }

  /**
   * The base LDAP object that the search will start from.
   *
   * @returns {import('@ldapjs/dn').DN}
   */
  get baseObject () {
    return this.#baseObject
  }

  /**
   * Define the base LDAP object to start searches from.
   *
   * @param {string | import('@ldapjs/dn').DN} obj
   */
  set baseObject (obj) {
    if (typeof obj === 'string') {
      this.#baseObject = DN.fromString(obj)
    } else if (Object.prototype.toString.call(obj) === '[object LdapDn]') {
      this.#baseObject = obj
    } else {
      throw Error('baseObject must be a DN string or DN instance')
    }
  }

  /**
   * The alias dereferencing method that will be provided to the server.
   * May be one of {@link DEREF_ALIASES_NEVER}, {@link DEREF_IN_SEARCHING},
   * {@link DEREF_BASE_OBJECT},or  {@link DEREF_ALWAYS}.
   *
   * @returns {number}
   */
  get derefAliases () {
    return this.#derefAliases
  }

  /**
   * Define the dereferencing method that will be provided to the server.
   * May be one of {@link DEREF_ALIASES_NEVER}, {@link DEREF_IN_SEARCHING},
   * {@link DEREF_BASE_OBJECT},or  {@link DEREF_ALWAYS}.
   *
   * @param {number} value
   */
  set derefAliases (value) {
    if (Number.isInteger(value) === false) {
      throw Error('derefAliases must be set to an integer')
    }
    this.#derefAliases = value
  }

  /**
   * The filter that will be used in the search.
   *
   * @returns {import('@ldapjs/filter').FilterString}
   */
  get filter () {
    return this.#filter
  }

  /**
   * Define the filter to use in the search.
   *
   * @param {string | import('@ldapjs/filter').FilterString} value
   */
  set filter (value) {
    if (
      typeof value !== 'string' &&
      Object.prototype.toString.call(value) !== '[object FilterString]'
    ) {
      throw Error('filter must be a string or a FilterString instance')
    }

    if (typeof value === 'string') {
      this.#filter = filter.parseString(value)
    } else {
      this.#filter = value
    }
  }

  /**
   * The current search scope value. Can be matched against the exported
   * scope statics.
   *
   * @returns {number}
   *
   * @throws When the scope is set to an unrecognized scope constant.
   */
  get scope () {
    return this.#scope
  }

  /**
   * Define the scope of the search.
   *
   * @param {number|string} value Accepts one of {@link SCOPE_BASE},
   * {@link SCOPE_SINGLE}, or {@link SCOPE_SUBTREE}. Or, as a string, one of
   * "base", "single", "one", "subtree", or "sub".
   *
   * @throws When the provided scope does not resolve to a recognized scope.
   */
  set scope (value) {
    const resolvedScope = scopeAliasToScope(value)
    if (resolvedScope === undefined) {
      throw Error(value + ' is an invalid search scope')
    }
    this.#scope = resolvedScope
  }

  /**
   * The current search scope value as a string name.
   *
   * @returns {string} One of 'base', 'single', or 'subtree'.
   *
   * @throws When the scope is set to an unrecognized scope constant.
   */
  get scopeName () {
    switch (this.#scope) {
      case search.SCOPE_BASE_OBJECT:
        return 'base'
      case search.SCOPE_ONE_LEVEL:
        return 'single'
      case search.SCOPE_SUBTREE:
        return 'subtree'
    }
  }

  /**
   * The number of entries to limit search results to.
   *
   * @returns {number}
   */
  get sizeLimit () {
    return this.#sizeLimit
  }

  /**
   * Define the number of entries to limit search results to.
   *
   * @param {number} value `0` indicates no restriction.
   */
  set sizeLimit (value) {
    if (Number.isInteger(value) === false) {
      throw Error('sizeLimit must be an integer')
    }
    this.#sizeLimit = value
  }

  /**
   * The number of seconds that the search should be limited to for execution.
   * A value of `0` indicates a willingness to wait as long as the server is
   * willing to work.
   *
   * @returns {number}
   */
  get timeLimit () {
    return this.#timeLimit
  }

  /**
   * Define the number of seconds to wait for a search result before the server
   * should abort the search.
   *
   * @param {number} value `0` indicates no time limit restriction.
   */
  set timeLimit (value) {
    if (Number.isInteger(value) === false) {
      throw Error('timeLimit must be an integer')
    }
    this.#timeLimit = value
  }

  /**
   * Indicates if only attribute names (`true`) should be returned, or if both
   * attribute names and attribute values (`false`) should be returned.
   *
   * @returns {boolean}
   */
  get typesOnly () {
    return this.#typesOnly
  }

  /**
   * Define if the search results should include only the attributes names
   * or attribute names and attribute values.
   *
   * @param {boolean} value `false` for both names and values, `true` for
   * names only.
   */
  set typesOnly (value) {
    if (typeof value !== 'boolean') {
      throw Error('typesOnly must be set to a boolean value')
    }
    this.#typesOnly = value
  }

  /**
   * Internal use only.
   *
   * @param {import('@ldapjs/asn1').BerWriter} ber
   *
   * @returns {import('@ldapjs/asn1').BerWriter}
   */
  _toBer (ber) {
    ber.startSequence(operations.LDAP_REQ_SEARCH)

    ber.writeString(this.#baseObject.toString())
    ber.writeEnumeration(this.#scope)
    ber.writeEnumeration(this.#derefAliases)
    ber.writeInt(this.#sizeLimit)
    ber.writeInt(this.#timeLimit)
    ber.writeBoolean(this.#typesOnly)
    ber.appendBuffer(this.#filter.toBer().buffer)

    ber.startSequence(BerTypes.Sequence | BerTypes.Constructor)
    for (const attr of this.#attributes) {
      ber.writeString(attr)
    }
    ber.endSequence()

    ber.endSequence()
    return ber
  }

  /**
   * Internal use only.
   *
   * @param {object}
   *
   * @returns {object}
   */
  _pojo (obj = {}) {
    obj.baseObject = this.baseObject.toString()
    obj.scope = this.scopeName
    obj.derefAliases = this.derefAliases
    obj.sizeLimit = this.sizeLimit
    obj.timeLimit = this.timeLimit
    obj.typesOnly = this.typesOnly
    obj.filter = this.filter.toString()

    obj.attributes = []
    for (const attr of this.#attributes) {
      obj.attributes.push(attr)
    }

    return obj
  }

  /**
   * Implements the standardized `parseToPojo` method.
   *
   * @see LdapMessage.parseToPojo
   *
   * @param {import('@ldapjs/asn1').BerReader} ber
   *
   * @returns {object}
   */
  static parseToPojo (ber) {
    const protocolOp = ber.readSequence()
    if (protocolOp !== operations.LDAP_REQ_SEARCH) {
      const op = protocolOp.toString(16).padStart(2, '0')
      throw Error(`found wrong protocol operation: 0x${op}`)
    }

    const baseObject = ber.readString()
    const scope = ber.readEnumeration()
    const derefAliases = ber.readEnumeration()
    const sizeLimit = ber.readInt()
    const timeLimit = ber.readInt()
    const typesOnly = ber.readBoolean()

    const filterTag = ber.peek()
    const filterBuffer = ber.readRawBuffer(filterTag)
    const parsedFilter = filter.parseBer(new BerReader(filterBuffer))

    const attributes = []
    // Advance to the first attribute sequence in the set
    // of attribute sequences.
    ber.readSequence()
    const endOfAttributesPos = ber.offset + ber.length
    while (ber.offset < endOfAttributesPos) {
      const attribute = ber.readString()
      attributes.push(attribute)
    }

    return {
      protocolOp,
      baseObject,
      scope,
      derefAliases,
      sizeLimit,
      timeLimit,
      typesOnly,
      filter: parsedFilter.toString(),
      attributes
    }
  }
}

module.exports = SearchRequest
