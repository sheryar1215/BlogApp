'use strict'

const OIDS = new Map([
  ['CANCEL_REQUEST', '1.3.6.1.1.8'], // RFC 3909
  ['DISCONNECTION_NOTIFICATION', '1.3.6.1.4.1.1466.20036'], // RFC 4511
  ['PASSWORD_MODIFY', '1.3.6.1.4.1.4203.1.11.1'], // RFC 3062
  ['START_TLS', '1.3.6.1.4.1.1466.20037'], // RFC 4511
  ['WHO_AM_I', '1.3.6.1.4.1.4203.1.11.3'] // RFC 4532
])

Object.defineProperty(OIDS, 'lookupName', {
  value: function (oid) {
    for (const [key, value] of this.entries()) {
      /* istanbul ignore else */
      if (value === oid) return key
    }
  }
})

Object.defineProperty(OIDS, 'lookupOID', {
  value: function (name) {
    for (const [key, value] of this.entries()) {
      /* istanbul ignore else */
      if (key === name) return value
    }
  }
})

module.exports = OIDS
