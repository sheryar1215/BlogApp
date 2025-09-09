'use strict'

module.exports = getAttributeValue

/**
 * Fetch value for named object attribute.
 *
 * @param {object} input
 * @param {object} input.sourceObject object to fetch value from
 * @param {string} input.attributeName name of attribute to fetch
 * @param {boolean} [input.strictCase=false] attribute name is case-sensitive
 */
function getAttributeValue ({ sourceObject, attributeName, strictCase = false }) {
  if (Object.prototype.toString.call(sourceObject) === '[object LdapAttribute]') {
    sourceObject = {
      [sourceObject.type]: sourceObject.values
    }
  }

  if (Object.prototype.toString.call(sourceObject) !== '[object Object]') {
    throw Error('sourceObject must be an object')
  }
  if (typeof attributeName !== 'string') {
    throw Error('attributeName must be a string')
  }

  // Check for exact case match first
  if (Object.prototype.hasOwnProperty.call(sourceObject, attributeName)) {
    return sourceObject[attributeName]
  } else if (strictCase === true) {
    return undefined
  }

  // Perform case-insensitive enumeration after that
  const lowerName = attributeName.toLowerCase()
  const foundName = Object.getOwnPropertyNames(sourceObject).find((name) =>
    name.toLowerCase() === lowerName
  )
  return foundName && sourceObject[foundName]
}
