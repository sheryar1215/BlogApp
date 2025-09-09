'use strict'

const tap = require('tap')
const warning = require('./deprecations')
const { resultCodes, operations } = require('@ldapjs/protocol')
const { BerReader } = require('@ldapjs/asn1')
const {
  addResponseBasicBytes,
  addResponseNoSuchObjectBytes,
  addResponseReferralsBytes,
  extensionDisconnectionNotificationResponseBytes
} = require('./messages/_fixtures/message-byte-arrays')
const RECOGNIZED_OIDS = require('./messages/extension-utils/recognized-oids')
const LdapResult = require('./ldap-result')
const ExtensionResponse = require('./messages/extension-response')

// Silence the standard warning logs. We will test the messages explicitly.
process.removeAllListeners('warning')

tap.test('constructor', t => {
  t.test('no args', async t => {
    const res = new LdapResult()
    t.equal(res.status, 0)
    t.equal(res.matchedDN, '')
    t.strictSame(res.referrals, [])
    t.equal(res.diagnosticMessage, '')
  })

  t.test('emits warning for abandonID', t => {
    process.on('warning', handler)
    t.teardown(async () => {
      process.removeListener('warning', handler)
      warning.emitted.set('LDAP_MESSAGE_DEP_004', false)
    })

    const res = new LdapResult({
      errorMessage: 'foo'
    })
    t.ok(res)

    function handler (error) {
      t.equal(
        error.message,
        'errorMessage is deprecated. Use diagnosticMessage instead.'
      )
      t.end()
    }
  })

  t.test('with options', async t => {
    const res = new LdapResult({
      status: 1,
      matchedDN: 'foo',
      referrals: ['foo.example.com'],
      diagnosticMessage: 'bar'
    })
    t.equal(res.status, 1)
    t.equal(res.matchedDN, 'foo')
    t.strictSame(res.referrals, ['foo.example.com'])
    t.equal(res.diagnosticMessage, 'bar')
  })

  t.end()
})

tap.test('.diagnosticMessage', t => {
  t.test('sets and gets', async t => {
    const res = new LdapResult()
    t.equal(res.diagnosticMessage, '')
    res.diagnosticMessage = 'foo'
    t.equal(res.diagnosticMessage, 'foo')
  })

  t.end()
})

tap.test('.matchedDN', t => {
  t.test('sets and gets', async t => {
    const res = new LdapResult()
    t.equal(res.matchedDN, '')
    res.matchedDN = 'foo'
    t.equal(res.matchedDN, 'foo')
  })

  t.end()
})

tap.test('.pojo', t => {
  t.test('returns a plain JavaScript object', async t => {
    const res = new LdapResult()
    t.strictSame(res.pojo, {
      status: 0,
      matchedDN: '',
      diagnosticMessage: '',
      referrals: []
    })
  })

  t.test('returns a plain JavaScript object from subclass', async t => {
    class Foo extends LdapResult {
      _pojo (obj) {
        obj.foo = 'foo'
        return obj
      }
    }

    const res = new Foo()
    t.strictSame(res.pojo, {
      status: 0,
      matchedDN: '',
      diagnosticMessage: '',
      referrals: [],
      foo: 'foo'
    })
  })

  t.end()
})

tap.test('.referrals', t => {
  t.test('gets', async t => {
    const res = new LdapResult({ referrals: ['foo'] })
    t.strictSame(res.referrals, ['foo'])
  })

  t.end()
})

tap.test('.status', t => {
  t.test('sets and gets', async t => {
    const res = new LdapResult()
    t.equal(res.status, 0)
    res.status = 1
    t.equal(res.status, 1)
  })

  t.end()
})

tap.test('.type', t => {
  t.test('gets', async t => {
    const res = new LdapResult()
    t.equal(res.type, 'LdapResult')
  })

  t.end()
})

tap.test('addReferral', t => {
  t.test('adds to existing list', async t => {
    const res = new LdapResult({ referrals: ['foo'] })
    t.strictSame(res.referrals, ['foo'])
    res.addReferral('bar')
    t.strictSame(res.referrals, ['foo', 'bar'])
  })

  t.end()
})

tap.test('_toBer', t => {
  t.test('returns basic bytes', async t => {
    const res = new LdapResult({
      protocolOp: operations.LDAP_RES_ADD,
      messageId: 2
    })
    const ber = res.toBer()
    const expected = Buffer.from(addResponseBasicBytes)
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.test('returns bytes with referrals', async t => {
    const res = new LdapResult({
      protocolOp: operations.LDAP_RES_ADD,
      messageId: 3,
      status: resultCodes.REFERRAL,
      diagnosticMessage: 'This server is read-only.  Try a different one.',
      referrals: [
        'ldap://alternate1.example.com:389/uid=jdoe,ou=Remote,dc=example,dc=com',
        'ldap://alternate2.example.com:389/uid=jdoe,ou=Remote,dc=example,dc=com'
      ]
    })
    const ber = res.toBer()
    const expected = Buffer.from(addResponseReferralsBytes)
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.test('hands off to _writeResponse', async t => {
    const res = new ExtensionResponse({
      protocolOp: operations.LDAP_RES_EXTENSION,
      messageId: 0,
      status: resultCodes.UNAVAILABLE,
      diagnosticMessage: 'The Directory Server is shutting down',
      referrals: [],
      responseName: RECOGNIZED_OIDS.get('DISCONNECTION_NOTIFICATION')
    })
    const ber = res.toBer()
    const expected = Buffer.from(extensionDisconnectionNotificationResponseBytes)
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('throws because not implemented', async t => {
    const expected = Error('Use LdapMessage.parse, or a specific message type\'s parseToPojo, instead.')
    t.throws(
      () => LdapResult.parseToPojo(),
      expected
    )
  })

  t.end()
})

tap.test('#_parseToPojo', async t => {
  t.test('throws if protocol op is wrong', async t => {
    const bytes = addResponseBasicBytes.slice(5)
    bytes[0] = 0x68
    const berReader = new BerReader(Buffer.from(bytes))
    t.throws(
      () => LdapResult._parseToPojo({
        opCode: operations.LDAP_RES_ADD,
        berReader
      }),
      Error('found wrong protocol operation: 0x68')
    )
  })

  t.test('parses a basic object', async t => {
    const bytes = addResponseBasicBytes.slice(5)
    const berReader = new BerReader(Buffer.from(bytes))
    const pojo = { foo: 'foo' }
    LdapResult._parseToPojo({
      opCode: operations.LDAP_RES_ADD,
      berReader,
      pojo
    })
    t.strictSame(pojo, {
      status: 0,
      matchedDN: '',
      diagnosticMessage: '',
      referrals: [],
      foo: 'foo'
    })
  })

  t.test('parses object with matched dn and diagnostic message', async t => {
    const bytes = addResponseNoSuchObjectBytes.slice(6)
    const berReader = new BerReader(Buffer.from(bytes))
    const pojo = LdapResult._parseToPojo({
      opCode: operations.LDAP_RES_ADD,
      berReader
    })
    t.strictSame(pojo, {
      status: resultCodes.NO_SUCH_OBJECT,
      referrals: [],
      matchedDN: 'ou=People, dc=example, dc=com',
      diagnosticMessage: [
        'Entry uid=missing1, ou=missing2, ou=People, dc=example, dc=com cannot',
        ' be created because its parent does not exist.'
      ].join('')
    })
  })

  t.test('parses object with referrals', async t => {
    const bytes = addResponseReferralsBytes.slice(6)
    const berReader = new BerReader(Buffer.from(bytes))
    const pojo = LdapResult._parseToPojo({
      opCode: operations.LDAP_RES_ADD,
      berReader
    })
    t.strictSame(pojo, {
      status: resultCodes.REFERRAL,
      referrals: [
        'ldap://alternate1.example.com:389/uid=jdoe,ou=Remote,dc=example,dc=com',
        'ldap://alternate2.example.com:389/uid=jdoe,ou=Remote,dc=example,dc=com'
      ],
      matchedDN: '',
      diagnosticMessage: 'This server is read-only.  Try a different one.'
    })
  })
})
