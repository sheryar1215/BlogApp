'use strict'

const tap = require('tap')
const {
  modifyRequestBytes
} = require('./_fixtures/message-byte-arrays')
const { operations } = require('@ldapjs/protocol')
const { BerReader } = require('@ldapjs/asn1')
const Attribute = require('@ldapjs/attribute')
const Change = require('@ldapjs/change')
const ModifyRequest = require('./modify-request')

tap.test('constructor', t => {
  t.test('with empty params', async t => {
    const req = new ModifyRequest()
    t.strictSame(req.pojo, {
      messageId: 1,
      protocolOp: operations.LDAP_REQ_MODIFY,
      type: 'ModifyRequest',
      object: null,
      changes: [],
      controls: []
    })
  })

  t.test('with invalid changes options', async t => {
    t.throws(
      () => new ModifyRequest({ changes: 'foo' }),
      Error('changes must be an array')
    )
  })

  t.end()
})

tap.test('.changes', t => {
  t.test('gets a copy of the set of changes', async t => {
    const changes = [new Change({
      modification: new Attribute()
    })]
    const req = new ModifyRequest({ changes })
    const found = req.changes
    t.not(changes, found)
    t.equal(changes.length, 1)
    t.equal(Change.isChange(changes[0]), true)
  })

  t.test('set throws for non-array', async t => {
    const req = new ModifyRequest()
    t.throws(
      () => {
        req.changes = 42
      },
      Error('changes must be an array')
    )
  })

  t.test('throws for non-change in array', async t => {
    const req = new ModifyRequest()
    t.throws(
      () => {
        req.changes = [42]
      },
      Error('change must be an instance of Change or a Change-like object')
    )
  })

  t.test('converts change-likes to changes', async t => {
    const req = new ModifyRequest()
    req.changes = [{
      operation: 'add',
      modification: {
        type: 'cn',
        values: ['foo']
      }
    }]
    t.equal(req.changes.length, 1)
    t.equal(Object.prototype.toString.call(req.changes[0]), '[object LdapChange]')
  })

  t.end()
})

tap.test('.object', t => {
  t.test('gets and sets', async t => {
    const req = new ModifyRequest()
    t.equal(req.object, null)
    req.object = 'foo'
    t.equal(req.object, 'foo')
    t.equal(req.dn, 'foo')
  })

  t.end()
})

tap.test('_toBer', t => {
  t.test('serializes to ber', async t => {
    const req = new ModifyRequest({
      messageId: 2,
      object: 'uid=jdoe,ou=People,dc=example,dc=com',
      changes: [
        new Change({
          operation: 'delete',
          modification: new Attribute({
            type: 'givenName',
            values: ['John']
          })
        }),
        new Change({
          operation: 'add',
          modification: new Attribute({
            type: 'givenName',
            values: ['Jonathan']
          })
        }),
        new Change({
          operation: 'replace',
          modification: new Attribute({
            type: 'cn',
            values: ['Jonathan Doe']
          })
        })
      ]
    })
    const expected = Buffer.from(modifyRequestBytes)
    const ber = req.toBer()
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.end()
})

tap.test('_pojo', t => {
  t.test('serializes to plain object', async t => {
    const req = new ModifyRequest({
      object: 'foo',
      changes: [
        new Change({
          modification: new Attribute({
            type: 'cn',
            values: ['bar']
          })
        })
      ]
    })
    t.strictSame(req._pojo(), {
      object: 'foo',
      changes: [{
        operation: 'add',
        modification: {
          type: 'cn',
          values: ['bar']
        }
      }]
    })
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('throws for wrong op', async t => {
    const bytes = Buffer.from(modifyRequestBytes.slice(6))
    bytes[0] = 0x61
    const reader = new BerReader(bytes)
    t.throws(
      () => ModifyRequest.parseToPojo(reader),
      Error('found wrong protocol operation: 0x61')
    )
  })

  t.test('parses bytes to an object', async t => {
    const bytes = Buffer.from(modifyRequestBytes.slice(6))
    const reader = new BerReader(bytes)
    const pojo = ModifyRequest.parseToPojo(reader)
    t.type(pojo, 'Object')
    t.strictSame(pojo, {
      protocolOp: operations.LDAP_REQ_MODIFY,
      object: 'uid=jdoe,ou=People,dc=example,dc=com',
      changes: [
        {
          operation: 'delete',
          modification: {
            type: 'givenName',
            values: ['John']
          }
        },
        {
          operation: 'add',
          modification: {
            type: 'givenName',
            values: ['Jonathan']
          }
        },
        {
          operation: 'replace',
          modification: {
            type: 'cn',
            values: ['Jonathan Doe']
          }
        }
      ]
    })
  })

  t.end()
})
