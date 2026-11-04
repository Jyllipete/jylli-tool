'use strict'
// Groups firmware settings "by purpose" for the BIOS workstation tree. First match wins; order matters (security before everything).
;(function (root) {
  const RULES = [
    ['security', /secure ?boot|tpm|\bptt\b|ftpm|password|boot ?guard|bios ?guard|\block\b|write protect|intrusion|sgx|\btxt\b|\bsev\b|measured/i],
    ['memory', /xmp|docp|expo|dram|memory|\bddr|refresh|\bt(cl|rcd|rp|ras|rfc|refi)\b|cas latency|command rate|gear/i],
    ['pcie', /pcie|pci express|\bpci\b|above 4g|resizable|\bbar\b|graphics|\bgpu\b|igpu|display|iommu|vt-?d|aspm|thunderbolt|\bsr-?iov\b/i],
    ['storage', /sata|nvme|raid|ahci|\bm\.2\b|\bvmd\b|optane|\brst\b|hard drive|\bssd\b/i],
    ['cpu', /\bcpu\b|processor|\bcore\b|turbo|boost|hyper-?threading|\bsmt\b|c-?states?|\bratio\b|multiplier|\bsvm\b|vt-?x|virtualization|\bhwp\b|speed ?(step|shift)|\beist\b|cool'?n'?quiet/i],
    ['power', /power|voltage|vcore|current|\btdp\b|\bpl[12]\b|thermal|\bfan\b|energy|p-?state|sleep|\bwake\b|\bac\b|battery|charge|temperature/i],
    ['boot', /boot|\bcsm\b|\blogo\b|\bpost\b|\buefi\b|legacy|numlock|\busb\b/i],
  ]
  const ORDER = ['cpu', 'power', 'memory', 'pcie', 'storage', 'security', 'boot', 'other']

  /** Category id for a normalised setting ({ name, path }). */
  function categoryOf(s) {
    const hay = `${s.name || ''} ${(s.path || []).join(' ')}`
    for (const [id, re] of RULES) if (re.test(hay)) return id
    return 'other'
  }

  const api = { categoryOf, ORDER }
  root.JylliBiosCategory = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
