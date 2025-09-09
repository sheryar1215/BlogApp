'use strict'

const tap = require('tap')
const { BerWriter } = require('@ldapjs/asn1')
const SSSRC = require('./server-side-sorting-request-control')
const Control = require('../control')

tap.test('contructor', t => {
  t.test('new no args', async t => {
    const control = new SSSRC()
    t.ok(control)
    t.type(control, SSSRC)
    t.type(control, Control)
    t.equal(control.type, SSSRC.OID)
    t.same(control.value, [])
  })

  t.test('new with args', async t => {
    const control = new SSSRC({
      type: '1.2.840.113556.1.4.473',
      criticality: true,
      value: [{ attributeType: 'foo' }]
    })
    t.ok(control)
    t.equal(control.type, '1.2.840.113556.1.4.473')
    t.ok(control.criticality)
    t.same(control.value, [{ attributeType: 'foo' }])
  })

  t.test('new with object', async t => {
    const control = new SSSRC({
      type: '1.2.840.113556.1.4.473',
      criticality: true,
      value: { attributeType: 'foo' }
    })
    t.ok(control)
    t.equal(control.type, '1.2.840.113556.1.4.473')
    t.ok(control.criticality)
    t.same(control.value, [{ attributeType: 'foo' }])
  })

  t.test('with value buffer', async t => {
    const value = new BerWriter()
    value.startSequence(0x30) // Open "array"
    value.startSequence(0x30) // Start "item"
    value.writeString('foo', 0x04)
    value.writeString('bar', 0x80)
    value.writeBoolean(false, 0x81)
    value.endSequence() // End item
    value.endSequence() // Close array

    const control = new SSSRC({ value: value.buffer })
    t.same(control.value, [{
      attributeType: 'foo',
      orderingRule: 'bar',
      reverseOrder: false
    }])
  })

  t.test('throws for bad value', async t => {
    t.throws(() => new SSSRC({ value: 42 }))
  })

  t.test('throws for bad object value', async t => {
    t.throws(() => new SSSRC({ value: { foo: 'bar' } }))
  })

  t.test('throws for bad array value', async t => {
    t.throws(() => new SSSRC({ value: [42] }))
    t.throws(() => new SSSRC({ value: [{ foo: 'bar' }] }))
  })

  t.end()
})

tap.test('pojo', t => {
  t.test('adds control value', async t => {
    const control = new SSSRC()
    t.same(control.pojo, {
      type: SSSRC.OID,
      criticality: false,
      value: []
    })
  })

  t.test('_pojo', async t => {
    const control = new SSSRC()
    const obj = control._pojo({ value: 'change_me' })
    t.strictSame(obj, { value: [] })
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

  t.test('converts full instance BER', async t => {
    const target = new BerWriter()
    target.startSequence()
    target.writeString(SSSRC.OID)
    target.writeBoolean(false) // Control.criticality

    const value = new BerWriter()
    value.startSequence(0x30) // Open "array"
    value.startSequence(0x30) // Start "item"
    value.writeString('one', 0x04)
    value.writeString('one', 0x80)
    value.writeBoolean(false, 0x81)
    value.endSequence() // End item
    value.startSequence(0x30) // Start "item"
    value.writeString('two', 0x04)
    value.writeString('two', 0x80)
    value.writeBoolean(true, 0x81)
    value.endSequence() // End item
    value.endSequence() // Close array

    target.writeBuffer(value.buffer, 0x04)
    target.endSequence()

    const control = new SSSRC({
      value: [
        { attributeType: 'one', orderingRule: 'one', reverseOrder: false },
        { attributeType: 'two', orderingRule: 'two', reverseOrder: true }
      ]
    })
    const ber = control.toBer()

    t.equal(Buffer.compare(Buffer.from(target.buffer), ber.buffer), 0)
  })

  t.end()
})
