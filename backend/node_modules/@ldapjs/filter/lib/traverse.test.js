// Copyright 2014 Patrick Mooney.  All rights reserved.
'use strict'

const { test } = require('tap')

const filters = require('./index')

test('foreach single', function (t) {
  const f = filters.parseString('(foo=bar)')
  let count = 0
  f.forEach(function (item) {
    t.equal(item.attribute, 'foo')
    t.equal(item.value, 'bar')
    count++
  })
  t.equal(count, 1)
  t.end()
})

test('foreach not', function (t) {
  const f = filters.parseString('(!(foo=bar))')
  const order = []
  let count = 0

  f.forEach(function (item) {
    order.push(item.type)
    if (item.type === 'EqualityFilter') {
      t.equal(item.attribute, 'foo')
      t.equal(item.value, 'bar')
    }
    count++
  })
  t.equal(count, 2)
  t.same(order, ['EqualityFilter', 'NotFilter'])
  t.end()
})

test('foreach multiple', function (t) {
  const f = filters.parseString('(|(foo=bar)(baz>=bip))')
  const order = []
  let count = 0

  f.forEach(function (item) {
    order.push(item.type)
    switch (item.type) {
      case 'EqualityFilter':
        t.equal(item.attribute, 'foo')
        t.equal(item.value, 'bar')
        break
      case 'ge':
        t.equal(item.attribute, 'baz')
        t.equal(item.value, 'bip')
        break
      case 'or':
        t.equal(item.filters.length, 2)
        break
      default:
        break
    }
    count++
  })
  t.equal(count, 3)
  t.same(order, ['EqualityFilter', 'GreaterThanEqualsFilter', 'OrFilter'])
  t.end()
})

test('foreach complex', function (t) {
  const f = filters.parseString('(|(!(&(foo=bar)(num<=5)))(baz>=bip))')
  const correct = ['EqualityFilter', 'LessThanEqualsFilter', 'AndFilter', 'NotFilter', 'GreaterThanEqualsFilter', 'OrFilter']
  const order = []
  let count = 0

  f.forEach(function (item) {
    order.push(item.type)
    count++
  })
  t.same(order, correct)
  t.equal(count, correct.length)
  t.end()
})

test('map single valid', function (t) {
  const f = filters.parseString('(foo=bar)')
  const n = f.map(function (item) {
    item.value = 'new'
    return item
  })
  t.ok(n)
  t.equal(n.value, 'new')
  t.end()
})

test('map single null', function (t) {
  const f = filters.parseString('(foo=bar)')
  const n = f.map(function (item) {
    return null
  })
  t.equal(n, null)
  t.end()
})

test('map not valid', function (t) {
  const f = filters.parseString('(!(foo=bar))')
  f.map(function (item) {
    if (item.attribute) {
      item.value = 'new'
    }
    return item
  })
  t.equal(f.toString(), '(!(foo=new))')
  t.end()
})

test('map not null', function (t) {
  const f = filters.parseString('(!(foo=bar))')
  const n = f.map(function (item) {
    if (item.attribute) {
      return null
    }
    return item
  })
  t.equal(n, null)
  t.end()
})

test('map multiple', function (t) {
  const f = filters.parseString('(|(foo=1)(bar=2))')
  const n = f.map(function (item) {
    if (item.attribute) {
      item.value = '' + (parseInt(item.value, 10) + 1)
    }
    return item
  })
  t.equal(n.toString(), '(|(foo=2)(bar=3))')
  t.end()
})

test('map multiple some-null', function (t) {
  const f = filters.parseString('(|(foo=1)(bar=2))')
  const n = f.map(function (item) {
    if (item.attribute && item.attribute === 'foo') {
      return null
    }
    return item
  })
  t.equal(n.toString(), '(|(bar=2))')
  t.end()
})

test('map multiple all-null', function (t) {
  const f = filters.parseString('(|(foo=1)(bar=2))')
  const n = f.map(function (item) {
    if (item.attribute) {
      return null
    }
    return item
  })
  t.equal(n, null)
  t.end()
})

test('map complex', function (t) {
  const f = filters.parseString('(|(bad=foo)(num>=1)(!(bad=bar))(&(ok=foo)(good=bar)))')
  const n = f.map(function (item) {
    if (item.attribute && item.attribute === 'bad') {
      return null
    } else if (item.type === 'GreaterThanEqualsFilter') {
      item.value = '' + (parseInt(item.value, 10) + 1)
    }
    return item
  })
  t.equal(n.toString(), '(|(num>=2)(&(ok=foo)(good=bar)))')
  t.end()
})
