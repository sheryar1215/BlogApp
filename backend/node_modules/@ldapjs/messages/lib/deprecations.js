'use strict'

const warning = require('process-warning')()
const clazz = 'LdapjsMessageWarning'

warning.create(clazz, 'LDAP_MESSAGE_DEP_001', 'messageID is deprecated. Use messageId instead.')

warning.create(clazz, 'LDAP_MESSAGE_DEP_002', 'The .json property is deprecated. Use .pojo instead.')

warning.create(clazz, 'LDAP_MESSAGE_DEP_003', 'abandonID is deprecated. Use abandonId instead.')

warning.create(clazz, 'LDAP_MESSAGE_DEP_004', 'errorMessage is deprecated. Use diagnosticMessage instead.')

warning.create(clazz, 'LDAP_ATTRIBUTE_SPEC_ERR_001', 'received attempt to define attribute with an empty name: attribute skipped.', { unlimited: true })

module.exports = warning
