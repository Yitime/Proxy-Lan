import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'
import zeroLocalStorage from '../localstorage-polyfill.js'

function loadRuntime() {
  const context = {
    console: { log() {}, error() {}, warn() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, TextEncoder, crypto: webcrypto
  }
  context.window = context
  for (const file of ['omega_pac.min.js', 'omega_target.min.js', 'omega_target_chromium_extension.min.js']) {
    vm.runInNewContext(fs.readFileSync(new URL('../js/' + file, import.meta.url), 'utf8'), context, { filename: file })
  }
  return context
}

function createOptions() {
  const context = loadRuntime()
  const target = context.OmegaTarget
  const storage = new context.OmegaTarget.Storage()
  const state = new context.OmegaTarget.Storage()
  const applied = []
  const proxy = {
    features: {},
    applyProfile(profile) {
      applied.push(profile.name)
      return target.Promise.resolve()
    }
  }
  const options = new target.Options(storage, state, target.Log, proxy)
  return { context, target, storage, state, options, applied }
}

function legacyOptions(options) {
  const snapshot = JSON.parse(JSON.stringify(options.getDefaultOptions()))
  snapshot['-downloadInterval'] = -1
  snapshot['-customCss'] = 'body { display: none; }'
  snapshot['-exportLegacyRuleList'] = true
  snapshot['-enableQuickSwitch'] = true
  snapshot['-quickSwitchProfiles'] = ['direct', 'work']
  snapshot['-monitorWebRequests'] = true
  snapshot['-showConditionTypes'] = 1
  snapshot['+work'] = {
    name: 'work', profileType: 'FixedProfile', color: '#99ccee', bypassList: [],
    fallbackProxy: { scheme: 'http', host: 'localhost', port: 8080 },
    syncOptions: 'disabled', syncError: 'quota exceeded'
  }
  snapshot['+rules'] = {
    name: 'rules', profileType: 'SwitchProfile', color: '#99ccee',
    defaultProfileName: 'direct',
    rules: [{ condition: { conditionType: 'HostWildcardCondition', pattern: '*.example.com' }, profileName: 'work' }]
  }
  return snapshot
}

test('builtin display names survive reload while mode identities and routing remain unchanged', async () => {
  const setup = createOptions()
  const snapshot = legacyOptions(setup.options)
  snapshot['-builtinProfiles'] = {
    '+system': { name: 'system', profileType: 'SystemProfile', color: '#315fd4', displayName: '系统连接' },
    '+direct': { name: 'direct', profileType: 'DirectProfile', color: '#24765c', displayName: '不走代理' }
  }
  await setup.storage.set(snapshot)
  await setup.options.init()
  await setup.options.applyProfile('system', { update: false })
  assert.equal(setup.options.currentProfile().name, 'system')
  let saved = await setup.state.get(['availableProfiles'])
  assert.equal(saved.availableProfiles['+system'].displayName, '系统连接')
  assert.equal(saved.availableProfiles['+direct'].displayName, '不走代理')
  const restarted = createOptions()
  await restarted.storage.set(JSON.parse(JSON.stringify(setup.options.getAll())))
  await restarted.options.init()
  await restarted.options.applyProfile('rules', { update: false })
  const match = await restarted.options.matchProfile(restarted.context.OmegaPac.Conditions.requestFromUrl('https://other.org/'))
  assert.equal(match.profile.name, 'direct')
  assert.equal(match.profile.displayName, '不走代理')
  assert.equal(restarted.options.getAll()['+rules'].defaultProfileName, 'direct')
  const plain = restarted.context.OmegaPac.Profiles.byName('direct', {})
  assert.equal(plain.displayName, undefined, 'Labels must not leak into another configuration')
})

test('runtime bundles load without removed monitoring, cycling, sync or integration APIs', () => {
  const { OmegaTarget, OmegaTargetChromium } = loadRuntime()
  for (const name of ['OptionsSync', 'SyncStorage', 'SwitchySharp', 'ExternalApi', 'WebRequestMonitor']) {
    assert.equal(OmegaTarget[name], undefined)
    assert.equal(OmegaTargetChromium[name], undefined)
  }
  for (const name of ['setQuickSwitch', 'reloadQuickSwitch', 'setMonitorWebRequests', 'setDefaultProfile']) {
    assert.equal(OmegaTarget.Options.prototype[name], undefined)
    assert.equal(OmegaTargetChromium.Options.prototype[name], undefined)
  }
})

test('local options load preserves profiles and rules while removing legacy metadata', async () => {
  const { options, storage, state } = createOptions()
  const snapshot = legacyOptions(options)
  const expectedRules = snapshot['+rules'].rules
  await storage.set(snapshot)
  await state.set({ syncOptions: 'sync', gistId: 'old-id', gistToken: 'old-token' })
  await options.loadOptions()
  const stored = JSON.parse(JSON.stringify(await storage.get(null)))
  assert.deepEqual(stored['+rules'].rules, expectedRules)
  assert.deepEqual(stored['+work'].fallbackProxy, snapshot['+work'].fallbackProxy)
  assert.equal(stored['-customCss'], undefined)
  assert.equal(stored['-exportLegacyRuleList'], undefined)
  assert.equal(stored['-enableQuickSwitch'], undefined)
  assert.equal(stored['-quickSwitchProfiles'], undefined)
  assert.equal(stored['-monitorWebRequests'], undefined)
  assert.equal(stored['-showConditionTypes'], undefined)
  assert.equal(stored['+work'].syncOptions, undefined)
  assert.equal(stored['+work'].syncError, undefined)
})

test('first launch creates local defaults and applies the system profile', async () => {
  const { options, storage, applied } = createOptions()
  await options.init()
  assert.equal((await storage.get('schemaVersion')).schemaVersion, 2)
  assert.equal(applied.at(-1), 'system')
  const defaults = options.getAll()
  assert.equal(defaults['+翻墙'].name, '翻墙')
  assert.equal(defaults['+自动'].name, '自动')
  assert.deepEqual(JSON.parse(JSON.stringify(defaults['+自动'].rules)), [])
  assert.equal(defaults['+翻墙'].fallbackProxy, undefined)
  assert.equal(defaults['+翻墙'].needsConfiguration, true)
  assert.equal(defaults['+proxy'], undefined)
  assert.equal(defaults['+auto switch'], undefined)
  assert.equal(defaults['+自动'].defaultProfileName, '__ruleListOf_自动')
  assert.equal(defaults['+__ruleListOf_自动'].format, 'AutoProxy')
  assert.equal(defaults['+__ruleListOf_自动'].sourceUrl, 'https://raw.githubusercontent.com/gfwlist/gfwlist/master/gfwlist.txt')
})

test('unconfigured default proxies cannot switch modes or change the selected profile', async () => {
  const setup = createOptions()
  await setup.options.init()
  for (const name of ['翻墙', '自动']) {
    await assert.rejects(setup.options.applyProfile(name), error => error.name === 'ProxyConfigurationError' && error.profileName === '翻墙')
    assert.equal(setup.options.currentProfile().name, 'system')
    assert.equal((await setup.state.get('currentProfileName')).currentProfileName, 'system')
  }
  assert.deepEqual(setup.applied, ['system'])
  await setup.options.patch({ '+翻墙': { fallbackProxy: [{ scheme: 'http', host: '  localhost  ', port: 7890 }] } })
  assert.equal(setup.options.getAll()['+翻墙'].fallbackProxy.host, 'localhost')
  await setup.options.applyProfile('自动', { update: false })
  assert.equal(setup.options.currentProfile().name, '自动')
})

test('proxy validation accepts valid hosts and integer ports while rejecting URL and malformed inputs', () => {
  const profiles = loadRuntime().OmegaPac.Profiles
  for (const host of ['localhost', 'proxy.local', '127.0.0.1', '::1', '[2001:db8::1]', '例子.测试', ' xn--fsqu00a.xn--0zwm56d ']) assert.equal(profiles.proxyHostValid(host), true, host)
  for (const host of ['', 'https://proxy.local', 'proxy.local:8080', 'proxy.local/path', '256.0.0.1', '-proxy.local', 'proxy..local', 'proxy local', '127.0.0.1/8', '😀.local']) assert.equal(profiles.proxyHostValid(host), false, host)
  for (const port of [1, 80, 7890, 65535]) assert.equal(profiles.proxyPortValid(port), true)
  for (const port of [0, -1, 65536, 1.5, NaN, '8080', undefined]) assert.equal(profiles.proxyPortValid(port), false)
})

test('invalid proxy patches leave persisted configuration untouched', async () => {
  const setup = createOptions()
  await setup.options.init()
  for (const proxy of [{ scheme: 'http', host: 'localhost', port: 70000 }, { scheme: 'socks5', host: 'http://localhost', port: 1080 }]) {
    assert.throws(() => setup.options.patch({ '+翻墙': { fallbackProxy: [proxy] } }), /代理/)
    assert.equal(setup.options.getAll()['+翻墙'].fallbackProxy, undefined)
    assert.equal((await setup.storage.get('+翻墙'))['+翻墙'].fallbackProxy, undefined)
  }
})

test('default AutoProxy subscription decodes Base64 and routes matches through the proxy', async () => {
  const setup = createOptions()
  const fixture = JSON.parse(JSON.stringify(setup.options.getDefaultOptions()))
  fixture['-downloadInterval'] = -1
  fixture['+翻墙'].fallbackProxy = { scheme: 'http', host: 'localhost', port: 7890 }
  await setup.storage.set(fixture)
  await setup.options.init()
  const text = '[AutoProxy 0.2.9]\n||blocked.example.org\n@@||allowed.blocked.example.org\n'
  setup.options.fetchUrl = url => {
    assert.equal(url, 'https://raw.githubusercontent.com/gfwlist/gfwlist/master/gfwlist.txt')
    return setup.target.Promise.resolve(Buffer.from(text).toString('base64'))
  }
  const updated = await setup.options.updateProfile('__ruleListOf_自动')
  assert.equal(updated['+__ruleListOf_自动'].profileType, 'RuleListProfile')
  await setup.options.applyProfile('自动', { update: false })
  const pac = {}
  vm.runInNewContext(await setup.options.pacForProfile('自动'), pac)
  assert.equal(pac.FindProxyForURL('https://blocked.example.org/', 'blocked.example.org'), 'PROXY localhost:7890')
  assert.equal(pac.FindProxyForURL('https://allowed.blocked.example.org/', 'allowed.blocked.example.org'), 'DIRECT')
  assert.equal(pac.FindProxyForURL('https://unlisted.example.org/', 'unlisted.example.org'), 'DIRECT')
})

test('default subscription migration preserves custom online and local rules', async () => {
  for (const sourceUrl of ['https://custom.example.org/rules.txt', '']) {
    const setup = createOptions()
    const snapshot = oldDefaultNames(setup.options)
    const text = '[AutoProxy 0.2.9]\n||custom.example.org\n'
    snapshot['+__ruleListOf_auto switch'] = { name: '__ruleListOf_auto switch', profileType: 'RuleListProfile',
      format: 'AutoProxy', sourceUrl, ruleList: text, matchProfileName: 'proxy', defaultProfileName: 'direct' }
    snapshot['+auto switch'].defaultProfileName = '__ruleListOf_auto switch'
    await setup.storage.set(snapshot)
    await setup.options.init()
    const stored = setup.options.getAll()
    assert.equal(stored['+自动'].defaultProfileName, '__ruleListOf_自动')
    assert.equal(stored['+__ruleListOf_自动'].sourceUrl, sourceUrl)
    assert.equal(stored['+__ruleListOf_自动'].ruleList, text)
    assert.equal(stored['+__ruleListOf_自动'].matchProfileName, '翻墙')
    assert.equal(stored['+__ruleListOf_auto switch'], undefined)
  }
})

function oldDefaultNames(options) {
  const snapshot = JSON.parse(JSON.stringify(options.getDefaultOptions()))
  delete snapshot['-defaultProfileNamesVersion']
  delete snapshot['-defaultRuleListVersion']
  delete snapshot['+__ruleListOf_自动']
  snapshot['-downloadInterval'] = -1
  snapshot['+proxy'] = snapshot['+翻墙']
  snapshot['+proxy'].name = 'proxy'
  snapshot['+proxy'].fallbackProxy = { scheme: 'socks5', host: 'localhost', port: 7890 }
  delete snapshot['+翻墙']
  snapshot['+auto switch'] = snapshot['+自动']
  snapshot['+auto switch'].name = 'auto switch'
  snapshot['+auto switch'].defaultProfileName = 'direct'
  snapshot['+auto switch'].rules = [
    { condition: { conditionType: 'HostWildcardCondition', pattern: 'internal.example.com' }, profileName: 'direct' },
    { condition: { conditionType: 'HostWildcardCondition', pattern: '*.example.com' }, profileName: 'proxy' }
  ]
  delete snapshot['+自动']
  return snapshot
}

test('old default names migrate with settings, rule-list references and selected mode intact', async () => {
  const setup = createOptions()
  const snapshot = oldDefaultNames(setup.options)
  snapshot['+old virtual'] = { name: 'old virtual', profileType: 'VirtualProfile', defaultProfileName: 'proxy' }
  snapshot['+auto switch'].rules.push({ condition: { conditionType: 'HostWildcardCondition', pattern: '*.virtual.org' }, profileName: 'old virtual' })
  const text = '[SwitchyOmega Conditions]\n@with result\n*.example.com +proxy\n* +direct\n'
  snapshot['+list'] = { name: 'list', profileType: 'RuleListProfile', format: 'Switchy', ruleList: text,
    sourceUrl: 'https://example.com/rules.sorl', matchProfileName: 'proxy', defaultProfileName: 'direct' }
  await setup.storage.set(snapshot)
  await setup.state.set({ currentProfileName: 'auto switch', lastProfileNameForCondition: 'proxy' })
  await setup.options.init()
  const stored = JSON.parse(JSON.stringify(await setup.storage.get(null)))
  assert.equal(stored['+proxy'], undefined)
  assert.equal(stored['+auto switch'], undefined)
  assert.deepEqual(stored['+翻墙'].fallbackProxy, snapshot['+proxy'].fallbackProxy)
  assert.equal(stored['+自动'].rules[1].profileName, '翻墙')
  assert.equal(stored['+自动'].defaultProfileName, '__ruleListOf_自动')
  assert.equal(stored['+__ruleListOf_自动'].format, 'AutoProxy')
  assert.equal(stored['+__ruleListOf_自动'].sourceUrl, 'https://raw.githubusercontent.com/gfwlist/gfwlist/master/gfwlist.txt')
  assert.equal(stored['+自动'].rules[2].profileName, '翻墙')
  assert.equal(stored['+old virtual'], undefined)
  assert.equal(stored['+list'].matchProfileName, '翻墙')
  assert.ok(stored['+list'].ruleList.includes('*.example.com +翻墙'))
  assert.equal(setup.applied.at(-1), '自动')
  assert.equal((await setup.state.get('lastProfileNameForCondition')).lastProfileNameForCondition, '翻墙')
  const match = await setup.options.matchProfile(setup.context.OmegaPac.Conditions.requestFromUrl('https://www.example.com/'))
  assert.equal(match.profile.name, '翻墙')
  const pac = {}
  vm.runInNewContext(await setup.options.pacForProfile('自动'), pac)
  assert.equal(pac.FindProxyForURL('https://www.example.com/', 'www.example.com'), 'SOCKS5 localhost:7890')
  const restarted = createOptions()
  await restarted.storage.set(stored)
  await restarted.options.init()
  restarted.options.fetchUrl = () => restarted.target.Promise.resolve(text)
  await restarted.options.updateProfile('list')
  assert.ok(restarted.options.getAll()['+list'].ruleList.includes('*.example.com +翻墙'))
})

test('default name migration preserves collisions and subsequent explicit renames', async () => {
  const setup = createOptions()
  const snapshot = oldDefaultNames(setup.options)
  snapshot['+翻墙'] = { name: '翻墙', profileType: 'FixedProfile', color: '#315fd4', bypassList: [],
    fallbackProxy: { scheme: 'http', host: 'other.example.org', port: 8888 } }
  await setup.storage.set(snapshot)
  await setup.options.init()
  assert.equal(setup.options.getAll()['+proxy'].fallbackProxy.port, 7890)
  assert.equal(setup.options.getAll()['+翻墙'].fallbackProxy.port, 8888)
  assert.equal(setup.options.getAll()['+自动'].rules[1].profileName, 'proxy')
  await setup.options.renameProfile('自动', 'auto switch')
  const restarted = createOptions()
  await restarted.storage.set(JSON.parse(JSON.stringify(setup.options.getAll())))
  await restarted.options.init()
  assert.equal(restarted.options.getAll()['+auto switch'].name, 'auto switch')
  assert.equal(restarted.options.getAll()['+自动'], undefined)
})

test('migration initializes with the actual browser-state adapter rather than memory storage', async () => {
  const { context, target, storage, applied } = createOptions()
  let persisted = {
    'omega.local.currentProfileName': JSON.stringify('virtual'),
    'omega.local.lastProfileNameForCondition': JSON.stringify('virtual')
  }
  context.idbKeyval = {
    get: async () => structuredClone(persisted),
    set: async (key, value) => { persisted = structuredClone(value) }
  }
  const state = new target.BrowserStorage(zeroLocalStorage, 'omega.local.')
  const options = new target.Options(storage, state, target.Log, {
    features: {},
    applyProfile(profile) { applied.push(profile.name); return target.Promise.resolve() }
  })
  const snapshot = legacyOptions(options)
  snapshot['+virtual'] = { name: 'virtual', profileType: 'VirtualProfile', defaultProfileName: 'work' }
  await storage.set(snapshot)
  await options.init()
  assert.equal(applied.at(-1), 'work')
  assert.equal((await state.get('currentProfileName')).currentProfileName, 'work')
  assert.equal(JSON.parse(persisted['omega.local.lastProfileNameForCondition']), 'work')
  assert.equal((await storage.get('+virtual'))['+virtual'], undefined)
  assert.equal(options.getAll()['+work'].profileType, 'FixedProfile')
})

test('virtual chains migrate rules and current state while discarding the old startup setting', async () => {
  const { options, storage, state, applied, context } = createOptions()
  const snapshot = legacyOptions(options)
  snapshot['+virtual'] = { name: 'virtual', profileType: 'VirtualProfile', defaultProfileName: 'work', rules: [] }
  snapshot['+alias'] = { name: 'alias', profileType: 'VirtualProfile', defaultProfileName: 'virtual' }
  snapshot['+rules'].rules[0].profileName = 'alias'
  snapshot['+rules'].defaultProfileName = 'virtual'
  snapshot['-startupProfileName'] = 'alias'
  await storage.set(snapshot)
  await state.set({ currentProfileName: 'virtual', lastProfileNameForCondition: 'alias' })
  await options.init(() => true)
  const stored = JSON.parse(JSON.stringify(await storage.get(null)))
  assert.equal(stored['+virtual'], undefined)
  assert.equal(stored['+alias'], undefined)
  assert.equal(stored['+rules'].rules[0].profileName, 'work')
  assert.equal(stored['+rules'].defaultProfileName, 'work')
  assert.equal(stored['-startupProfileName'], undefined)
  assert.equal(applied.at(-1), 'work')
  assert.equal((await state.get('currentProfileName')).currentProfileName, 'work')
  assert.equal((await state.get('lastProfileNameForCondition')).lastProfileNameForCondition, 'work')
  await options.applyProfile('rules')
  const matched = await options.matchProfile(context.OmegaPac.Conditions.requestFromUrl('https://example.com/'))
  assert.equal(matched.profile.name, 'work')
  assert.match(await options.pacForProfile('rules'), /localhost:8080/)
})

test('missing and cyclic virtual targets fall back to direct without resetting other settings', async () => {
  const { options, storage, state, applied } = createOptions()
  const snapshot = legacyOptions(options)
  snapshot['+missing'] = { name: 'missing', profileType: 'VirtualProfile', defaultProfileName: 'gone' }
  snapshot['+a'] = { name: 'a', profileType: 'VirtualProfile', defaultProfileName: 'b' }
  snapshot['+b'] = { name: 'b', profileType: 'VirtualProfile', defaultProfileName: 'a' }
  snapshot['+rules'].rules[0].profileName = 'a'
  snapshot['+rules'].defaultProfileName = 'missing'
  snapshot['-startupProfileName'] = 'b'
  await storage.set(snapshot)
  await state.set({ currentProfileName: 'missing' })
  await options.init()
  const stored = JSON.parse(JSON.stringify(await storage.get(null)))
  assert.equal(stored['+rules'].rules[0].profileName, 'direct')
  assert.equal(stored['+rules'].defaultProfileName, 'direct')
  assert.equal(stored['-startupProfileName'], undefined)
  assert.deepEqual(stored['+work'].fallbackProxy, snapshot['+work'].fallbackProxy)
  assert.equal(applied.at(-1), 'direct')
})

test('schema-one backups migrate a virtual WPAD target to direct without losing local proxy settings', async () => {
  const { options, storage } = createOptions()
  const snapshot = legacyOptions(options)
  snapshot.schemaVersion = 1
  snapshot['+virtual'] = { name: 'virtual', profileType: 'VirtualProfile', defaultProfileName: 'auto_detect' }
  snapshot['-startupProfileName'] = 'virtual'
  await storage.set(snapshot)
  await options.loadOptions()
  const stored = JSON.parse(JSON.stringify(await storage.get(null)))
  assert.equal(stored.schemaVersion, 2)
  assert.equal(stored['+virtual'], undefined)
  assert.equal(stored['+auto_detect'], undefined)
  assert.equal(stored['-startupProfileName'], undefined)
  assert.deepEqual(stored['+work'].fallbackProxy, snapshot['+work'].fallbackProxy)
})

test('PAC backups migrate references, previous aliases and current state to direct', async () => {
  const { options, storage, state, applied } = createOptions()
  const snapshot = legacyOptions(options)
  const text = '[SwitchyOmega Conditions]\n@with result\n*.example.com +pac\n* +work\n'
  snapshot['+pac'] = { name: 'pac', profileType: 'PacProfile', pacUrl: 'https://example.com/proxy.pac' }
  snapshot['+wpad'] = { name: 'wpad', profileType: 'AutoDetectProfile' }
  snapshot['+virtual'] = { name: 'virtual', profileType: 'VirtualProfile', defaultProfileName: 'pac' }
  snapshot['-legacyProfileNames'] = { oldVirtual: 'pac' }
  snapshot['+rules'].rules[0].profileName = 'oldVirtual'
  snapshot['+rules'].defaultProfileName = 'wpad'
  snapshot['+list'] = {
    name: 'list', profileType: 'RuleListProfile', format: 'Switchy', ruleList: text,
    sourceUrl: 'https://example.com/rules.sorl', matchProfileName: 'virtual', defaultProfileName: 'pac'
  }
  snapshot['-startupProfileName'] = 'virtual'
  await state.set({ currentProfileName: 'pac', lastProfileNameForCondition: 'oldVirtual', externalProfile: snapshot['+pac'] })
  await options.reset(JSON.stringify(snapshot))
  const stored = JSON.parse(JSON.stringify(await storage.get(null)))
  for (const name of ['pac', 'wpad', 'virtual']) assert.equal(stored['+' + name], undefined)
  assert.equal(stored['-legacyProfileNames'].oldVirtual, 'direct')
  assert.equal(stored['+rules'].rules[0].profileName, 'direct')
  assert.equal(stored['+rules'].defaultProfileName, 'direct')
  assert.equal(stored['+list'].matchProfileName, 'direct')
  assert.equal(stored['+list'].defaultProfileName, 'direct')
  assert.equal(stored['-startupProfileName'], undefined)
  assert.equal(applied.at(-1), 'direct')
  assert.equal((await state.get('lastProfileNameForCondition')).lastProfileNameForCondition, 'direct')
  assert.equal((await state.get('externalProfile')).externalProfile.profileType, 'SystemProfile')

  const fresh = createOptions()
  await fresh.storage.set(stored)
  await fresh.options.loadOptions()
  fresh.options.fetchUrl = () => fresh.target.Promise.resolve(text)
  await fresh.options.updateProfile('list')
  await fresh.options.applyProfile('list')
  const matched = await fresh.options.matchProfile(fresh.context.OmegaPac.Conditions.requestFromUrl('https://example.com/'))
  assert.equal(matched.profile.name, 'direct')
  const script = await fresh.options.pacForProfile('list')
  const pac = {}
  vm.runInNewContext(script, pac)
  assert.equal(pac.FindProxyForURL('https://example.com/', 'example.com'), 'DIRECT')
  assert.equal(pac.FindProxyForURL('https://other.org/', 'other.org'), 'PROXY localhost:8080')
  assert.deepEqual(stored['+work'].fallbackProxy, snapshot['+work'].fallbackProxy)
})

test('removed PAC types cannot be created or saved through background APIs', async () => {
  const { options, storage, context } = createOptions()
  await storage.set(legacyOptions(options))
  await options.loadOptions()
  for (const type of ['PacProfile', 'AutoDetectProfile']) {
    const profile = { name: 'removed', profileType: type, pacScript: 'function FindProxyForURL() { return "DIRECT"; }' }
    assert.throws(() => context.OmegaPac.Profiles.create(profile), /Unknown profile type/)
    await assert.rejects(options.addProfile(profile), /Unsupported profile type/)
    assert.throws(() => options.patch({ '+removed': [profile] }), /Unsupported profile type/)
    assert.equal(options.profile('removed'), undefined)
    assert.equal((await storage.get('+removed'))['+removed'], undefined)
  }
})

test('old virtual JSON backups restore with their proxy rules and last selected mode intact', async () => {
  const { options, storage, state, applied } = createOptions()
  const snapshot = legacyOptions(options)
  snapshot['+virtual'] = { name: 'virtual', profileType: 'VirtualProfile', defaultProfileName: 'work' }
  snapshot['+rules'].rules[0].profileName = 'virtual'
  snapshot['-startupProfileName'] = 'virtual'
  await state.set({ currentProfileName: 'virtual' })
  await options.reset(JSON.stringify(snapshot))
  const stored = JSON.parse(JSON.stringify(await storage.get(null)))
  assert.equal(stored['+virtual'], undefined)
  assert.equal(stored['+rules'].rules[0].profileName, 'work')
  assert.equal(stored['-startupProfileName'], undefined)
  assert.equal(applied.at(-1), 'work')
})

test('named results in remote rule lists keep working after migration and a fresh reload', async () => {
  const { options, storage } = createOptions()
  const snapshot = legacyOptions(options)
  const text = '[SwitchyOmega Conditions]\r\n; keep this comment +virtual\r\n@with result\r\n@note keep this note\r\n*.example.com +virtual\r\n* +direct\r\n'
  snapshot['+virtual'] = { name: 'virtual', profileType: 'VirtualProfile', defaultProfileName: 'work' }
  snapshot['+list'] = {
    name: 'list', profileType: 'RuleListProfile', format: 'Switchy',
    ruleList: text, sourceUrl: 'https://example.com/rules.sorl',
    matchProfileName: 'virtual', defaultProfileName: 'direct'
  }
  await storage.set(snapshot)
  await options.loadOptions()
  const migrated = JSON.parse(JSON.stringify(await storage.get(null)))
  assert.ok(migrated['+list'].ruleList.includes('*.example.com +work'))
  assert.ok(migrated['+list'].ruleList.includes('; keep this comment +virtual'))
  assert.ok(migrated['+list'].ruleList.includes('@note keep this note'))
  assert.equal(migrated['+list'].matchProfileName, 'work')

  const fresh = createOptions()
  await fresh.storage.set(migrated)
  await fresh.options.loadOptions()
  fresh.options.fetchUrl = () => fresh.target.Promise.resolve(text)
  const result = await fresh.options.updateProfile('list')
  assert.deepEqual(Object.keys(result), ['+list'])
  assert.equal(result['+list'].profileType, 'RuleListProfile', JSON.stringify(result['+list']))
  await fresh.options.applyProfile('list')
  const matched = await fresh.options.matchProfile(fresh.context.OmegaPac.Conditions.requestFromUrl('https://example.com/'))
  assert.equal(matched.profile.name, 'work')
  assert.match(await fresh.options.pacForProfile('list'), /localhost:8080/)
  await fresh.options.renameProfile('work', 'office')
  assert.ok(fresh.options._options['+list'].sourceUrl)
  assert.equal(fresh.options._options['+list'].name, 'list')
  assert.equal(fresh.options._options['+list'].profileType, 'RuleListProfile', JSON.stringify(fresh.options._options['+list']))
  const refreshed = await fresh.options.updateProfile('list')
  assert.deepEqual(Object.keys(refreshed), ['+list'], JSON.stringify(refreshed))
  assert.ok(refreshed['+list'].ruleList.includes('*.example.com +office'), JSON.stringify(refreshed['+list']))
  await fresh.options.applyProfile('list')
  const renamed = await fresh.options.matchProfile(fresh.context.OmegaPac.Conditions.requestFromUrl('https://example.com/'))
  assert.equal(renamed.profile.name, 'office')
})

test('restoring an old JSON backup retains its configured proxy and last selected mode', async () => {
  const { options, storage, state, applied } = createOptions()
  const snapshot = legacyOptions(options)
  snapshot['-startupProfileName'] = 'direct'
  await state.set({ currentProfileName: 'work' })
  await options.reset(JSON.stringify(snapshot))
  const stored = JSON.parse(JSON.stringify(await storage.get(null)))
  assert.deepEqual(stored['+rules'].rules, snapshot['+rules'].rules)
  assert.deepEqual(stored['+work'].fallbackProxy, snapshot['+work'].fallbackProxy)
  assert.equal(stored['-customCss'], undefined)
  assert.equal((await state.get('currentProfileName')).currentProfileName, 'work')
  assert.equal(applied.at(-1), 'work')
})

test('clearing the Chromium badge no longer depends on external-extension state', () => {
  const context = loadRuntime()
  let badge
  context.chrome = { action: { setBadgeText: (value) => { badge = value } } }
  const options = Object.create(context.OmegaTargetChromium.Options.prototype)
  options.clearBadge()
  assert.equal(badge.text, '')
})

test('updating a tab removes the old request-failure badge', async () => {
  const context = loadRuntime()
  let badge
  context.chrome = { action: {
    setBadgeText: (value) => { badge = value },
    setTitle() {}
  } }
  const tabs = Object.create(context.OmegaTargetChromium.ChromeTabs.prototype)
  tabs.actionForUrl = () => context.OmegaTarget.Promise.resolve({ title: 'work', icon: {} })
  tabs.setIcon = () => {}
  tabs._canSetPopup = () => true
  await tabs.processTab({ id: 7, url: 'https://example.com/' }, {})
  assert.equal(badge.tabId, 7)
  assert.equal(badge.text, '')
})

test('popup page information remains available without the removed network error counter', async () => {
  const context = loadRuntime()
  let cleared = 0
  context.chrome = { action: {} }
  const receiver = {
    _state: new context.OmegaTarget.Storage(),
    clearBadge() { cleared++ }
  }
  const getPageInfo = context.OmegaTargetChromium.Options.prototype.getPageInfo
  const result = await getPageInfo.call(receiver, { tabId: 7, url: 'https://www.example.com/path?q=1' })
  assert.equal(result.url, 'https://www.example.com/path?q=1')
  assert.equal(result.domain, 'example.com')
  assert.equal(result.subdomain, 'www')
  assert.equal(Object.hasOwn(result, 'errorCount'), false)
  assert.equal(cleared, 1)
  for (const url of ['', 'chrome://extensions/', 'about:blank', 'moz-extension://test/options.html']) {
    assert.equal(await getPageInfo.call(receiver, { tabId: 7, url }), null)
  }
})

test('popup page information preserves inspected URLs and Chrome error-page recovery', async () => {
  const context = loadRuntime()
  let badge = '#', cleared = 0
  context.chrome = { action: { getBadgeText(details, callback) { callback(badge) } } }
  const receiver = {
    _state: new context.OmegaTarget.Storage(),
    clearBadge() { cleared++ }
  }
  const getPageInfo = context.OmegaTargetChromium.Options.prototype.getPageInfo
  await receiver._state.set({ inspectUrl: 'https://api.example.org/path' })
  const inspected = await getPageInfo.call(receiver, { tabId: 7, url: 'https://other.com/' })
  assert.equal(inspected.url, 'https://api.example.org/path')
  assert.equal(inspected.domain, 'example.org')
  assert.equal(inspected.subdomain, 'api')
  assert.equal(cleared, 0)
  badge = ''
  const recovered = await getPageInfo.call(receiver, {
    tabId: 7, url: 'chrome://errorpage/?lasturl=' + encodeURIComponent('https://www.example.com/failed')
  })
  assert.equal(recovered.url, 'https://www.example.com/failed')
  assert.equal(recovered.domain, 'example.com')
  assert.equal(cleared, 1)
})

test('proxy authentication remains available after network monitoring is removed', async () => {
  const context = loadRuntime()
  let authHandler
  context.chrome = {
    proxy: { settings: {} },
    webRequest: {
      onAuthRequired: { addListener(listener) { authHandler = listener } },
      onCompleted: { addListener() {} },
      onErrorOccurred: { addListener() {} }
    }
  }
  const proxy = context.OmegaTargetChromium.proxy.getProxyImpl(context.OmegaTarget.Log)
  const profile = {
    name: 'work', profileType: 'FixedProfile', bypassList: [],
    fallbackProxy: { scheme: 'http', host: 'localhost', port: 8080 },
    auth: { fallbackProxy: { username: 'example-user', password: 'example-password' } }
  }
  await proxy.setProxyAuth(profile, { '+work': profile })
  const result = authHandler({ isProxy: true, requestId: 'test', challenger: { host: 'localhost', port: 8080 } })
  assert.equal(result.authCredentials.username, 'example-user')
  assert.equal(result.authCredentials.password, 'example-password')
})

test('Chromium still applies fixed proxies and generated switch scripts without importing external PAC', async () => {
  const { context, options, storage } = createOptions()
  let setting
  context.chrome = {
    runtime: {},
    proxy: { settings: {
      set(value, callback) { setting = value.value; callback() },
      get(value, callback) { if (callback) callback({ value: setting }) },
      onChange: { addListener() {} }
    } },
    webRequest: {
      onAuthRequired: { addListener() {} },
      onCompleted: { addListener() {} },
      onErrorOccurred: { addListener() {} }
    }
  }
  await storage.set(legacyOptions(options))
  await options.loadOptions()
  const proxy = context.OmegaTargetChromium.proxy.getProxyImpl(context.OmegaTarget.Log)
  proxy.watchProxyChange(() => {})
  await proxy.applyProfile(options.profile('work'), null, options._options)
  assert.equal(setting.mode, 'fixed_servers')
  assert.equal(setting.rules.singleProxy.host, 'localhost')

  const rules = options.profile('rules')
  context.OmegaPac.Profiles.updateRevision(rules)
  await proxy.applyProfile(rules, null, options._options)
  assert.equal(setting.mode, 'pac_script')
  assert.equal(setting.pacScript.url, undefined)
  const pac = {}
  vm.runInNewContext(setting.pacScript.data, pac)
  assert.equal(pac.FindProxyForURL('https://example.com/', 'example.com'), 'PROXY localhost:8080')
  assert.equal(pac.FindProxyForURL('https://other.org/', 'other.org'), 'DIRECT')
  assert.equal(proxy.parseExternalProfile({ value: setting }, options._options).name, 'rules')
  for (const value of [
    { mode: 'auto_detect' },
    { mode: 'pac_script', pacScript: { url: 'https://example.com/proxy.pac' } },
    { mode: 'pac_script', pacScript: { data: 'function FindProxyForURL() { return "PROXY other:1234"; }' } },
    { mode: 'pac_script', pacScript: { data: '/*OmegaProfile*"removed"*1*/function FindProxyForURL() { return "DIRECT"; }' } }
  ]) {
    assert.equal(proxy.parseExternalProfile({ value }, options._options).name, 'system')
  }
})

test('WebExtension runtime retains automatic routing after PAC profile support is removed', () => {
  let onMessage
  const context = { browser: { runtime: {
    onMessage: { addListener(listener) { onMessage = listener } },
    sendMessage() {}
  } } }
  vm.runInNewContext(fs.readFileSync(new URL('../js/omega_webext_proxy_script.min.js', import.meta.url), 'utf8'), context)
  const profiles = context.require('omega-pac').Profiles
  assert.throws(() => profiles.create('old-pac', 'PacProfile'), /Unknown profile type/)
  onMessage({ event: 'proxyScriptStateChanged', state: { currentProfileName: 'rules' }, options: {
    '+work': { name: 'work', profileType: 'FixedProfile', bypassList: [], fallbackProxy: { scheme: 'http', host: 'localhost', port: 8080 } },
    '+rules': { name: 'rules', profileType: 'SwitchProfile', defaultProfileName: 'direct', rules: [
      { condition: { conditionType: 'HostWildcardCondition', pattern: '*.example.com' }, profileName: 'work' }
    ] }
  } })
  const result = context.FindProxyForURL('https://example.com/', 'example.com')
  assert.equal(result[0].host, 'localhost')
  assert.equal(result[0].port, 8080)
  assert.equal(context.FindProxyForURL('https://other.org/', 'other.org'), 'DIRECT')
})

test('Chromium startup restores the popup and discards obsolete temporary overrides', async () => {
  const context = loadRuntime()
  const target = context.OmegaTargetChromium
  let popup
  let session = {
    tempProfileState: {
      _tempProfile: { name: '__temp', profileType: 'SwitchProfile', defaultProfileName: 'rules', rules: [
        { condition: { conditionType: 'HostWildcardCondition', pattern: '*.example.com' }, profileName: 'virtual' },
        { condition: { conditionType: 'HostWildcardCondition', pattern: '*.old-pac.org' }, profileName: 'pac' }
      ] },
      _tempProfileActive: true
    }
  }
  context.POPUPHTMLURL = './popup-iframe.html'
  context.chrome = {
    runtime: { onConnect: { addListener() { throw new Error('Monitoring must not attach ports') } } },
    action: { setPopup: (value) => { popup = value.popup } },
    alarms: { onAlarm: { addListener() {} }, clear() {}, create() {} },
    i18n: { getMessage() { return '' } },
    storage: { session: {
      get: async () => { throw new Error('Obsolete overrides must not be loaded') },
      remove: async (key) => { delete session[key] }
    } }
  }
  const storage = new context.OmegaTarget.Storage()
  const state = new context.OmegaTarget.Storage()
  const options = new target.Options(storage, state, target.Log, {
    features: {}, applyProfile: () => target.Promise.resolve()
  })
  const snapshot = legacyOptions(options)
  snapshot['+virtual'] = { name: 'virtual', profileType: 'VirtualProfile', defaultProfileName: 'work' }
  snapshot['+pac'] = { name: 'pac', profileType: 'PacProfile', pacUrl: 'https://example.com/proxy.pac' }
  snapshot['-startupProfileName'] = 'direct'
  await state.set({ currentProfileName: 'rules' })
  await storage.set(snapshot)
  await options.init()
  assert.equal(popup, './popup-iframe.html')
  assert.equal(session.tempProfileState, undefined)
  assert.equal(options._tempProfile, undefined)
  for (const method of ['getTempRules', 'addTempRule', 'queryTempRule']) {
    assert.equal(options[method], undefined)
  }
  const matched = await options.matchProfile(context.OmegaPac.Conditions.requestFromUrl('https://example.com/'))
  assert.equal(matched.profile.name, 'work')
  const unmatched = await options.matchProfile(context.OmegaPac.Conditions.requestFromUrl('https://old-pac.org/'))
  assert.equal(unmatched.profile.name, 'direct')
})

test('background startup uses local storage and clears only obsolete state', () => {
  const context = loadRuntime()
  const target = context.OmegaTargetChromium
  let removed
  let optionsArguments
  let messageListener
  const proxy = { features: {}, watchProxyChange() {} }
  context.chrome = {
    storage: {},
    runtime: {
      onStartup: { addListener() {} },
      onInstalled: { addListener() {} },
      onMessage: { addListener(listener) { messageListener = listener } }
    }
  }
  Object.defineProperty(context.chrome.storage, 'sync', {
    get() { throw new Error('Background must not access cloud storage') }
  })
  target.Storage = function(area) { assert.equal(area, 'local') }
  target.BrowserStorage = function() {
    this.remove = (keys) => { removed = keys }
    this.set = () => target.Promise.resolve()
  }
  target.Options = function(...args) {
    optionsArguments = args
    this.initWithOptions = () => {}
    this.setProxyNotControllable = () => {}
  }
  target.ChromeTabs = function() { this.watch = () => {} }
  target.Inspect = function() {}
  target.proxy = { getProxyImpl: () => proxy }
  vm.runInNewContext(fs.readFileSync(new URL('../js/background.js', import.meta.url), 'utf8'), context)
  context.zeroBackground({})
  assert.equal(optionsArguments.length, 4)
  assert.equal(optionsArguments[3], proxy)
  assert.ok(removed.includes('gistToken'))
  assert.ok(removed.includes('customCss'))
  assert.ok(!removed.includes('currentProfileName'))
  assert.ok(!removed.includes('lastProfileNameForCondition'))
  assert.equal(typeof messageListener, 'function')
})

test('toolbar icons mark automatic routing with A and keep manual rings empty', async () => {
  const { context, storage, options } = createOptions()
  const snapshot = legacyOptions(options)
  snapshot['+rules'].color = '#99dd99'
  snapshot['+rules'].defaultProfileName = '__ruleListOf_rules'
  snapshot['+__ruleListOf_rules'] = {
    name: '__ruleListOf_rules', profileType: 'RuleListProfile', color: '#ff8800',
    format: 'AutoProxy', ruleList: '||subscribed.org',
    matchProfileName: 'work', defaultProfileName: 'direct'
  }
  snapshot['-builtinProfiles'] = {
    '+direct': { name: 'direct', profileType: 'DirectProfile', color: '#aaaaaa' },
    '+system': { name: 'system', profileType: 'SystemProfile', color: '#000000' }
  }
  await storage.set(snapshot)
  await options.init()

  let defaultAction
  const target = context.OmegaTargetChromium
  context.chrome = {
    runtime: {
      onStartup: { addListener() {} }, onInstalled: { addListener() {} },
      onMessage: { addListener() {} }
    },
    i18n: { getMessage(key) { return key } }
  }
  target.Storage = function() {}
  target.BrowserStorage = function() {
    this.remove = () => {}
    this.set = () => target.Promise.resolve()
  }
  options.initWithOptions = () => {}
  options.setProxyNotControllable = () => {}
  target.Options = function() { return options }
  target.ChromeTabs = function() {
    this.watch = () => {}
    this.resetAll = action => { defaultAction = action }
  }
  target.Inspect = function() {}
  target.proxy = { getProxyImpl: () => ({ watchProxyChange() {} }) }
  context.OffscreenCanvas = class {
    getContext() {
      return {
        scale() {}, clearRect() {}, setTransform() {}, arc() {}, closePath() {}, stroke() {},
        beginPath() { this.marker = false },
        moveTo() { this.marker = true }, lineTo() {},
        fill() { this.centerFill = this.globalCompositeOperation === 'destination-out' ? null : this.fillStyle },
        getImageData() {
          return { data: [0, 0, 0, 0], outer: this.strokeStyle,
            inner: this.centerFill, label: this.marker ? 'A' : null }
        }
      }
    }
  }
  for (const file of ['../img/icons/draw_omega.js', '../js/background.js']) {
    vm.runInNewContext(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), context)
  }
  context.zeroBackground({})
  const assertIcon = (icon, outer, automatic = false) => {
    assert.ok(icon, 'routing must produce an icon')
    for (const size of [16, 19, 24, 32, 38]) {
      assert.equal(icon[size].outer, outer)
      assert.equal(icon[size].inner, null)
      assert.equal(icon[size].label, automatic ? 'A' : null)
    }
  }

  for (const name of ['work', 'direct', 'system']) {
    await options.applyProfile(name)
    const color = options.profile(name).color
    assertIcon(defaultAction.icon, color)
    const action = await options._actionForUrl('https://example.com/')
    assertIcon(action.icon, color)
  }
  await options.applyProfile('rules')
  assertIcon(defaultAction.icon, options.profile('direct').color, true)
  for (const [url, expected] of [
    ['https://example.com/', 'work'],
    ['https://subscribed.org/', 'work'],
    ['https://other.org/', 'direct']
  ]) {
    const action = await options._actionForUrl(url)
    assert.ok(action, 'default and subscription routing must not fail during icon updates')
    assert.equal(action.profile.name, expected)
    assertIcon(action.icon, options.profile(expected).color, true)
  }
  await options.patch({ '+rules': { color: ['#99dd99', '#8064d8'] } })
  options.currentProfileChanged()
  assertIcon(defaultAction.icon, options.profile('direct').color, true)
  assertIcon((await options._actionForUrl('https://subscribed.org/')).icon, options.profile('work').color, true)
  assert.equal((await options._actionForUrl('https://other.org/', { skipIcon: true })).icon, null)
})
