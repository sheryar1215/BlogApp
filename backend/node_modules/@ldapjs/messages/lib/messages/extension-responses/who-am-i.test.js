'use strict'

const tap = require('tap')
const { BerReader } = require('@ldapjs/asn1')
const LdapMessage = require('../../ldap-message')
const { withId, withoutId } = require('./_fixtures/who-am-i')
const WhoAmIResponse = require('./who-am-i')

tap.test('parses a response with a returned id', async t => {
  const reader = new BerReader(Buffer.from(withId))
  let res = LdapMessage.parse(reader)
  res = WhoAmIResponse.fromResponse(res)
  t.type(res, WhoAmIResponse)
  t.equal(res.responseName, undefined)
  t.equal(res.responseValue, 'u:xxyyz@EXAMPLE.NET')
})

tap.test('parses a response with a returned id', async t => {
  const reader = new BerReader(Buffer.from(withoutId))
  let res = LdapMessage.parse(reader)
  res = WhoAmIResponse.fromResponse(res)
  t.type(res, WhoAmIResponse)
  t.equal(res.responseName, undefined)
  t.equal(res.responseValue, undefined)
})
