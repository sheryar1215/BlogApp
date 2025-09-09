'use strict'

const tap = require('tap')
const { BerWriter } = require('@ldapjs/asn1')
const Attribute = require('@ldapjs/attribute')
const SubstringFilter = require('./substring')
const warning = require('../deprecations')

// Silence the standard warning logs. We will test the messages explicitly.
process.removeAllListeners('warning')

tap.test('Construct args', async t => {
  const f = new SubstringFilter({
    attribute: 'foo',
    initial: 'bar',
    any: ['zig', 'zag'],
    final: 'baz'
  })

  t.ok(f)
  t.equal(Object.prototype.toString.call(f), '[object FilterString]')
  t.equal(f.attribute, 'foo')
  t.equal(f.initial, 'bar')
  t.equal(f.any.length, 2)
  t.equal(f.any[0], 'zig')
  t.equal(f.any[1], 'zag')
  t.equal(f.final, 'baz')
  t.equal(f.toString(), '(foo=bar*zig*zag*baz)')
  t.strictSame(f.json, {
    type: 'SubstringFilter',
    initial: 'bar',
    any: ['zig', 'zag'],
    final: 'baz'
  })
})

tap.test('Construct with deprecated args', async t => {
  const f = new SubstringFilter({
    attribute: 'foo',
    subInitial: 'bar',
    subAny: ['zig', 'zag'],
    subFinal: 'baz'
  })

  t.ok(f)
  t.equal(Object.prototype.toString.call(f), '[object FilterString]')
  t.equal(f.attribute, 'foo')
  t.equal(f.initial, 'bar')
  t.equal(f.subInitial, 'bar')
  t.equal(f.any.length, 2)
  t.equal(f.any[0], 'zig')
  t.equal(f.any[1], 'zag')
  t.equal(f.subAny.length, 2)
  t.equal(f.subAny[0], 'zig')
  t.equal(f.subAny[1], 'zag')
  t.equal(f.final, 'baz')
  t.equal(f.subFinal, 'baz')
  t.equal(f.toString(), '(foo=bar*zig*zag*baz)')
  t.strictSame(f.json, {
    type: 'SubstringFilter',
    subInitial: 'bar',
    subAny: ['zig', 'zag'],
    subFinal: 'baz'
  })
})

tap.test('Emits warnings about sub prefix deprecation', t => {
  process.on('warning', handler)

  t.teardown(async () => {
    process.removeListener('warning', handler)
    warning.emitted.set('LDAP_FILTER_DEP_002', false)
    warning.emitted.set('LDAP_FILTER_DEP_003', false)
    warning.emitted.set('LDAP_FILTER_DEP_004', false)
  })

  // eslint-disable-next-line no-new
  new SubstringFilter({
    attribute: 'foo',
    subInitial: 'bar',
    subAny: ['zig', 'zag'],
    subFinal: 'baz'
  })

  const warnings = []

  function handler ({ message }) {
    warnings.push(message)

    if (warnings.length === 3) {
      t.same(warnings, [
        'subInitial is deprecated. Use initial instead.',
        'subAny is deprecated. Use any instead.',
        'subFinal is deprecated. Use final instead.'
      ])

      t.end()
    }
  }
})

tap.test('escape value only in toString()', async t => {
  const f = new SubstringFilter({
    attribute: 'fo(o',
    initial: 'ba(r)',
    any: ['zi)g', 'z(ag'],
    final: '(baz)'
  })
  t.ok(f)
  t.equal(f.attribute, 'fo(o')
  t.equal(f.initial, 'ba(r)')
  t.equal(f.any.length, 2)
  t.equal(f.any[0], 'zi)g')
  t.equal(f.any[1], 'z(ag')
  t.equal(f.final, '(baz)')
  t.equal(f.toString(), '(fo\\28o=ba\\28r\\29*zi\\29g*z\\28ag*\\28baz\\29)')
})

tap.test('matches', t => {
  t.test('match true', async t => {
    const f = new SubstringFilter({
      attribute: 'foo',
      initial: 'bar',
      any: ['zig', 'zag'],
      final: 'baz'
    })
    t.ok(f)
    t.equal(f.matches({ foo: 'barmoozigbarzagblahbaz' }), true)
  })

  t.test('match false', async t => {
    const f = new SubstringFilter({
      attribute: 'foo',
      initial: 'bar',
      any: ['biz', 'biz'],
      final: 'baz'
    })
    t.ok(f)
    t.ok(!f.matches({ foo: 'bafmoozigbarzagblahbaz' }))
    t.ok(!f.matches({ baz: 'barbizbizbaz' }))
  })

  t.test('match any', async t => {
    const f = new SubstringFilter({
      attribute: 'foo',
      initial: 'bar'
    })
    t.ok(f)
    t.ok(f.matches({ foo: ['beuha', 'barista'] }))
  })

  t.test('match no-initial', async t => {
    const f = new SubstringFilter({
      attribute: 'foo',
      any: ['foo']
    })
    t.ok(f)
    t.equal(f.toString(), '(foo=*foo*)')
    t.ok(f.matches({ foo: 'foobar' }))
    t.ok(f.matches({ foo: 'barfoo' }))
    t.ok(!f.matches({ foo: 'bar' }))
  })

  t.test('escape for regex in matches', async t => {
    const f = new SubstringFilter({
      attribute: 'fo(o',
      initial: 'ba(r)',
      any: ['zi)g', 'z(ag'],
      final: '(baz)'
    })
    t.ok(f)
    t.ok(f.matches({ 'fo(o': ['ba(r)_zi)g-z(ag~(baz)'] }))
  })

  t.test('obj can be array of attributes', async t => {
    const attributes = Attribute.fromObject({ cn: 'foobar' })
    const f = new SubstringFilter({
      attribute: 'cn',
      initial: 'foo'
    })
    t.equal(f.matches(attributes), true)
  })

  t.test('throws if element not an attribute', async t => {
    const f = new SubstringFilter({
      attribute: 'cn',
      initial: 'foo'
    })
    t.throws(
      () => f.matches([{ cn: 'foo' }]),
      'array element must be an instance of LdapAttribute'
    )
  })

  t.end()
})

tap.test('_toBer', t => {
  t.test('encodes initial', async t => {
    const expected = Buffer.from([
      0xa4, 0x0c, 0x04, 0x03, // substring tag, length, string tag, length
      0x66, 0x6f, 0x6f, // OctetString "foo"
      0x30, 0x05, 0x80, 0x03, // sequence tag, length, context tag, length
      0x62, 0x61, 0x72 // OctetString "bar"
    ])
    const f = new SubstringFilter({ attribute: 'foo', initial: 'bar' })
    const ber = f.toBer()
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.test('encodes any', async t => {
    const expected = Buffer.from([
      0xa4, 0x0c, 0x04, 0x03, // substring tag, length, string tag, length
      0x66, 0x6f, 0x6f, // OctetString "foo"
      0x30, 0x05, 0x81, 0x03, // sequence tag, length, context tag, length
      0x62, 0x61, 0x72 // OctetString "bar"
    ])
    const f = new SubstringFilter({ attribute: 'foo', any: ['bar'] })
    const ber = f.toBer()
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.test('encodes final', async t => {
    const expected = Buffer.from([
      0xa4, 0x0c, 0x04, 0x03, // substring tag, length, string tag, length
      0x66, 0x6f, 0x6f, // OctetString "foo"
      0x30, 0x05, 0x82, 0x03, // sequence tag, length, context tag, length
      0x62, 0x61, 0x72 // OctetString "bar"
    ])
    const f = new SubstringFilter({ attribute: 'foo', final: 'bar' })
    const ber = f.toBer()
    t.equal(expected.compare(ber.buffer), 0)
  })

  t.end()
})

tap.test('parse', async t => {
  t.test('parses initial', async t => {
    const buffer = Buffer.from([
      0xa4, 0x0c, 0x04, 0x03, // substring tag, length, string tag, length
      0x66, 0x6f, 0x6f, // OctetString "foo"
      0x30, 0x05, 0x80, 0x03, // sequence tag, length, context tag, length
      0x62, 0x61, 0x72 // OctetString "bar"
    ])
    const f = SubstringFilter.parse(buffer)
    const ber = f.toBer()
    t.equal(buffer.compare(ber.buffer), 0)
    t.equal(f.attribute, 'foo')
    t.equal(f.initial, 'bar')
  })

  t.test('parses any', async t => {
    const buffer = Buffer.from([
      0xa4, 0x0c, 0x04, 0x03, // substring tag, length, string tag, length
      0x66, 0x6f, 0x6f, // OctetString "foo"
      0x30, 0x05, 0x81, 0x03, // sequence tag, length, context tag, length
      0x62, 0x61, 0x72 // OctetString "bar"
    ])
    const f = SubstringFilter.parse(buffer)
    const ber = f.toBer()
    t.equal(buffer.compare(ber.buffer), 0)
    t.equal(f.attribute, 'foo')
    t.strictSame(f.any, ['bar'])
  })

  t.test('parses final', async t => {
    const buffer = Buffer.from([
      0xa4, 0x0c, 0x04, 0x03, // substring tag, length, string tag, length
      0x66, 0x6f, 0x6f, // OctetString "foo"
      0x30, 0x05, 0x82, 0x03, // sequence tag, length, context tag, length
      0x62, 0x61, 0x72 // OctetString "bar"
    ])
    const f = SubstringFilter.parse(buffer)
    const ber = f.toBer()
    t.equal(buffer.compare(ber.buffer), 0)
    t.equal(f.attribute, 'foo')
    t.equal(f.final, 'bar')
  })
})

tap.test('original node-ldap tests', t => {
  // This set of subtests are from the original "filters/substr" test suite
  // in the core `ldapjs` module code.

  t.test('GH-109 = escape value only in toString()', async t => {
    const f = new SubstringFilter({
      attribute: 'fo(o',
      initial: 'ba(r)',
      any: ['zi)g', 'z(ag'],
      final: '(baz)'
    })
    t.ok(f)
    t.equal(f.attribute, 'fo(o')
    t.equal(f.initial, 'ba(r)')
    t.equal(f.any.length, 2)
    t.equal(f.any[0], 'zi)g')
    t.equal(f.any[1], 'z(ag')
    t.equal(f.final, '(baz)')
    t.equal(f.toString(), '(fo\\28o=ba\\28r\\29*zi\\29g*z\\28ag*\\28baz\\29)')
  })

  t.test('GH-109 = escape for regex in matches', async t => {
    const f = new SubstringFilter({
      attribute: 'fo(o',
      initial: 'ba(r)',
      any: ['zi)g', 'z(ag'],
      final: '(baz)'
    })
    t.ok(f)
    t.ok(f.matches({ 'fo(o': ['ba(r)_zi)g-z(ag~(baz)'] }))
  })

  t.test('GH-109 = to ber uses plain values', async t => {
    let f = new SubstringFilter({
      attribute: 'fo(o',
      initial: 'ba(r)',
      any: ['zi)g', 'z(ag'],
      final: '(baz)'
    })
    t.ok(f)

    const writer = new BerWriter()
    writer.appendBuffer(f.toBer().buffer)

    f = SubstringFilter.parse(writer.buffer)
    t.ok(f)
    t.equal(f.attribute, 'fo(o')
    t.equal(f.initial, 'ba(r)')
    t.equal(f.any.length, 2)
    t.equal(f.any[0], 'zi)g')
    t.equal(f.any[1], 'z(ag')
    t.equal(f.final, '(baz)')
  })

  t.end()
})
