'use strict'

const { Ber } = require('@ldapjs/asn1')

const Control = require('./lib/control')
const EntryChangeNotificationControl = require('./lib/controls/entry-change-notification-control')
const PagedResultsControl = require('./lib/controls/paged-results-control')
const PasswordPolicyControl = require('./lib/controls/password-policy-control')
const PersistentSearchControl = require('./lib/controls/persistent-search-control')
const ServerSideSortingRequestControl = require('./lib/controls/server-side-sorting-request-control')
const ServerSideSortingResponseControl = require('./lib/controls/server-side-sorting-response-control')
const VirtualListViewRequestControl = require('./lib/controls/virtual-list-view-request-control')
const VirtualListViewResponseControl = require('./lib/controls/virtual-list-view-response-control')

module.exports = {

  getControl: function getControl (ber) {
    if (!ber) throw TypeError('ber must be provided')

    if (ber.readSequence() === null) { return null }

    let type
    const opts = {
      criticality: false,
      value: null
    }

    /* istanbul ignore else */
    if (ber.length) {
      const end = ber.offset + ber.length

      type = ber.readString()
      /* istanbul ignore else */
      if (ber.offset < end) {
        /* istanbul ignore else */
        if (ber.peek() === Ber.Boolean) { opts.criticality = ber.readBoolean() }
      }

      if (ber.offset < end) { opts.value = ber.readString(Ber.OctetString, true) }
    }

    let control
    switch (type) {
      case EntryChangeNotificationControl.OID: {
        control = new EntryChangeNotificationControl(opts)
        break
      }

      case PagedResultsControl.OID: {
        control = new PagedResultsControl(opts)
        break
      }

      case PasswordPolicyControl.OID: {
        control = new PasswordPolicyControl(opts)
        break
      }

      case PersistentSearchControl.OID: {
        control = new PersistentSearchControl(opts)
        break
      }

      case ServerSideSortingRequestControl.OID: {
        control = new ServerSideSortingRequestControl(opts)
        break
      }

      case ServerSideSortingResponseControl.OID: {
        control = new ServerSideSortingResponseControl(opts)
        break
      }

      case VirtualListViewRequestControl.OID: {
        control = new VirtualListViewRequestControl(opts)
        break
      }

      case VirtualListViewResponseControl.OID: {
        control = new VirtualListViewResponseControl(opts)
        break
      }

      default: {
        opts.type = type
        control = new Control(opts)
        break
      }
    }

    return control
  },

  Control,
  EntryChangeNotificationControl,
  PagedResultsControl,
  PasswordPolicyControl,
  PersistentSearchControl,
  ServerSideSortingRequestControl,
  ServerSideSortingResponseControl,
  VirtualListViewRequestControl,
  VirtualListViewResponseControl
}
