'use strict'

module.exports = function hasOwn (obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop)
}
