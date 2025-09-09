'use strict'

const tap = require('tap')
const { BerReader } = require('@ldapjs/asn1')
const warning = require('./deprecations')
const { Control } = require('@ldapjs/controls')
const LdapMessage = require('./ldap-message')

// Silence the standard warning logs. We will test the messages explicitly.
process.removeAllListeners('warning')

const {
  abandonRequestBytes,
  bindRequestBytes,
  deleteRequestBytes
} = require('./messages/_fixtures/message-byte-arrays')

tap.test('constructor', t => {
  t.test('no args', async t => {
    const message = new LdapMessage()
    t.strictSame(message.pojo, {
      messageId: 1,
      protocolOp: undefined,
      type: 'LdapMessage',
      controls: []
    })
  })

  t.test('all options supplied', t => {
    process.on('warning', handler)
    t.teardown(async () => {
      process.removeListener('warning', handler)
      warning.emitted.set('LDAP_MESSAGE_DEP_001', false)
    })

    const message = new LdapMessage({
      messageID: 10,
      protocolOp: 0x01,
      controls: [new Control({ type: 'foo', value: 'foo' })]
    })
    t.strictSame(message.pojo, {
      messageId: 10,
      protocolOp: 0x01,
      type: 'LdapMessage',
      controls: [{
        type: 'foo',
        value: 'foo',
        criticality: false
      }]
    })

    function handler (error) {
      t.equal(error.message, 'messageID is deprecated. Use messageId instead.')
      t.end()
    }
  })

  t.end()
})

tap.test('misc', t => {
  t.test('toStringTag is correct', async t => {
    const message = new LdapMessage()
    t.equal(Object.prototype.toString.call(message), '[object LdapMessage]')
  })

  t.test('dn returns _dn', async t => {
    class Foo extends LdapMessage {
      get _dn () {
        return 'foo'
      }
    }

    const message = new Foo()
    t.equal(message.dn, 'foo')
  })

  t.test('protocolOp returns code', async t => {
    const message = new LdapMessage({ protocolOp: 1 })
    t.equal(message.protocolOp, 1)
  })

  t.test('json emits warning', t => {
    process.on('warning', handler)
    t.teardown(async () => {
      process.removeListener('warning', handler)
      warning.emitted.set('LDAP_MESSAGE_DEP_002', false)
    })

    const message = new LdapMessage()
    t.ok(message.json)

    function handler (error) {
      t.equal(
        error.message,
        'The .json property is deprecated. Use .pojo instead.'
      )
      t.end()
    }
  })

  t.test('toString returns JSON', async t => {
    const message = new LdapMessage()
    const expected = JSON.stringify(message.pojo)
    t.equal(message.toString(), expected)
  })

  t.end()
})

tap.test('.controls', t => {
  t.test('sets/gets', async t => {
    const req = new LdapMessage()
    t.strictSame(req.controls, [])

    req.controls = [new Control()]
    t.strictSame(req.pojo, {
      messageId: 1,
      protocolOp: undefined,
      type: 'LdapMessage',
      controls: [{
        type: '',
        value: null,
        criticality: false
      }]
    })
  })

  t.test('rejects for non-array', async t => {
    const req = new LdapMessage()
    t.throws(
      () => {
        req.controls = {}
      },
      'controls must be an array'
    )
  })

  t.test('rejects if array item is not a control', async t => {
    const req = new LdapMessage()
    t.throws(
      () => {
        req.controls = ['foo']
      },
      'control must be an instance of LdapControl'
    )
  })

  t.end()
})

tap.test('.id', t => {
  t.test('sets/gets', async t => {
    const req = new LdapMessage()
    t.equal(req.id, 1)

    req.id = 2
    t.equal(req.id, 2)
    t.equal(req.messageId, 2)

    req.messageId = 3
    t.equal(req.id, 3)
  })

  t.test('throws if not an integer', async t => {
    const req = new LdapMessage()
    t.throws(
      () => {
        req.id = 1.5
      },
      'id must be an integer'
    )
  })

  t.test('get messageID is deprecated', t => {
    process.on('warning', handler)
    t.teardown(async () => {
      process.removeListener('warning', handler)
      warning.emitted.set('LDAP_MESSAGE_DEP_001', false)
    })

    const message = new LdapMessage()
    t.ok(message.messageID)

    function handler (error) {
      t.equal(
        error.message,
        'messageID is deprecated. Use messageId instead.'
      )
      t.end()
    }
  })

  t.test('set messageID is deprecated', t => {
    process.on('warning', handler)
    t.teardown(async () => {
      process.removeListener('warning', handler)
      warning.emitted.set('LDAP_MESSAGE_DEP_001', false)
    })

    const message = new LdapMessage()
    message.messageID = 2

    function handler (error) {
      t.equal(
        error.message,
        'messageID is deprecated. Use messageId instead.'
      )
      t.end()
    }
  })

  t.end()
})

tap.test('toBer', t => {
  t.test('throws for bad subclass', async t => {
    class Foo extends LdapMessage {
    }

    const message = new Foo()

    t.throws(
      () => message.toBer(),
      Error('LdapMessage does not implement _toBer')
    )
  })

  t.test('converts BindRequest to BER', async t => {
    const reqBuffer = Buffer.from(bindRequestBytes)
    const reader = new BerReader(reqBuffer)
    const message = LdapMessage.parse(reader)

    const ber = message.toBer()
    t.equal('[object BerReader]', Object.prototype.toString.call(ber))
    t.equal(reqBuffer.compare(ber.buffer), 0)
  })

  t.test('converts DeleteRequest to BER', async t => {
    const reqBuffer = Buffer.from(deleteRequestBytes)
    const reader = new BerReader(reqBuffer)
    const message = LdapMessage.parse(reader)

    const ber = message.toBer()
    t.equal(reqBuffer.compare(ber.buffer), 0)
  })

  t.end()
})

tap.test('#parse', t => {
  t.test('parses an abandon request', async t => {
    const reader = new BerReader(Buffer.from(abandonRequestBytes))
    const message = LdapMessage.parse(reader)

    t.strictSame(message.pojo, {
      messageId: 6,
      protocolOp: 0x50,
      type: 'AbandonRequest',
      abandonId: 5,
      controls: []
    })
  })

  t.test('parses a bind request', async t => {
    const reader = new BerReader(Buffer.from(bindRequestBytes))
    const message = LdapMessage.parse(reader)

    t.strictSame(message.pojo, {
      messageId: 1,
      protocolOp: 0x60,
      type: 'BindRequest',
      version: 3,
      name: 'uid=admin,ou=system',
      authenticationType: 'simple',
      credentials: 'secret',
      controls: []
    })

    t.equal(message.name, 'uid=admin,ou=system')
  })

  t.test('parses a delete request with controls', async t => {
    const reader = new BerReader(Buffer.from(deleteRequestBytes))
    const message = LdapMessage.parse(reader)

    // We need to parse the JSON representation because stringSame will return
    // false when comparing a plain object to an instance of Control.
    t.strictSame(JSON.parse(message.toString()), {
      messageId: 5,
      protocolOp: 0x4a,
      type: 'DeleteRequest',
      entry: 'dc=example,dc=com',
      controls: [{
        type: '1.2.840.113556.1.4.805',
        criticality: true,
        value: null
      }]
    })
  })

  t.end()
})

tap.test('#parseToPojo', t => {
  t.test('throws because not implemented', async t => {
    const expected = Error('Use LdapMessage.parse, or a specific message type\'s parseToPojo, instead.')
    t.throws(
      () => LdapMessage.parseToPojo(),
      expected
    )
  })

  t.end()
})
