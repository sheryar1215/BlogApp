'use strict'

const warning = require('process-warning')()
const clazz = 'LdapjsAttributeWarning'

warning.create(clazz, 'LDAP_ATTRIBUTE_DEP_001', 'options.vals is deprecated. Use options.values instead.')
warning.create(clazz, 'LDAP_ATTRIBUTE_DEP_002', 'Instance method .parse is deprecated. Use static .fromBer instead.')
warning.create(clazz, 'LDAP_ATTRIBUTE_DEP_003', 'Instance property .vals is deprecated. Use property .values instead.')

module.exports = warning
