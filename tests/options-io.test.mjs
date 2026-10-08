import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const controllers = new Map()
const constants = new Map()
const module = {}
module.constant = (name, value) => { constants.set(name, value); return module }
for (const method of ['config', 'factory', 'directive', 'filter']) {
  module[method] = () => module
}
module.controller = (name, controller) => {
  controllers.set(name, controller)
  return module
}
const context = {
  console: { ...console, error() {} },
  Blob,
  angular: {
    module: () => module,
    toJson: JSON.stringify,
    fromJson: JSON.parse
  }
}
for (const file of ['omega_pac.min.js', 'omega.js']) {
  vm.runInNewContext(fs.readFileSync(new URL('../js/' + file, import.meta.url), 'utf8'), context)
}

function invokeController(name, dependencies) {
  const controller = controllers.get(name)
  const parameters = controller.toString().match(/^function\(([^)]*)\)/)[1].split(',').map((name) => name.trim())
  controller(...parameters.map((name) => dependencies[name]))
}

function ruleListEditor(profile) {
  const watches = [], events = new Map()
  const scope = { profile, options: { '+proxy': { name: 'proxy', profileType: 'FixedProfile' } },
    $watch() {},
    $watchGroup(expressions, callback) { watches.push(callback) },
    $on(name, callback) { events.set(name, callback) },
    $applyAsync(callback) { callback() } }
  const timeout = callback => { callback(); return 1 }
  timeout.cancel = () => {}
  invokeController('RuleListProfileCtrl', {
    $scope: scope, $timeout: timeout, $window: { confirm: () => true },
    $element: { find: () => [{ focus() {} }] },
    trFilter: (key, args = []) => key + ':' + args.join(',')
  })
  watches.forEach(callback => callback())
  return { scope, events }
}

test('shared subscription editor counts decoded rules and keeps downloaded text read only', () => {
  const text = '[AutoProxy 0.2.9]\n||example.org\n@@||allowed.example.org\n'
  const profile = { name: 'list', profileType: 'RuleListProfile', format: 'AutoProxy',
    ruleList: Buffer.from(text).toString('base64'), sourceUrl: 'https://example.org/list', matchProfileName: 'proxy', defaultProfileName: 'direct' }
  const { scope } = ruleListEditor(profile)
  assert.equal(scope.ruleListValidation.valid, true)
  assert.equal(scope.ruleListRuleCount, 2)
  const original = profile.ruleList
  scope.ruleListSearch = original.slice(0, 3)
  scope.ruleListReplace = 'changed'
  scope.replaceRuleListText()
  scope.importRuleList('replacement')
  scope.clearRuleList()
  assert.equal(profile.ruleList, original)
  scope.updateState = { sourceUrl: profile.sourceUrl, error: '下载失败' }
  assert.equal(scope.subscriptionError(), '下载失败')
  profile.sourceUrl = 'https://other.example.org/list'
  assert.equal(scope.subscriptionError(), '')
})

test('shared local editor validates saves and reports the actual replacement count', () => {
  const profile = { name: 'local', format: 'AutoProxy', sourceUrl: '', ruleList: '||example.org\n||sub.example.org', matchProfileName: 'proxy', defaultProfileName: 'direct' }
  const { scope, events } = ruleListEditor(profile)
  scope.ruleListSearch = 'example.org'
  scope.ruleListReplace = 'new.example.org'
  scope.updateRuleListMatchCount()
  scope.replaceRuleListText()
  assert.equal(scope.ruleListFeedback, 'options_ruleListReplaced:2')
  assert.ok(profile.ruleList.includes('new.example.org'))
  profile.format = 'Unknown'
  let prevented = false
  events.get('omegaApplyOptions')({ preventDefault() { prevented = true } })
  assert.equal(prevented, true)
  assert.equal(scope.ruleListValidation.valid, false)
})

test('shared editor blocks local rules referring to a missing mode', () => {
  const profile = { name: 'local', format: 'Switchy', sourceUrl: '',
    ruleList: '[SwitchyOmega Conditions]\n@with result\n*.example.org +missing\n* +direct\n', matchProfileName: 'proxy', defaultProfileName: 'direct' }
  const { scope, events } = ruleListEditor(profile)
  assert.equal(scope.ruleListValidation.valid, false)
  assert.ok(scope.ruleListValidation.message.includes('missing'))
  let prevented = false
  events.get('omegaApplyOptions')({ preventDefault() { prevented = true } })
  assert.equal(prevented, true)
})

test('saved advanced conditions remain editable without a global display toggle', () => {
  const watchers = []
  const scope = {
    options: {},
    profile: { name: 'rules', rules: [{ condition: { conditionType: 'HostRegexCondition', pattern: 'example' }, profileName: 'proxy' }] },
    $watch(expression, callback) { watchers.push({ expression, callback }); return () => {} },
    $on() {},
    watchAndUpdateRevision() {}
  }
  invokeController('SwitchProfileCtrl', {
    $scope: scope,
    $rootScope: { $on() {} },
    $q: { defer() { return { promise: new Promise(() => {}), resolve() {} } } },
    omegaTarget: { state: () => Promise.resolve(null) },
    trFilter: (key) => key
  })
  const updateRules = watchers.find(({ expression }) => expression === 'profile.rules').callback
  updateRules(scope.profile.rules)
  assert.ok(scope.conditionTypes.some(({ type }) => type === 'HostRegexCondition'))
  assert.equal(scope.profile.rules[0].condition.conditionType, 'HostRegexCondition')
  assert.equal(scope.options['-showConditionTypes'], undefined)
  assert.equal(watchers.some(({ expression }) => expression.includes('-showConditionTypes')), false)

  scope.profile.rules = [{ condition: { conditionType: 'HostWildcardCondition', pattern: '*.example.com' }, profileName: 'proxy' }]
  updateRules(scope.profile.rules)
  assert.ok(scope.conditionTypes.some(({ type }) => type === 'HostWildcardCondition'))
  assert.equal(scope.conditionTypes.some(({ type }) => type === 'HostRegexCondition'), false)
})

test('adding an online rule list prefills the AutoProxy subscription without changing manual rules', () => {
  const scope = {
    options: { '+翻墙': { name: '翻墙', profileType: 'FixedProfile' } },
    profile: { name: 'test', profileType: 'SwitchProfile', color: '#79c98c', defaultProfileName: 'direct', rules: [] },
    $watch() { return () => {} }, $on() {}, watchAndUpdateRevision() {},
    profileByName(name) { return this.options['+' + name] }
  }
  invokeController('SwitchProfileCtrl', {
    $scope: scope, $rootScope: { $on() {} },
    $q: { defer() { return { promise: new Promise(() => {}), resolve() {} } } },
    omegaTarget: { state: () => Promise.resolve(null) },
    defaultRuleListSettings: constants.get('defaultRuleListSettings')
  })
  scope.attachedName = '__ruleListOf_test'
  scope.attachedKey = '+__ruleListOf_test'
  scope.attachNew()
  assert.equal(scope.attached.sourceUrl, 'https://raw.githubusercontent.com/gfwlist/gfwlist/master/gfwlist.txt')
  assert.equal(scope.attached.format, 'AutoProxy')
  assert.equal(scope.attached.matchProfileName, '翻墙')
  assert.equal(scope.attached.defaultProfileName, 'direct')
  assert.equal(scope.profile.defaultProfileName, '__ruleListOf_test')
  assert.equal(scope.attachedOptions.enabled, true)
  assert.deepEqual(scope.profile.rules, [])
})

test('configuration backup exports the full options as JSON', async () => {
  const options = {
    schemaVersion: 2,
    '+proxy': { name: 'proxy', profileType: 'FixedProfile', fallbackProxy: { scheme: 'http', host: 'localhost', port: 8080 } }
  }
  const scope = {}
  let download
  invokeController('IoCtrl', {
    $scope: scope,
    $rootScope: { options, applyOptionsConfirm: () => Promise.resolve() },
    downloadFile: (blob, filename) => { download = { blob, filename } }
  })
  await scope.exportOptions()
  assert.match(download.filename, /^Proxy-Lan-options-.*\.json$/)
  assert.deepEqual(JSON.parse(await download.blob.text()), options)
})

test('configuration restore accepts a backup and reports success', async () => {
  const scope = {}
  const content = JSON.stringify({ schemaVersion: 2, '+proxy': { name: 'proxy', profileType: 'FixedProfile' } })
  let restored
  let alert
  invokeController('IoCtrl', {
    $scope: scope,
    $rootScope: {
      resetOptions: (value) => { restored = value; return Promise.resolve() },
      showAlert: (value) => { alert = value }
    }
  })
  await scope.restoreLocal(content)
  assert.equal(restored, content)
  assert.equal(scope.restoringLocal, false)
  assert.equal(alert.type, 'success')
})

test('configuration restore rejects malformed and non-object backups without resetting options', () => {
  const scope = {}
  let resets = 0
  let alert
  invokeController('IoCtrl', {
    $scope: scope,
    $rootScope: {
      resetOptions: () => { resets++; return Promise.resolve() },
      showAlert: (value) => { alert = value }
    }
  })
  for (const content of ['broken json', 'null', '[]', '42']) {
    scope.restoreLocal(content)
    assert.equal(resets, 0)
    assert.equal(scope.restoringLocal, false)
    assert.equal(alert.type, 'error')
  }
})
