'use strict'

const tap = require('tap')
const parse = require('./parse-string')

const EqualityFilter = require('../filters/equality')
function checkFilters (t, expectedObjects) {
  for (const expected of expectedObjects) {
    const f = parse(expected.str)
    t.ok(f, 'Parsed "' + expected.str + '"')
    t.equal(f.type, expected.type)
    t.equal(f.attribute, 'foo')
    t.equal(f.value, expected.val)
    t.equal(f.toString(), expected.output)
  }
}

tap.test('requires valid input', async t => {
  t.throws(
    () => parse(),
    Error('input must be a string')
  )
  t.throws(
    () => parse(''),
    Error('input string cannot be empty')
  )
})

tap.test('wraps a string with parentheses', async t => {
  const f = parse('cn=foo')
  t.type(f, EqualityFilter)
  t.equal(f.toString(), '(cn=foo)')
})

tap.test('parses a filter', async t => {
  const f = parse('(cn=foo)')
  t.type(f, EqualityFilter)
  t.equal(f.toString(), '(cn=foo)')
})

tap.test('XML Strings in filter', async t => {
  const str = '(&(CentralUIEnrollments=<mydoc>*)(objectClass=User))'
  const f = parse(str)
  t.ok(f)
  t.ok(f.filters)
  t.equal(f.filters.length, 2)

  for (const filter of f.filters) {
    t.ok(filter.attribute)
  }
})

tap.test('= in filter', async t => {
  const str = '(uniquemember=uuid=930896af-bf8c-48d4-885c-6573a94b1853, ' +
    'ou=users, o=smartdc)'
  const f = parse(str)
  t.ok(f)
  t.equal(f.attribute, 'uniquemember')
  t.equal(f.value,
    'uuid=930896af-bf8c-48d4-885c-6573a94b1853, ou=users, o=smartdc')
  t.equal(f.toString(),
    '(uniquemember=uuid=930896af-bf8c-48d4-885c-6573a94b1853, ' +
    'ou=users, o=smartdc)')
})

tap.test('( in filter', async t => {
  const str = 'foo=bar\\28'
  const f = parse(str)
  t.ok(f)
  t.equal(f.attribute, 'foo')
  t.equal(f.value, 'bar\\28')
  t.equal(f.toString(), '(foo=bar\\28)')
})

tap.test(') in filter', async t => {
  const str = '(foo=bar\\29)'
  const f = parse(str)
  t.ok(f)
  t.equal(f.attribute, 'foo')
  t.equal(f.value, 'bar\\29')
  t.equal(f.toString(), '(foo=bar\\29)')
})

tap.test('newlines in filter', async t => {
  const v1 = '\\0a'
  const v1Literal = '\n'
  const v2 = 'bar\\0a'
  const v2Literal = 'bar\n'
  const v3 = '\\0abar'
  const v3Literal = '\nbar'
  checkFilters(t, [
    { str: '(foo=\n)', type: 'EqualityFilter', val: v1Literal, output: '(foo=\\0a)' },
    { str: '(foo<=\n)', type: 'LessThanEqualsFilter', val: v1Literal, output: '(foo<=\\0a)' },
    { str: '(foo>=\n)', type: 'GreaterThanEqualsFilter', val: v1Literal, output: '(foo>=\\0a)' },
    { str: '(foo=\\0a)', type: 'EqualityFilter', val: v1, output: '(foo=\\0a)' },
    { str: '(foo<=\\0a)', type: 'LessThanEqualsFilter', val: v1, output: '(foo<=\\0a)' },
    { str: '(foo>=\\0a)', type: 'GreaterThanEqualsFilter', val: v1, output: '(foo>=\\0a)' },
    { str: '(foo=bar\n)', type: 'EqualityFilter', val: v2Literal, output: '(foo=bar\\0a)' },
    { str: '(foo<=bar\n)', type: 'LessThanEqualsFilter', val: v2Literal, output: '(foo<=bar\\0a)' },
    { str: '(foo>=bar\n)', type: 'GreaterThanEqualsFilter', val: v2Literal, output: '(foo>=bar\\0a)' },
    { str: '(foo=bar\\0a)', type: 'EqualityFilter', val: v2, output: '(foo=bar\\0a)' },
    { str: '(foo<=bar\\0a)', type: 'LessThanEqualsFilter', val: v2, output: '(foo<=bar\\0a)' },
    { str: '(foo>=bar\\0a)', type: 'GreaterThanEqualsFilter', val: v2, output: '(foo>=bar\\0a)' },
    { str: '(foo=\nbar)', type: 'EqualityFilter', val: v3Literal, output: '(foo=\\0abar)' },
    { str: '(foo<=\nbar)', type: 'LessThanEqualsFilter', val: v3Literal, output: '(foo<=\\0abar)' },
    { str: '(foo>=\nbar)', type: 'GreaterThanEqualsFilter', val: v3Literal, output: '(foo>=\\0abar)' },
    { str: '(foo=\\0abar)', type: 'EqualityFilter', val: v3, output: '(foo=\\0abar)' },
    { str: '(foo<=\\0abar)', type: 'LessThanEqualsFilter', val: v3, output: '(foo<=\\0abar)' },
    { str: '(foo>=\\0abar)', type: 'GreaterThanEqualsFilter', val: v3, output: '(foo>=\\0abar)' }
  ])
})

tap.test('carriage returns in filter', async t => {
  const v1 = '\\0d'
  const v1Literal = '\r'
  const v2 = 'bar\\0d'
  const v2Literal = 'bar\r'
  const v3 = '\\0dbar'
  const v3Literal = '\rbar'
  checkFilters(t, [
    { str: '(foo=\r)', type: 'EqualityFilter', val: v1Literal, output: '(foo=\\0d)' },
    { str: '(foo<=\r)', type: 'LessThanEqualsFilter', val: v1Literal, output: '(foo<=\\0d)' },
    { str: '(foo>=\r)', type: 'GreaterThanEqualsFilter', val: v1Literal, output: '(foo>=\\0d)' },
    { str: '(foo=\\0d)', type: 'EqualityFilter', val: v1, output: '(foo=\\0d)' },
    { str: '(foo<=\\0d)', type: 'LessThanEqualsFilter', val: v1, output: '(foo<=\\0d)' },
    { str: '(foo>=\\0d)', type: 'GreaterThanEqualsFilter', val: v1, output: '(foo>=\\0d)' },
    { str: '(foo=bar\r)', type: 'EqualityFilter', val: v2Literal, output: '(foo=bar\\0d)' },
    { str: '(foo<=bar\r)', type: 'LessThanEqualsFilter', val: v2Literal, output: '(foo<=bar\\0d)' },
    { str: '(foo>=bar\r)', type: 'GreaterThanEqualsFilter', val: v2Literal, output: '(foo>=bar\\0d)' },
    { str: '(foo=bar\\0d)', type: 'EqualityFilter', val: v2, output: '(foo=bar\\0d)' },
    { str: '(foo<=bar\\0d)', type: 'LessThanEqualsFilter', val: v2, output: '(foo<=bar\\0d)' },
    { str: '(foo>=bar\\0d)', type: 'GreaterThanEqualsFilter', val: v2, output: '(foo>=bar\\0d)' },
    { str: '(foo=\rbar)', type: 'EqualityFilter', val: v3Literal, output: '(foo=\\0dbar)' },
    { str: '(foo<=\rbar)', type: 'LessThanEqualsFilter', val: v3Literal, output: '(foo<=\\0dbar)' },
    { str: '(foo>=\rbar)', type: 'GreaterThanEqualsFilter', val: v3Literal, output: '(foo>=\\0dbar)' },
    { str: '(foo=\\0dbar)', type: 'EqualityFilter', val: v3, output: '(foo=\\0dbar)' },
    { str: '(foo<=\\0dbar)', type: 'LessThanEqualsFilter', val: v3, output: '(foo<=\\0dbar)' },
    { str: '(foo>=\\0dbar)', type: 'GreaterThanEqualsFilter', val: v3, output: '(foo>=\\0dbar)' }
  ])
})

tap.test('tabs in filter', async t => {
  const v1 = '\\09'
  const v1Literal = '\t'
  const v2 = 'bar\\09'
  const v2Literal = 'bar\t'
  const v3 = '\\09bar'
  const v3Literal = '\tbar'
  checkFilters(t, [
    { str: '(foo=\t)', type: 'EqualityFilter', val: v1Literal, output: '(foo=\\09)' },
    { str: '(foo<=\t)', type: 'LessThanEqualsFilter', val: v1Literal, output: '(foo<=\\09)' },
    { str: '(foo>=\t)', type: 'GreaterThanEqualsFilter', val: v1Literal, output: '(foo>=\\09)' },
    { str: '(foo=\\09)', type: 'EqualityFilter', val: v1, output: '(foo=\\09)' },
    { str: '(foo<=\\09)', type: 'LessThanEqualsFilter', val: v1, output: '(foo<=\\09)' },
    { str: '(foo>=\\09)', type: 'GreaterThanEqualsFilter', val: v1, output: '(foo>=\\09)' },
    { str: '(foo=bar\t)', type: 'EqualityFilter', val: v2Literal, output: '(foo=bar\\09)' },
    { str: '(foo<=bar\t)', type: 'LessThanEqualsFilter', val: v2Literal, output: '(foo<=bar\\09)' },
    { str: '(foo>=bar\t)', type: 'GreaterThanEqualsFilter', val: v2Literal, output: '(foo>=bar\\09)' },
    { str: '(foo=bar\\09)', type: 'EqualityFilter', val: v2, output: '(foo=bar\\09)' },
    { str: '(foo<=bar\\09)', type: 'LessThanEqualsFilter', val: v2, output: '(foo<=bar\\09)' },
    { str: '(foo>=bar\\09)', type: 'GreaterThanEqualsFilter', val: v2, output: '(foo>=bar\\09)' },
    { str: '(foo=\tbar)', type: 'EqualityFilter', val: v3Literal, output: '(foo=\\09bar)' },
    { str: '(foo<=\tbar)', type: 'LessThanEqualsFilter', val: v3Literal, output: '(foo<=\\09bar)' },
    { str: '(foo>=\tbar)', type: 'GreaterThanEqualsFilter', val: v3Literal, output: '(foo>=\\09bar)' },
    { str: '(foo=\\09bar)', type: 'EqualityFilter', val: v3, output: '(foo=\\09bar)' },
    { str: '(foo<=\\09bar)', type: 'LessThanEqualsFilter', val: v3, output: '(foo<=\\09bar)' },
    { str: '(foo>=\\09bar)', type: 'GreaterThanEqualsFilter', val: v3, output: '(foo>=\\09bar)' }
  ])
})

tap.test('spaces in filter', async t => {
  const v1 = ' '
  const v2 = 'bar '
  const v3 = ' bar'
  checkFilters(t, [
    { str: '(foo= )', type: 'EqualityFilter', val: v1, output: '(foo= )' },
    { str: '(foo<= )', type: 'LessThanEqualsFilter', val: v1, output: '(foo<= )' },
    { str: '(foo>= )', type: 'GreaterThanEqualsFilter', val: v1, output: '(foo>= )' },
    { str: '(foo=\\20)', type: 'EqualityFilter', val: '\\20', output: '(foo=\\20)' },
    { str: '(foo<=\\20)', type: 'LessThanEqualsFilter', val: '\\20', output: '(foo<=\\20)' },
    { str: '(foo>=\\20)', type: 'GreaterThanEqualsFilter', val: '\\20', output: '(foo>=\\20)' },
    { str: '(foo=bar )', type: 'EqualityFilter', val: v2, output: '(foo=bar )' },
    { str: '(foo<=bar )', type: 'LessThanEqualsFilter', val: v2, output: '(foo<=bar )' },
    { str: '(foo>=bar )', type: 'GreaterThanEqualsFilter', val: v2, output: '(foo>=bar )' },
    { str: '(foo=bar\\20)', type: 'EqualityFilter', val: 'bar\\20', output: '(foo=bar\\20)' },
    { str: '(foo<=bar\\20)', type: 'LessThanEqualsFilter', val: 'bar\\20', output: '(foo<=bar\\20)' },
    { str: '(foo>=bar\\20)', type: 'GreaterThanEqualsFilter', val: 'bar\\20', output: '(foo>=bar\\20)' },
    { str: '(foo= bar)', type: 'EqualityFilter', val: v3, output: '(foo= bar)' },
    { str: '(foo<= bar)', type: 'LessThanEqualsFilter', val: v3, output: '(foo<= bar)' },
    { str: '(foo>= bar)', type: 'GreaterThanEqualsFilter', val: v3, output: '(foo>= bar)' },
    { str: '(foo=\\20bar)', type: 'EqualityFilter', val: '\\20bar', output: '(foo=\\20bar)' },
    { str: '(foo<=\\20bar)', type: 'LessThanEqualsFilter', val: '\\20bar', output: '(foo<=\\20bar)' },
    { str: '(foo>=\\20bar)', type: 'GreaterThanEqualsFilter', val: '\\20bar', output: '(foo>=\\20bar)' }
  ])
})

tap.test('literal \\ in filter', async t => {
  const v1 = 'bar\\5c'
  const v2 = '\\5cbar\\5cbaz\\5c'
  const v3 = '\\5c'
  checkFilters(t, [
    { str: '(foo=bar\\5c)', type: 'EqualityFilter', val: v1, output: '(foo=bar\\5c)' },
    { str: '(foo<=bar\\5c)', type: 'LessThanEqualsFilter', val: v1, output: '(foo<=bar\\5c)' },
    { str: '(foo>=bar\\5c)', type: 'GreaterThanEqualsFilter', val: v1, output: '(foo>=bar\\5c)' },
    {
      str: '(foo=\\5cbar\\5cbaz\\5c)',
      type: 'EqualityFilter',
      val: v2,
      output: '(foo=\\5cbar\\5cbaz\\5c)'
    },
    {
      str: '(foo>=\\5cbar\\5cbaz\\5c)',
      type: 'GreaterThanEqualsFilter',
      val: v2,
      output: '(foo>=\\5cbar\\5cbaz\\5c)'
    },
    {
      str: '(foo<=\\5cbar\\5cbaz\\5c)',
      type: 'LessThanEqualsFilter',
      val: v2,
      output: '(foo<=\\5cbar\\5cbaz\\5c)'
    },
    { str: '(foo=\\5c)', type: 'EqualityFilter', val: v3, output: '(foo=\\5c)' },
    { str: '(foo<=\\5c)', type: 'LessThanEqualsFilter', val: v3, output: '(foo<=\\5c)' },
    { str: '(foo>=\\5c)', type: 'GreaterThanEqualsFilter', val: v3, output: '(foo>=\\5c)' }
  ])
})

tap.test('\\0 in filter', async t => {
  const str = '(foo=bar\\00)'
  const f = parse(str)
  t.ok(f)
  t.equal(f.attribute, 'foo')
  t.equal(f.value, 'bar\\00')
  t.equal(f.toString(), '(foo=bar\\00)')
})

tap.test('literal * in filters', async t => {
  const v1 = 'bar\\2a'
  const v2 = '\\2abar\\2abaz\\2a'
  const v3 = '\\2a'
  checkFilters(t, [
    { str: '(foo=bar\\2a)', type: 'EqualityFilter', val: v1, output: '(foo=bar\\2a)' },
    { str: '(foo<=bar\\2a)', type: 'LessThanEqualsFilter', val: v1, output: '(foo<=bar\\2a)' },
    { str: '(foo>=bar\\2a)', type: 'GreaterThanEqualsFilter', val: v1, output: '(foo>=bar\\2a)' },
    {
      str: '(foo=\\2abar\\2abaz\\2a)',
      type: 'EqualityFilter',
      val: v2,
      output: '(foo=\\2abar\\2abaz\\2a)'
    },
    {
      str: '(foo>=\\2abar\\2abaz\\2a)',
      type: 'GreaterThanEqualsFilter',
      val: v2,
      output: '(foo>=\\2abar\\2abaz\\2a)'
    },
    {
      str: '(foo<=\\2abar\\2abaz\\2a)',
      type: 'LessThanEqualsFilter',
      val: v2,
      output: '(foo<=\\2abar\\2abaz\\2a)'
    },
    { str: '(foo=\\2a)', type: 'EqualityFilter', val: v3, output: '(foo=\\2a)' },
    { str: '(foo<=\\2a)', type: 'LessThanEqualsFilter', val: v3, output: '(foo<=\\2a)' },
    { str: '(foo>=\\2a)', type: 'GreaterThanEqualsFilter', val: v3, output: '(foo>=\\2a)' }
  ])
})

tap.test('escaped * in substr filter (prefix)', async t => {
  const str = '(foo=bar\\2a*)'
  const f = parse(str)
  t.ok(f)
  t.equal(f.type, 'SubstringFilter')
  t.equal(f.attribute, 'foo')
  t.equal(f.initial, 'bar\\2a')
  t.equal(f.any.length, 0)
  t.equal(f.final, '')
  t.equal(f.toString(), '(foo=bar\\2a*)')
})

tap.test('<= in filters', async t => {
  checkFilters(t, [
    { str: '(foo=<=)', type: 'EqualityFilter', val: '<=', output: '(foo=<=)' },
    { str: '(foo<=<=)', type: 'LessThanEqualsFilter', val: '<=', output: '(foo<=<=)' },
    { str: '(foo>=<=)', type: 'GreaterThanEqualsFilter', val: '<=', output: '(foo>=<=)' },
    {
      str: '(foo=bar<=baz)',
      type: 'EqualityFilter',
      val: 'bar<=baz',
      output: '(foo=bar<=baz)'
    },
    {
      str: '(foo<=bar<=baz)',
      type: 'LessThanEqualsFilter',
      val: 'bar<=baz',
      output: '(foo<=bar<=baz)'
    },
    {
      str: '(foo>=bar<=baz)',
      type: 'GreaterThanEqualsFilter',
      val: 'bar<=baz',
      output: '(foo>=bar<=baz)'
    },
    {
      str: '(foo=bar<=)',
      type: 'EqualityFilter',
      val: 'bar<=',
      output: '(foo=bar<=)'
    },
    { str: '(foo<=bar<=)', type: 'LessThanEqualsFilter', val: 'bar<=', output: '(foo<=bar<=)' },
    { str: '(foo>=bar<=)', type: 'GreaterThanEqualsFilter', val: 'bar<=', output: '(foo>=bar<=)' }
  ])
})

tap.test('>= in filters', async t => {
  checkFilters(t, [
    { str: '(foo=>=)', type: 'EqualityFilter', val: '>=', output: '(foo=>=)' },
    { str: '(foo<=>=)', type: 'LessThanEqualsFilter', val: '>=', output: '(foo<=>=)' },
    { str: '(foo>=>=)', type: 'GreaterThanEqualsFilter', val: '>=', output: '(foo>=>=)' },
    {
      str: '(foo=bar>=baz)',
      type: 'EqualityFilter',
      val: 'bar>=baz',
      output: '(foo=bar>=baz)'
    },
    {
      str: '(foo<=bar>=baz)',
      type: 'LessThanEqualsFilter',
      val: 'bar>=baz',
      output: '(foo<=bar>=baz)'
    },
    {
      str: '(foo>=bar>=baz)',
      type: 'GreaterThanEqualsFilter',
      val: 'bar>=baz',
      output: '(foo>=bar>=baz)'
    },
    { str: '(foo=bar>=)', type: 'EqualityFilter', val: 'bar>=', output: '(foo=bar>=)' },
    { str: '(foo<=bar>=)', type: 'LessThanEqualsFilter', val: 'bar>=', output: '(foo<=bar>=)' },
    { str: '(foo>=bar>=)', type: 'GreaterThanEqualsFilter', val: 'bar>=', output: '(foo>=bar>=)' }
  ])
})

tap.test('& in filters', async t => {
  checkFilters(t, [
    { str: '(foo=&)', type: 'EqualityFilter', val: '&', output: '(foo=&)' },
    { str: '(foo<=&)', type: 'LessThanEqualsFilter', val: '&', output: '(foo<=&)' },
    { str: '(foo>=&)', type: 'GreaterThanEqualsFilter', val: '&', output: '(foo>=&)' },
    {
      str: '(foo=bar&baz)',
      type: 'EqualityFilter',
      val: 'bar&baz',
      output: '(foo=bar&baz)'
    },
    {
      str: '(foo<=bar&baz)',
      type: 'LessThanEqualsFilter',
      val: 'bar&baz',
      output: '(foo<=bar&baz)'
    },
    {
      str: '(foo>=bar&baz)',
      type: 'GreaterThanEqualsFilter',
      val: 'bar&baz',
      output: '(foo>=bar&baz)'
    },
    { str: '(foo=bar&)', type: 'EqualityFilter', val: 'bar&', output: '(foo=bar&)' },
    { str: '(foo<=bar&)', type: 'LessThanEqualsFilter', val: 'bar&', output: '(foo<=bar&)' },
    { str: '(foo>=bar&)', type: 'GreaterThanEqualsFilter', val: 'bar&', output: '(foo>=bar&)' }
  ])
})

tap.test('| in filters', async t => {
  checkFilters(t, [
    { str: '(foo=|)', type: 'EqualityFilter', val: '|', output: '(foo=|)' },
    { str: '(foo<=|)', type: 'LessThanEqualsFilter', val: '|', output: '(foo<=|)' },
    { str: '(foo>=|)', type: 'GreaterThanEqualsFilter', val: '|', output: '(foo>=|)' },
    {
      str: '(foo=bar|baz)',
      type: 'EqualityFilter',
      val: 'bar|baz',
      output: '(foo=bar|baz)'
    },
    {
      str: '(foo<=bar|baz)',
      type: 'LessThanEqualsFilter',
      val: 'bar|baz',
      output: '(foo<=bar|baz)'
    },
    {
      str: '(foo>=bar|baz)',
      type: 'GreaterThanEqualsFilter',
      val: 'bar|baz',
      output: '(foo>=bar|baz)'
    },
    { str: '(foo=bar|)', type: 'EqualityFilter', val: 'bar|', output: '(foo=bar|)' },
    { str: '(foo<=bar|)', type: 'LessThanEqualsFilter', val: 'bar|', output: '(foo<=bar|)' },
    { str: '(foo>=bar|)', type: 'GreaterThanEqualsFilter', val: 'bar|', output: '(foo>=bar|)' }
  ])
})

tap.test('! in filters', async t => {
  checkFilters(t, [
    { str: '(foo=!)', type: 'EqualityFilter', val: '!', output: '(foo=!)' },
    { str: '(foo<=!)', type: 'LessThanEqualsFilter', val: '!', output: '(foo<=!)' },
    { str: '(foo>=!)', type: 'GreaterThanEqualsFilter', val: '!', output: '(foo>=!)' },
    {
      str: '(foo=bar!baz)',
      type: 'EqualityFilter',
      val: 'bar!baz',
      output: '(foo=bar!baz)'
    },
    {
      str: '(foo<=bar!baz)',
      type: 'LessThanEqualsFilter',
      val: 'bar!baz',
      output: '(foo<=bar!baz)'
    },
    {
      str: '(foo>=bar!baz)',
      type: 'GreaterThanEqualsFilter',
      val: 'bar!baz',
      output: '(foo>=bar!baz)'
    },
    { str: '(foo=bar!)', type: 'EqualityFilter', val: 'bar!', output: '(foo=bar!)' },
    { str: '(foo<=bar!)', type: 'LessThanEqualsFilter', val: 'bar!', output: '(foo<=bar!)' },
    { str: '(foo>=bar!)', type: 'GreaterThanEqualsFilter', val: 'bar!', output: '(foo>=bar!)' }
  ])
})

tap.test('bogus filters', async t => {
  t.throws(() => parse('foo>1'), 'junk')

  t.throws(() => parse('(&(valid=notquite)())'), 'empty parens')

  t.throws(() => parse('(&(valid=notquite)wut)'), 'cruft inside AndFilter')

  t.throws(() => parse('foo!=1'), 'fake operator')
})

tap.test('mismatched parens', async t => {
  t.throws(() => parse('(foo=1'), 'missing last paren')

  t.throws(() => parse('(foo=1\\29'), 'missing last paren')

  t.throws(() => parse('foo=1)a)'), 'trailing paren')

  t.throws(() => parse('(foo=1)trailing'), 'trailing text')

  t.throws(() => parse('leading(foo=1)'), 'leading text')
})

tap.test('garbage in subfilter not allowed', async t => {
  t.throws(() => parse('(&(foo=bar)|(baz=quux)(hello=world))'), '| subfilter without parens not allowed')

  t.throws(() => parse('(&(foo=bar)!(baz=quux)(hello=world))'), '! subfilter without parens not allowed')

  t.throws(() => parse('(&(foo=bar)&(baz=quux)(hello=world))'), '& subfilter without parens not allowed')

  t.throws(() => parse('(&(foo=bar)g(baz=quux)(hello=world))'))

  t.throws(() => parse('(&(foo=bar)=(baz=quux)(hello=world))'))

  t.throws(() => parse('(&foo=bar)'))

  t.throws(() => parse('(|foo=bar)'))

  t.throws(() => parse('(!foo=bar)'))

  t.throws(() => parse('(!(foo=bar)a'))
})

tap.test('nested parens', async t => {
  t.throws(() => parse('((foo=bar))'))
})

tap.test('tolerate underscores in names', async t => {
  let f = parse('(foo_bar=val)')
  t.ok(f)
  t.equal(f.attribute, 'foo_bar')
  f = parse('(_leading=val)')
  t.ok(f)
  t.equal(f.attribute, '_leading')
})
