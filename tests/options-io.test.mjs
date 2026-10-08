import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const controllers = new Map()
const module = {}
for (const method of ['constant', 'config', 'factory', 'directive', 'filter']) {
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

for (const condition of [
  { conditionType: 'HostWildcardCondition', pattern: '*.example.com' },
  { conditionType: 'HostRegexCondition', pattern: '(^|\\.)example\\.com$' }
]) {
  test('standard export preserves ' + condition.conditionType + ' with an old legacy-export setting', async () => {
    const watchers = new Map()
    const scope = {
      options: { '-exportLegacyRuleList': true },
      profile: { name: 'test-profile', rules: [{ condition: { ...condition }, profileName: 'proxy' }] },
      $watch(expression, callback) {
        watchers.set(expression, callback)
        return () => {}
      },
      $on() {},
      watchAndUpdateRevision() {},
      setExportRuleListHandler(handler) { this.exportRuleList = handler }
    }
    let download
    invokeController('SwitchProfileCtrl', {
      $scope: scope,
      $rootScope: { $on() {} },
      $location: { search: () => ({}) },
      $q: {
        defer() {
          let resolve
          const promise = new Promise((done) => { resolve = done })
          return { promise, resolve }
        }
      },
      omegaTarget: { state: () => Promise.resolve(null) },
      trFilter: (key) => key,
      downloadFile: (blob, filename) => { download = { blob, filename } }
    })
    scope.attachedOptions.defaultProfileName = 'direct'
    watchers.get('options["-showConditionTypes"]')(0)
    scope.exportRuleList()

    assert.equal(download.filename, 'OmegaRules_test_profile.sorl')
    const text = await download.blob.text()
    const rules = context.OmegaPac.RuleList.Switchy.parse(text, 'proxy', 'direct')
    assert.equal(rules.length, 1)
    assert.deepEqual(JSON.parse(JSON.stringify(rules[0].condition)), condition)
    assert.equal(rules[0].profileName, 'proxy')
  })
}

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
