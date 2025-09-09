// Copyright 2011 Mark Cavage <mcavage@gmail.com> All rights reserved.

// If you have no idea what ASN.1 or BER is, see this:
// https://web.archive.org/web/20220314051854/http://luca.ntop.org/Teaching/Appunti/asn1.html

const Ber = require('./ber/index')

// --- Exported API

module.exports = {

  Ber: Ber,

  BerReader: Ber.Reader,

  BerWriter: Ber.Writer

}
