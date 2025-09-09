'use strict'

const tap = require('tap')
const { BerWriter } = require('@ldapjs/asn1')
const PPC = require('./password-policy-control')
const Control = require('../control')

tap.test('contructor', t => {
  t.test('new no args', async t => {
    const control = new PPC()
    t.ok(control)
    t.type(control, PPC)
    t.type(control, Control)
    t.equal(control.type, PPC.OID)
    t.same(control.value, {})
  })

  t.test('new with args', async t => {
    const control = new PPC({
      type: '1.3.6.1.4.1.42.2.27.8.5.1',
      criticality: true,
      value: {
        error: 1,
        timeBeforeExpiration: 2
      }
    })
    t.ok(control)
    t.equal(control.type, '1.3.6.1.4.1.42.2.27.8.5.1')
    t.ok(control.criticality)
    t.same(control.value, {
      error: 1,
      timeBeforeExpiration: 2
    })
  })

  t.test('with value buffer', async t => {
    const value = new BerWriter()
    value.startSequence()
    value.writeInt(5, 0x81)
    value.endSequence()

    const control = new PPC({ value: value.buffer })
    t.same(control.value, {
      error: 5
    })
  })

  t.test('throws for bad value', async t => {
    t.throws(() => new PPC({ value: 42 }))
    t.throws(() => new PPC({ value: { timeBeforeExpiration: 1, graceAuthNsRemaining: 2 } }))
  })

  t.end()
})

tap.test('pojo', t => {
  t.test('adds control value', async t => {
    const control = new PPC()
    t.same(control.pojo, {
      type: PPC.OID,
      criticality: false,
      value: {}
    })
  })

  t.end()
})

tap.test('toBer', t => {
  t.test('converts empty instance to BER', async t => {
    const target = new BerWriter()
    target.startSequence()
    target.writeString(PPC.OID)
    target.writeBoolean(false) // Control.criticality
    target.endSequence()

    const control = new PPC()
    const ber = control.toBer()

    t.equal(Buffer.compare(ber.buffer, target.buffer), 0)
  })

  t.test('converts full instance to BER', async t => {
    const target = new BerWriter()
    target.startSequence()
    target.writeString(PPC.OID)
    target.writeBoolean(true) // Control.criticality

    const value = new BerWriter()
    value.startSequence()
    value.startSequence(0xa0)
    value.writeInt(2, 0x81)
    value.endSequence()
    value.writeInt(1, 0x81)
    value.endSequence()

    target.writeBuffer(value.buffer, 0x04)
    target.endSequence()

    const control = new PPC({
      criticality: true,
      value: {
        error: 1,
        graceAuthNsRemaining: 2
      }
    })
    const ber = control.toBer()

    t.equal(Buffer.compare(ber.buffer, target.buffer), 0)
  })

  t.end()
})
