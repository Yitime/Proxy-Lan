import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

function loadRuntime() {
  const context = {
    console: { log() {}, error() {}, warn() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, TextEncoder
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
  const storage = new target.Storage()
  const state = new target.Storage()
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

test('both runtime bundles load without cloud-sync or external-extension modules', () => {
  const { OmegaTarget, OmegaTargetChromium } = loadRuntime()
  assert.equal(typeof OmegaTargetChromium.WebRequestMonitor, 'function')
  assert.equal(typeof OmegaTargetChromium.Options.prototype.setQuickSwitch, 'function')
  for (const name of ['OptionsSync', 'SyncStorage', 'SwitchySharp', 'ExternalApi']) {
    assert.equal(OmegaTarget[name], undefined)
    assert.equal(OmegaTargetChromium[name], undefined)
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
  assert.equal(stored['+work'].syncOptions, undefined)
  assert.equal(stored['+work'].syncError, undefined)
})

test('first launch creates local defaults and applies the system profile', async () => {
  const { options, storage, applied } = createOptions()
  await options.init()
  assert.equal((await storage.get('schemaVersion')).schemaVersion, 2)
  assert.equal(applied.at(-1), 'system')
})

test('startup profile and virtual profiles still apply after local-only migration', async () => {
  const { options, storage, state, applied, context } = createOptions()
  const snapshot = legacyOptions(options)
  snapshot['+virtual'] = { name: 'virtual', profileType: 'VirtualProfile', defaultProfileName: 'work', rules: [] }
  snapshot['-startupProfileName'] = 'virtual'
  await storage.set(snapshot)
  await state.set({ currentProfileName: 'direct' })
  await options.init(() => true)
  assert.equal(applied.at(-1), 'virtual')
  assert.equal((await state.get('currentProfileName')).currentProfileName, 'virtual')
  const matched = await options.matchProfile(context.OmegaPac.Conditions.requestFromUrl('https://example.com/'))
  assert.equal(matched.profile.name, 'work')
})

test('restoring an old JSON backup retains its configured proxy and startup profile', async () => {
  const { options, storage, state, applied } = createOptions()
  const snapshot = legacyOptions(options)
  snapshot['-startupProfileName'] = 'work'
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

test('Chromium quick switch still toggles the popup and context-menu state', async () => {
  const context = loadRuntime()
  let popup
  let menu
  context.POPUPHTMLURL = './popup-iframe.html'
  context.chrome = {
    action: { setPopup: (value) => { popup = value.popup } },
    contextMenus: { update: (_id, value) => { menu = value } }
  }
  const options = Object.create(context.OmegaTargetChromium.Options.prototype)
  await options.setQuickSwitch(['direct', 'work'], true)
  assert.equal(popup, '')
  assert.equal(menu.checked, true)
  await options.setQuickSwitch(null, true)
  assert.equal(popup, './popup-iframe.html')
  assert.equal(menu.checked, false)
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
