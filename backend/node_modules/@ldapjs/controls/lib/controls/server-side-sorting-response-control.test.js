'use strict'

const tap = require('tap')
const { BerWriter } = require('@ldapjs/asn1')
const SSSRC = require('./server-side-sorting-response-control')
const Control = require('../control')

tap.test('constructor', t => {
  t.test('new no args', async t => {
    const control = new SSSRC()
    t.ok(control)
    t.type(control, SSSRC)
    t.type(control, Control)
    t.equal(control.type, SSSRC.OID)
    t.same(control.value, {})
  })

  t.test('new with args', async t => {
    const control = new SSSRC({
      type: '1.2.840.113556.1.4.474',
      criticality: true,
      value: {
        result: SSSRC.RESPONSE_CODES.get('OPERATIONS_ERROR'),
        failedAttribute: 'foo'
      }
    })
    t.ok(control)
    t.equal(control.type, '1.2.840.113556.1.4.474')
    t.equal(control.criticality, false)
    t.same(control.value, {
      result: 1,
      failedAttribute: 'foo'
    })
  })

  t.test('with value buffer', async t => {
    const value = new BerWriter()
    value.startSequence(0x30)
    value.writeEnumeration(1)
    value.writeString('foo', 0x80)
    value.endSequence()

    const control = new SSSRC({ value: value.buffer })
    t.same(control.value, {
      result: 1,
      failedAttribute: 'foo'
    })
  })

  t.test('throws for bad value', async t => {
    t.throws(() => new SSSRC({ value: 42 }))
    t.throws(() => new SSSRC({ value: {} }))
    t.throws(() => new SSSRC({
      value: {
        result: 1,
        failedAttribute: 42
      }
    }))
  })

  t.end()
})

tap.test('pojo', t => {
  t.test('adds control value', async t => {
    const control = new SSSRC()
    t.same(control.pojo, {
      type: SSSRC.OID,
      criticality: false,
      value: {}
    })
  })

  t.test('_pojo', async t => {
    const control = new SSSRC()
    t.strictSame(control._pojo({ value: 'change_me' }), {
      value: {}
    })
  })

  t.end()
})

tap.test('toBer', t => {
  t.test('converts empty instance to BER', async t => {
    const target = new BerWriter()
    target.startSequence()
    target.writeString(SSSRC.OID)
    target.writeBoolean(false) // Control.criticality
    target.endSequence()

    const control = new SSSRC()
    const ber = control.toBer()

    t.equal(Buffer.compare(ber.buffer, target.buffer), 0)
  })

  t.test('converts full instance to BER', async t => {
    const target = new BerWriter()
    target.startSequence()
    target.writeString(SSSRC.OID)
    target.writeBoolean(false) // Control.criticality

    const value = new BerWriter()
    value.startSequence(0x30)
    value.writeEnumeration(1)
    value.writeString('foo', 0x80)
    value.endSequence()

    target.writeBuffer(value.buffer, 0x04)
    target.endSequence()

    const control = new SSSRC({
      value: {
        result: SSSRC.RESPONSE_CODES.get('OPERATIONS_ERROR'),
        failedAttribute: 'foo'
      }
    })
    const ber = control.toBer()

    t.equal(Buffer.compare(ber.buffer, target.buffer), 0)
  })

  t.end()
})
