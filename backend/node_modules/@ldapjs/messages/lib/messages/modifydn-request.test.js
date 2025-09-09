'use strict'

const tap = require('tap')
const { operations } = require('@ldapjs/protocol')
const { BerReader, BerWriter } = require('@ldapjs/asn1')
const { DN } = require('@ldapjs/dn')
const ModifyDnRequest = require('./modifydn-request')

const {
  modifyDnRequestBytes
} = require('./_fixtures/message-byte-arrays')

tap.test('basic', t => {
  t.test('constructor no args', async t => {
    const req = new ModifyDnRequest()
    t.strictSame(req.pojo, {
      messageId: 1,
      protocolOp: operations.LDAP_REQ_MODRDN,
      type: 'ModifyDnRequest',
      entry: '',
      newRdn: '',
      deleteOldRdn: false,
      newSuperior: undefined,
      controls: []
    })
  })

  t.test('constructor with args', async t => {
    const req = new ModifyDnRequest({
      entry: 'dc=to-move,dc=example,dc=com',
      newRdn: 'dc=moved,dc=example,dc=com',
      deleteOldRdn: true,
      newSuperior: 'dc=example,dc=net'
    })
    t.strictSame(req.pojo, {
      messageId: 1,
      protocolOp: operations.LDAP_REQ_MODRDN,
      type: 'ModifyDnRequest',
      entry: 'dc=to-move,dc=example,dc=com',
      newRdn: 'dc=moved,dc=example,dc=com',
      deleteOldRdn: true,
      newSuperior: 'dc=example,dc=net',
      controls: []
    })
  })

  t.test('.type', async t => {
    const req = new ModifyDnRequest()
    t.equal(req.type, 'ModifyDnRequest')
  })

  t.end()
})

tap.test('.entry', t => {
  t.test('sets and gets', async t => {
    const req = new ModifyDnRequest()

    req.entry = 'foo=bar'
    t.equal(Object.prototype.toString.call(req.entry), '[object LdapDn]')
    t.equal(req.entry.toString(), 'foo=bar')
    t.equal(req._dn.toString(), 'foo=bar')

    req.entry = DN.fromString('cn=foo')
    t.equal(req.entry.toString(), 'cn=foo')
  })

  t.test('throws for bad value', async t => {
    const req = new ModifyDnRequest()
    t.throws(
      () => {
        req.entry = { cn: 'foo' }
      },
      'entry must be a valid DN string or instance of LdapDN'
    )
  })

  t.end()
})

tap.test('.newRdn', t => {
  t.test('sets and gets', async t => {
    const req = new ModifyDnRequest()

    req.newRdn = 'foo=bar'
    t.equal(Object.prototype.toString.call(req.newRdn), '[object LdapDn]')
    t.equal(req.newRdn.toString(), 'foo=bar')

    req.newRdn = DN.fromString('cn=foo')
    t.equal(req.newRdn.toString(), 'cn=foo')
  })

  t.test('throws for bad value', async t => {
    const req = new ModifyDnRequest()
    t.throws(
      () => {
        req.newRdn = { cn: 'foo' }
      },
      'newRdn must be a valid DN string or instance of LdapDN'
    )
  })

  t.end()
})

tap.test('.deleteOldRdn', t => {
  t.test('throws for wrong type', async t => {
    t.throws(
      () => new ModifyDnRequest({ deleteOldRdn: 'false' }),
      'deleteOldRdn must be a boolean value'
    )
  })

  t.test('sets and gets', async t => {
    const req = new ModifyDnRequest()
    t.equal(req.deleteOldRdn, false)

    req.deleteOldRdn = true
    t.type(req.deleteOldRdn, 'boolean')
    t.equal(req.deleteOldRdn, true)
  })

  t.end()
})

tap.test('.newSuperior', t => {
  t.test('sets and gets', async t => {
    const req = new ModifyDnRequest()

    req.newSuperior = 'foo=bar'
    t.equal(Object.prototype.toString.call(req.newSuperior), '[object LdapDn]')
    t.equal(req.newSuperior.toString(), 'foo=bar')

    req.newSuperior = null
    t.equal(req.newSuperior, undefined)

    req.newSuperior = DN.fromString('cn=foo')
    t.equal(req.newSuperior.toString(), 'cn=foo')
  })

  t.test('throws for bad value', async t => {
    const req = new ModifyDnRequest()
    t.throws(
      () => {
        req.newSuperior = { cn: 'foo' }
      },
      'newSuperior must be a valid DN string or instance of LdapDN'
    )
  })

  t.end()
})

tap.test('_toBer', async t => {
  t.test('converts instance to BER', async t => {
    const req = new ModifyDnRequest({
      entry: 'uid=jdoe,ou=People,dc=example,dc=com',
      newRdn: 'uid=john.doe',
      deleteOldRdn: true,
      newSuperior: 'ou=Users,dc=example,dc=com'
    })
    const writer = new BerWriter()
    req._toBer(writer)

    t.equal(
      Buffer.from(modifyDnRequestBytes.slice(5)).compare(writer.buffer),
      0
    )
  })

  t.end()
})

tap.test('_pojo', t => {
  t.test('returns a pojo representation', async t => {
    let req = new ModifyDnRequest({
      entry: 'cn=bar,dc=example,dc=com',
      newRdn: 'cn=foo'
    })
    t.strictSame(req._pojo(), {
      entry: 'cn=bar,dc=example,dc=com',
      newRdn: 'cn=foo',
      deleteOldRdn: false,
      newSuperior: undefined
    })

    req = new ModifyDnRequest({
      entry: 'cn=bar,dc=example,dc=com',
      newRdn: 'cn=foo',
      newSuperior: 'ou=people,dc=example,dc=com'
    })
    t.strictSame(req._pojo(), {
      entry: 'cn=bar,dc=example,dc=com',
      newRdn: 'cn=foo',
      deleteOldRdn: false,
      newSuperior: 'ou=people,dc=example,dc=com'
    })
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('throws if operation incorrect', async t => {
    const reqBuffer = Buffer.from(modifyDnRequestBytes)
    reqBuffer[5] = 0x61

    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    t.throws(
      () => ModifyDnRequest.parseToPojo(reader),
      Error('found wrong protocol operation: 0x61')
    )
  })

  t.test('returns a pojo representation', async t => {
    const reqBuffer = Buffer.from(modifyDnRequestBytes)
    const reader = new BerReader(reqBuffer)
    reader.readSequence()
    reader.readInt()

    const pojo = ModifyDnRequest.parseToPojo(reader)
    t.equal(pojo.protocolOp, operations.LDAP_REQ_MODRDN)
    t.equal(pojo.entry, 'uid=jdoe,ou=People,dc=example,dc=com')
    t.equal(pojo.newRdn, 'uid=john.doe')
    t.equal(pojo.deleteOldRdn, true)
    t.equal(pojo.newSuperior, 'ou=Users,dc=example,dc=com')
  })

  t.end()
})
