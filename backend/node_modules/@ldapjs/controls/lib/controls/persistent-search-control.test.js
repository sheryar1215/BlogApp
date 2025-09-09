'use strict'

const tap = require('tap')
const { BerWriter } = require('@ldapjs/asn1')
const PSC = require('./persistent-search-control')
const Control = require('../control')

tap.test('contructor', t => {
  t.test('new no args', async t => {
    const control = new PSC()
    t.ok(control)
    t.type(control, PSC)
    t.type(control, Control)
    t.equal(control.type, PSC.OID)
    t.same(control.value, {
      changeTypes: 15,
      changesOnly: true,
      returnECs: true
    })
  })

  t.test('new with args', async t => {
    const control = new PSC({
      type: '2.16.840.1.113730.3.4.3',
      criticality: true,
      value: {
        changeTypes: 1,
        changesOnly: false,
        returnECs: true
      }
    })
    t.ok(control)
    t.equal(control.type, '2.16.840.1.113730.3.4.3')
    t.ok(control.criticality)
    t.same(control.value, {
      changeTypes: 1,
      changesOnly: false,
      returnECs: true
    })
  })

  t.test('with value buffer', async t => {
    const value = new BerWriter()
    value.startSequence()
    value.writeInt(2)
    value.writeBoolean(true)
    value.writeBoolean(false)
    value.endSequence()

    const control = new PSC({ value: value.buffer })
    t.same(control.value, {
      changeTypes: 2,
      changesOnly: true,
      returnECs: false
    })
  })

  t.test('throws for bad value', async t => {
    t.throws(() => new PSC({ value: 42 }))
  })

  t.end()
})

tap.test('pojo', t => {
  t.test('adds control value', async t => {
    const control = new PSC()
    t.same(control.pojo, {
      type: PSC.OID,
      criticality: false,
      value: {
        changeTypes: 15,
        changesOnly: true,
        returnECs: true
      }
    })
  })

  t.end()
})

tap.test('toBer', t => {
  t.test('converts empty instance to BER', async t => {
    const target = new BerWriter()
    target.startSequence()
    target.writeString(PSC.OID)
    target.writeBoolean(false) // Control.criticality

    const value = new BerWriter()
    value.startSequence()
    value.writeInt(15)
    value.writeBoolean(true)
    value.writeBoolean(true)
    value.endSequence()

    target.writeBuffer(value.buffer, 0x04)
    target.endSequence()

    const control = new PSC()
    const ber = control.toBer()

    t.equal(Buffer.compare(ber.buffer, target.buffer), 0)
  })

  t.end()
})
