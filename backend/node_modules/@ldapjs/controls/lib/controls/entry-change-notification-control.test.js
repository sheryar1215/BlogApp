'use strict'

const tap = require('tap')
const { BerWriter } = require('@ldapjs/asn1')
const ECNC = require('./entry-change-notification-control')
const Control = require('../control')

tap.test('contructor', t => {
  t.test('new no args', async t => {
    const control = new ECNC()
    t.ok(control)
    t.type(control, ECNC)
    t.type(control, Control)
    t.equal(control.type, ECNC.OID)
    t.same(control.value, {
      changeType: 4
    })
  })

  t.test('new with args', async t => {
    const control = new ECNC({
      type: '2.16.840.1.113730.3.4.7',
      criticality: true,
      value: {
        changeType: 1
      }
    })
    t.ok(control)
    t.equal(control.type, '2.16.840.1.113730.3.4.7')
    t.ok(control.criticality)
    t.same(control.value, {
      changeType: 1
    })
  })

  t.test('with value buffer', async t => {
    const value = new BerWriter()
    value.startSequence()
    value.writeInt(8)
    value.writeString('dn=foo')
    value.writeInt(42)
    value.endSequence()

    const control = new ECNC({ value: value.buffer })
    t.same(control.value, {
      changeType: 8,
      previousDN: 'dn=foo',
      changeNumber: 42
    })
  })

  t.test('throws for bad value', async t => {
    t.throws(() => new ECNC({ value: 42 }))
  })

  t.end()
})

tap.test('pojo', t => {
  t.test('adds control value', async t => {
    const control = new ECNC({
      value: {
        changeType: 8,
        previousDN: 'dn=foo',
        changeNumber: 42
      }
    })
    t.strictSame(control.pojo, {
      type: ECNC.OID,
      criticality: false,
      value: {
        changeType: 8,
        previousDN: 'dn=foo',
        changeNumber: 42
      }
    })
  })

  t.end()
})

tap.test('toBer', t => {
  t.test('converts empty instance to BER', async t => {
    const target = new BerWriter()
    target.startSequence()
    target.writeString(ECNC.OID)
    target.writeBoolean(false) // Control.criticality

    const value = new BerWriter()
    value.startSequence()
    value.writeInt(4)
    // value.writeInt(0)
    value.endSequence()

    target.writeBuffer(value.buffer, 0x04)
    target.endSequence()

    const control = new ECNC()
    const ber = control.toBer()

    t.equal(Buffer.compare(ber.buffer, target.buffer), 0)
  })

  t.test('converts instance with full values to BER', async t => {
    const target = new BerWriter()
    target.startSequence()
    target.writeString(ECNC.OID)
    target.writeBoolean(false) // Control.criticality

    const value = new BerWriter()
    value.startSequence()
    value.writeInt(8)
    value.writeString('dn=foo')
    value.writeInt(42)
    value.endSequence()

    target.writeBuffer(value.buffer, 0x04)
    target.endSequence()

    const control = new ECNC({
      value: {
        changeType: 8,
        previousDN: 'dn=foo',
        changeNumber: 42
      }
    })
    const ber = control.toBer()

    t.equal(Buffer.compare(ber.buffer, target.buffer), 0)
  })

  t.end()
})
