'use strict'

module.exports = function isObject (input) {
  return Object.prototype.toString.call(input) === '[object Object]'
}
