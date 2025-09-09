'use strict'

const tap = require('tap')
const { BerWriter } = require('@ldapjs/asn1')
const PSC = require('./paged-results-control')
const Control = require('../control')

tap.test('contructor', t => {
  t.test('new no args', async t => {
    const control = new PSC()
    t.ok(control)
    t.type(control, PSC)
    t.type(control, Control)
    t.equal(control.type, PSC.OID)
    t.equal(control.value.size, 0)
    t.equal(Buffer.alloc(0).compare(control.value.cookie), 0)
  })

  t.test('new with args', async t => {
    const control = new PSC({
      type: '1.2.840.113556.1.4.319',
      criticality: true,
      value: {
        size: 1,
        cookie: 'foo'
      }
    })
    t.ok(control)
    t.equal(control.type, '1.2.840.113556.1.4.319')
    t.ok(control.criticality)
    t.equal(control.value.size, 1)
    t.equal(Buffer.from('foo').compare(control.value.cookie), 0)
  })

  t.test('with value buffer', async t => {
    const value = new BerWriter()
    value.startSequence()
    value.writeInt(1)
    value.writeBuffer(Buffer.from('foo'), 0x04)
    value.endSequence()

    const control = new PSC({ value: value.buffer })
    t.equal(control.value.size, 1)
    t.equal(Buffer.from('foo').compare(control.value.cookie), 0)
  })

  t.test('with value buffer (empty cookie)', async t => {
    const value = new BerWriter()
    value.startSequence()
    value.writeInt(1)
    value.endSequence()

    const control = new PSC({ value: value.buffer })
    t.equal(control.value.size, 1)
    t.equal(Buffer.alloc(0).compare(control.value.cookie), 0)
  })

  t.test('throws for bad value', async t => {
    t.throws(() => new PSC({ value: 42 }))
  })

  t.end()
})

tap.test('pojo', t => {
  t.test('adds control value', async t => {
    const control = new PSC({
      value: {
        size: 1,
        cookie: 'foo'
      }
    })
    t.same(control.pojo, {
      type: PSC.OID,
      criticality: false,
      value: {
        size: 1,
        cookie: Buffer.from('foo')
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
    value.writeInt(1)
    value.writeString('foo')
    value.endSequence()

    target.writeBuffer(value.buffer, 0x04)
    target.endSequence()

    const control = new PSC({
      value: {
        size: 1,
        cookie: 'foo'
      }
    })
    const ber = control.toBer()

    t.equal(Buffer.compare(ber.buffer, target.buffer), 0)
  })

  t.test('converts empty instance to BER (empty cookie)', async t => {
    const target = new BerWriter()
    target.startSequence()
    target.writeString(PSC.OID)
    target.writeBoolean(false) // Control.criticality

    const value = new BerWriter()
    value.startSequence()
    value.writeInt(1)
    value.writeString('')
    value.endSequence()

    target.writeBuffer(value.buffer, 0x04)
    target.endSequence()

    const control = new PSC({
      value: {
        size: 1
      }
    })
    const ber = control.toBer()

    t.equal(Buffer.compare(ber.buffer, target.buffer), 0)
  })

  t.end()
})
