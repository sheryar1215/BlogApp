'use strict'

const warning = require('process-warning')()

const clazz = 'LdapjsFilterWarning'

warning.create(clazz, 'LDAP_FILTER_DEP_001', 'parse is deprecated. Use the parseString function instead.')

warning.create(clazz, 'LDAP_FILTER_DEP_002', 'subInitial is deprecated. Use initial instead.')

warning.create(clazz, 'LDAP_FILTER_DEP_003', 'subAny is deprecated. Use any instead.')

warning.create(clazz, 'LDAP_FILTER_DEP_004', 'subFinal is deprecated. Use final instead.')

module.exports = warning
