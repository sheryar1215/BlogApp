'use strict'

const tap = require('tap')
const RECOGNIZED_OIDS = require('./recognized-oids')

tap.test('lookupName returns correct name', async t => {
  const name = RECOGNIZED_OIDS.lookupName('1.3.6.1.4.1.4203.1.11.1')
  t.equal(name, 'PASSWORD_MODIFY')
})

tap.test('lookupOID returns correct OID', async t => {
  const name = RECOGNIZED_OIDS.lookupOID('PASSWORD_MODIFY')
  t.equal(name, '1.3.6.1.4.1.4203.1.11.1')
})
