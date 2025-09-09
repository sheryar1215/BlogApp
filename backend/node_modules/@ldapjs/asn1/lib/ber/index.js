// Copyright 2011 Mark Cavage <mcavage@gmail.com> All rights reserved.

const errors = require('./errors')
const types = require('./types')

const Reader = require('./reader')
const Writer = require('./writer')

// --- Exports

module.exports = {

  Reader,

  Writer

}

for (const t in types) {
  if (Object.prototype.hasOwnProperty.call(types, t)) { module.exports[t] = types[t] }
}
for (const e in errors) {
  if (Object.prototype.hasOwnProperty.call(errors, e)) { module.exports[e] = errors[e] }
}
