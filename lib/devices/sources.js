'use strict'
// Devices tab: the ONLY list of what the probe reads. A new kind of device = a new class here (and, if Windows keeps it elsewhere, a section in detect.js).
//   SECTIONS     every part of the probe, so one failing part never blanks the others and the page can say which one failed and why
//   PNP_CLASSES  the Windows device classes that can hold something the user plugged in or paired
//   PROPS        the DEVPKEY names read for each device in one batch
const SECTIONS = ['pnp', 'hid', 'monitors', 'bluetooth']
const PNP_CLASSES = ['Mouse', 'Keyboard', 'HIDClass', 'USB', 'MEDIA', 'AudioEndpoint', 'Camera', 'Image', 'Bluetooth', 'XnaComposite', 'XboxComposite', 'Monitor']
const PROPS = ['DEVPKEY_Device_BusReportedDeviceDesc', 'DEVPKEY_Device_ContainerId', 'DEVPKEY_Device_LocationInfo', 'DEVPKEY_Device_Parent', 'DEVPKEY_Device_DriverVersion', 'DEVPKEY_Device_ProblemCode']
module.exports = { SECTIONS, PNP_CLASSES, PROPS }
