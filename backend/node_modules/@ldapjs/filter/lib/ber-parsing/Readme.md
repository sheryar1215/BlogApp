The code in this directory implements parsing of BER encoded representations
of LDAP filters as defined in https://datatracker.ietf.org/doc/html/rfc4515#section-2.
In short, it decodes messages according to the ASN.1:

```
Filter ::= CHOICE {
  and             [0]     SET OF Filter,
  or              [1]     SET OF Filter,
  not             [2]     Filter,
  equalityMatch   [3]     AttributeValueAssertion,
  substrings      [4]     SubstringFilter,
  greaterOrEqual  [5]     AttributeValueAssertion,
  lessOrEqual     [6]     AttributeValueAssertion,
  present         [7]     AttributeType,
  approxMatch     [8]     AttributeValueAssertion,
  extensibleMatch [9]     MatchingRuleAssertion --v3 only
}
SubstringFilter ::= SEQUENCE {
  type               AttributeType,
  SEQUENCE OF CHOICE {
    initial          [0] IA5String,
    any              [1] IA5String,
    final            [2] IA5String
  }
}
```

Along with the `extensibleMatch` that was added in LDAPv3:

```
MatchingRuleAssertion ::= SEQUENCE {
  matchingRule    [1] MatchingRuleID OPTIONAL,
  type            [2] AttributeDescription OPTIONAL,
  matchValue      [3] AssertionValue,
  dnAttributes    [4] BOOLEAN DEFAULT FALSE
}
```

Remember: the bracketed numbers represent the context specific tag identifier.
