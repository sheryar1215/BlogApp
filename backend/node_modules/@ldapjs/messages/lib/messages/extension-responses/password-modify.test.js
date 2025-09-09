'use strict'

const tap = require('tap')
const { BerReader } = require('@ldapjs/asn1')
const LdapMessage = require('../../ldap-message')
const {
  basicResponse,
  withGeneratedPasswordBytes
} = require('./_fixtures/password-modify')
const PasswordModifyResponse = require('./password-modify')

tap.test('parses a response with a generated password', async t => {
  const reader = new BerReader(Buffer.from(withGeneratedPasswordBytes))
  let res = LdapMessage.parse(reader)
  res = PasswordModifyResponse.fromResponse(res)
  t.type(res, PasswordModifyResponse)
  t.equal(res.responseName, undefined)
  t.equal(res.responseValue, 'AdapterStevensonGrainPlaymate')
})

tap.test('parses a response with an empty value', async t => {
  const reader = new BerReader(Buffer.from(basicResponse))
  let res = LdapMessage.parse(reader)
  res = PasswordModifyResponse.fromResponse(res)
  t.type(res, PasswordModifyResponse)
  t.equal(res.responseName, undefined)
  t.equal(res.responseValue, undefined)
})
