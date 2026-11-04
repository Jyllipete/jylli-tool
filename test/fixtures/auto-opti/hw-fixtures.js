'use strict'
// Hardware fixtures for the applicability matrix: each is a SystemProfile built from the healthy desktop, bent to one real-world rig.
const { P } = require('./profiles')

const gpu = (name, vendor, discrete) => ({ name, vendor, discrete, driverVersion: '1', driverDate: '2026-09-01', driverAgeDays: 60, hagsCapable: discrete })
const gpuList = (...gs) => gs.map(g => ({ name: g.name, vendor: g.vendor, integrated: !g.discrete }))
const withGpus = (p, ...gs) => Object.assign(p, { gpus: gs, gpuList: gpuList(...gs) })

const FX = {
  'raptor-4090': () => withGpus(Object.assign(P.healthy(), {
    cpu: { name: 'Intel(R) Core(TM) i9-14900K', vendor: 'intel', cores: 24, threads: 32, x3d: 'none' },
    cpuX: { hybrid: true, pCores: 8, eCores: 16, llcGroups: 1, microcode: 0x129 }, sys: { build: 26100, vbsRunning: true, hvciRunning: true, hypervisorPresent: true, pcSystemType: 1 },
  }), gpu('NVIDIA GeForce RTX 4090', 'nvidia', true)),
  'optimus-laptop': () => withGpus(Object.assign(P.healthy(), {
    formFactor: 'laptop', cpu: { name: '13th Gen Intel(R) Core(TM) i7-13700H', vendor: 'intel', cores: 14, threads: 20, x3d: 'none' },
    net: { primary: 'wifi', name: 'Wi-Fi', desc: 'Intel AX211', speed: '1 Gbps', eee: 'n/a' },
    netX: { vendor: 'intel', props: [{ name: 'Roaming Aggressiveness', value: '3. Medium', keyword: 'RoamAggressiveness', valid: ['1. Lowest', '3. Medium'] }] },
  }), gpu('Intel(R) Iris(R) Xe Graphics', 'intel', false), gpu('NVIDIA GeForce RTX 4060 Laptop GPU', 'nvidia', true)),
  'x3d-7950': () => withGpus(Object.assign(P['x3d-desktop'](), { cpuX: { hybrid: false, llcGroups: 2 } }), gpu('AMD Radeon RX 7900 XTX', 'amd', true)),
  'x3d-7800': () => withGpus(Object.assign(P['x3d-single'](), { cpuX: { hybrid: false, llcGroups: 1 } }), gpu('NVIDIA GeForce RTX 4070', 'nvidia', true)),
  'x3d-9950': () => withGpus(Object.assign(P.healthy(), { cpu: { name: 'AMD Ryzen 9 9950X3D', vendor: 'amd', cores: 16, threads: 32, x3d: 'dual' } }), gpu('NVIDIA GeForce RTX 5080', 'nvidia', true)),
  'arrow-lake': () => withGpus(Object.assign(P.healthy(), { cpu: { name: 'Intel(R) Core(TM) Ultra 9 285K', vendor: 'intel', cores: 24, threads: 24, x3d: 'none' } }), gpu('NVIDIA GeForce RTX 5070 Ti', 'nvidia', true)),
  'old-win10-hdd': () => withGpus(Object.assign(P.healthy(), {
    os: { build: 19045, ubr: 1, edition: 'Core', win11: false }, cpu: { name: 'AMD Ryzen 5 3600 6-Core Processor', vendor: 'amd', cores: 6, threads: 12, x3d: 'none' },
    storage: { ...P.healthy().storage, ssd: false }, ram: { ...P.healthy().ram, totalGB: 8 },
  }), gpu('NVIDIA GeForce GTX 1060 6GB', 'nvidia', true)),
  'arc-a770': () => withGpus(P.healthy(), gpu('Intel(R) Arc(TM) A770 Graphics', 'intel', true)),
  'sandy-bridge': () => withGpus(Object.assign(P.healthy(), {
    os: { build: 19045, ubr: 1, edition: 'Core', win11: false }, cpu: { name: 'Intel(R) Core(TM) i7-7700K CPU @ 4.20GHz', vendor: 'intel', cores: 4, threads: 8, x3d: 'none' },
  }), gpu('AMD Radeon RX 580', 'amd', true)),
  'wifi-desktop': () => withGpus(Object.assign(P.healthy(), { net: { primary: 'wifi', name: 'Wi-Fi', desc: 'Intel AX200', speed: '1 Gbps', eee: 'n/a' } }), gpu('NVIDIA GeForce RTX 3060', 'nvidia', true)),
  // A desktop with everything Maximum mode looks at known: clean of domain/anti-cheat/virtualization, Wi-Fi tunable, a stale FTH list.
  'max-desktop': () => withGpus(Object.assign(P.healthy(), {
    cpu: { name: 'Intel(R) Core(TM) i7-13700K', vendor: 'intel', cores: 16, threads: 24, x3d: 'none' },
    cpuX: { hybrid: true, pCores: 8, eCores: 8, llcGroups: 1, microcode: 0x129 },
    sys: { build: 26100, vbsRunning: true, hvciRunning: true, hypervisorPresent: true, pcSystemType: 1, partOfDomain: false, antiCheat: [], fthCount: 3, services: { wsl: false, docker: false, hyperV: false, vmp: false } },
    background: { ...P.healthy().background, bgAppsOff: false },
    context: { apps: { games: 12 } },
    netX: { vendor: 'realtek', props: [{ name: 'Interrupt Moderation', value: 'Enabled', keyword: '*InterruptModeration', valid: ['Enabled', 'Disabled'] }] },
  }), gpu('NVIDIA GeForce RTX 4070', 'nvidia', true)),
  'unknown-all': () => ({ v: 1, probes: {} }),
}

module.exports = { FX }
