'use strict'
// Regenerates the SYNTHETIC dumps (public AMISCE shape, not from a real board). Run: node test/fixtures/bios/make-fixtures.js
const fs = require('fs'), path = require('path')
const T = '\t'
const rec = (name, token, offset, width, ...rest) => [`Setup Question${T}= ${name}`, `Token${T}=${token}${T}// Do NOT change this line`, `Offset${T}=${offset}`, `Width${T}=${width}`, ...rest, '']
const L = [
  `// Script File Name : nvram.txt`, `// Created on 09/02/20 at 07:31:41`, `// Copyright (c)2017 American Megatrends, Inc.`, `// AMISCE Utility. Ver 5.03.1111`, '', '', `HIICrc32= EBED1D4C`, '', '',
  `// FORM SET`, `// GUID${T}= c48aa1ac-f870-418d-a6ef-c1dd89c1ce19`, `// Title${T}= Advanced`, '',
  `// FORM`, `// Form ID${T}= 0x2711`, `// Title${T}= PCI Subsystem`, '',
  ...rec('Above 4G Decoding', '7006', '03', '01', `BIOS Default${T}=0 `, `MFG Default${T}=0 `, `Value${T}=0${T}// Enabled = 1, Disabled = 0`),
  ...rec('Hot-Plug Support', '702A', '04', '01', `BIOS Default${T}=<Disabled>`, `Options${T}=*[00]Disabled${T}// Move "*" to the desired Option`, `${T} [01]Enabled`),
  `// FORM`, `// Form ID${T}= 0x2712`, `// Title${T}= CPU Configuration`, '',
  ...rec('Global C-state Control', '7010', '10', '01', `BIOS Default${T}=<Auto>`, `Options${T}= [00]Disabled${T}// Move "*" to the desired Option`, `${T} [01]Enabled`, `${T}*[0F]Auto`),
  ...rec('CPU Core Voltage Offset', '7020', '20', '02', `BIOS Default${T}=<0>`, `Value${T}=<18>`),
  ...rec('Supervisor Password', '7030', '30', '01', `BIOS Default${T}=0`, `Value${T}=0${T}// Installed = 1, Not Installed = 0`),
]
fs.writeFileSync(path.join(__dirname, 'amisce-basic.txt'), L.join('\r\n') + '\r\n')
fs.writeFileSync(path.join(__dirname, 'amisce-basic-lf.txt'), L.join('\n') + '\n')
