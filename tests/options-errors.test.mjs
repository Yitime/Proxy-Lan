import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const q = {
  when: (value) => Promise.resolve(value),
  reject: (error) => Promise.reject(error),
  defer() {
    let resolve, reject
    const promise = new Promise((yes, no) => { resolve = yes; reject = no })
    return { promise, resolve, reject }
  }
}

function loadPermissions(permissions) {
  const elements = new Map()
  for (const name of ['grant-permissions-btn', 'permissions-error', '.site-permissions-required', '.incognito-access-required', '.loading-dialog']) {
    elements.set(name, { hidden: true, disabled: false, remove() { this.removed = true }, showModal() {}, addEventListener() {} })
  }
  let onLoad
  const errors = []
  const context = {
    document: { getElementById: key => elements.get(key), querySelector: key => elements.get(key) },
    browser: { permissions, extension: { isAllowedIncognitoAccess: async () => false } },
    chrome: { contextMenus: {} },
    location: {},
    window: { addEventListener(event, callback) { if (event === 'load') onLoad = callback } },
    console: { error: (...args) => errors.push(args) }
  }
  vm.runInNewContext(fs.readFileSync(new URL('../popup/js/grant_permissions.js', import.meta.url), 'utf8'), context)
  return { elements, onLoad, errors, context }
}

test('a failed permission check closes the loading dialog and shows a recoverable error', async () => {
  const page = loadPermissions({ contains: async () => { throw new Error('Permission service unavailable') } })
  await page.onLoad()
  assert.equal(page.elements.get('.loading-dialog').removed, true)
  assert.equal(page.elements.get('permissions-error').hidden, false)
  assert.equal(page.elements.get('grant-permissions-btn').disabled, false)
  assert.equal(page.errors.length, 1)
})

test('denied and failed permission requests keep the action available without an unhandled rejection', async () => {
  for (const request of [async () => false, async () => { throw new Error('Permission request failed') }]) {
    const page = loadPermissions({ contains: async () => false, request })
    const button = page.elements.get('grant-permissions-btn')
    await button.onclick()
    assert.equal(button.disabled, false)
    assert.equal(page.elements.get('.site-permissions-required').removed, undefined)
    assert.equal(page.context.location.href, undefined)
  }
})

test('granting website access preserves instructions while privacy permission is still missing', async () => {
  const page = loadPermissions({ contains: async () => true, request: async () => true })
  await page.elements.get('grant-permissions-btn').onclick()
  assert.equal(page.elements.get('.site-permissions-required').removed, true)
  assert.equal(page.elements.get('.incognito-access-required').removed, undefined)
  assert.equal(page.context.location.href, undefined)
  assert.equal(page.errors.length, 0)
})

function loadPage(chrome = {}) {
  const factories = new Map()
  const controllers = new Map()
  const errors = []
  const module = {}
  for (const method of ['constant', 'config', 'directive', 'filter']) module[method] = () => module
  module.factory = (name, factory) => { factories.set(name, factory); return module }
  module.controller = (name, controller) => { controllers.set(name, controller); return module }
  const context = {
    angular: { module: () => module, toJson: JSON.stringify, fromJson: JSON.parse },
    console: { error: (...args) => errors.push(args) },
    Error, Blob,
    chrome: { ...chrome, i18n: { getMessage: () => '' } },
    document: { createElement: () => ({}) },
    localStorage: {}
  }
  for (const name of ['omega_pac.min.js', 'omega.js', 'omega_target_web.js']) {
    vm.runInNewContext(fs.readFileSync(new URL('../js/' + name, import.meta.url), 'utf8'), context)
  }
  const invoke = (map, name, dependencies) => {
    const fn = map.get(name)
    const names = fn.toString().match(/^function\(([^)]*)\)/)[1].split(',').map(name => name.trim())
    return fn(...names.map(name => dependencies[name]))
  }
  return {
    factory: (name, dependencies) => invoke(factories, name, { $q: q, ...dependencies }),
    controller: (name, dependencies) => invoke(controllers, name, dependencies),
    errors
  }
}

test('cancelled save dialogs abort exports without unhandled rejections or error alerts', async () => {
  for (const reason of [undefined, null, 'cancel', 'escape key press', 'backdrop click']) {
    const page = loadPage()
    let alerts = 0, saved = 0, downloaded = 0
    const root = { showAlert() { alerts++ }, options: { schemaVersion: 2 } }
    const dialogs = page.factory('omegaDialog', { $modal: {
      open() { return { result: Promise.reject(reason), opened: Promise.resolve() } }
    } })
    root.applyOptionsConfirm = () => dialogs.open({}).result.then(() => { saved++ })
    const scope = {}
    page.controller('IoCtrl', {
      $scope: scope, $rootScope: root, downloadFile() { downloaded++ }
    })
    const runAction = page.factory('omegaAction', { $rootScope: root })
    await runAction(scope.exportOptions())
    assert.equal(saved, 0)
    assert.equal(downloaded, 0)
    assert.equal(alerts, 0)
    assert.equal(page.errors.length, 0)
  }
})

test('confirmed save dialogs still allow exports', async () => {
  const page = loadPage()
  let saved = 0, downloaded = 0
  const root = { options: { schemaVersion: 2 }, showAlert() {} }
  const dialogs = page.factory('omegaDialog', { $modal: {
    open() { return { result: Promise.resolve('ok'), opened: Promise.resolve() } }
  } })
  root.applyOptionsConfirm = () => dialogs.open({}).result.then(() => { saved++ })
  const scope = {}
  page.controller('IoCtrl', { $scope: scope, $rootScope: root, downloadFile() { downloaded++ } })
  await page.factory('omegaAction', { $rootScope: root })(scope.exportOptions())
  assert.equal(saved, 1)
  assert.equal(downloaded, 1)
})

test('options actions consume cancelled navigation while reporting real transition failures', async () => {
  const page = loadPage()
  const alerts = []
  const runAction = page.factory('omegaAction', { $rootScope: { showAlert(alert) { alerts.push(alert) } } })
  for (const message of ['transition superseded', 'transition prevented', 'transition aborted']) {
    await runAction(Promise.reject(new Error(message)))
  }
  assert.equal(alerts.length, 0)
  assert.equal(page.errors.length, 0)
  for (const message of ['transition failed', 'Template could not be loaded', 'Background is unavailable']) {
    await runAction(Promise.reject(new Error(message)))
  }
  assert.deepEqual(alerts.map(alert => alert.message), ['transition failed', 'Template could not be loaded', 'Background is unavailable'])
  assert.equal(page.errors.length, 3)
})

test('a disappearing profile does not interrupt an active navigation but redirects when idle', () => {
  for (const navigating of [true, false]) {
    const page = loadPage()
    const watches = [], timeouts = [], redirects = []
    const scope = { options: {}, $watch(expression, callback) { watches.push(callback); return () => {} } }
    page.controller('ProfileCtrl', {
      $scope: scope, $stateParams: { name: 'old-profile' }, $rootScope: { options: {} },
      $state: { transition: navigating ? Promise.resolve() : null },
      $timeout: callback => timeouts.push(callback),
      $location: { path(value) { if (value !== undefined) redirects.push(value); return '/profile/old-profile' } }
    })
    watches[0](undefined)
    timeouts.forEach(callback => callback())
    assert.deepEqual(redirects, navigating ? [] : ['/'])
  }
})

test('failed dialog templates show the actual failure rather than a second opened rejection', async () => {
  const page = loadPage()
  const error = new Error('Template could not be loaded')
  let alert
  const root = { showAlert(value) { alert = value } }
  const dialogs = page.factory('omegaDialog', { $modal: {
    open() { return { result: Promise.reject(error), opened: Promise.reject(false) } }
  } })
  await page.factory('omegaAction', { $rootScope: root })(dialogs.open({}).result)
  assert.equal(alert.type, 'error')
  assert.equal(alert.message, error.message)
  assert.equal(page.errors.length, 1)
})

test('failed background state requests reject their callers instead of staying pending', async () => {
  const error = new Error('Background is unavailable')
  const page = loadPage({ runtime: { sendMessage(request, callback) { callback({ error }) } } })
  const target = page.factory('omegaTarget', {})
  for (const promise of [target.state('currentProfileName'), target.state(['currentProfileName']), target.state('lastProfileNameForCondition', 'work')]) {
    await assert.rejects(promise, /Background is unavailable/)
  }
})

test('an editor preference failure leaves rules available and reports the background error once', async () => {
  const page = loadPage()
  const error = new Error('Background is unavailable')
  let alert
  const root = { $on() {}, showAlert(value) { alert = value } }
  root.runAction = page.factory('omegaAction', { $rootScope: root })
  const scope = {
    profile: { name: 'rules', rules: [] }, options: {},
    $watch() { return () => {} }, $on() {},
    watchAndUpdateRevision() {}
  }
  page.controller('SwitchProfileCtrl', {
    $scope: scope, $rootScope: root, $q: q,
    omegaTarget: { state: () => Promise.reject(error) }
  })
  await new Promise(setImmediate)
  assert.equal(scope.loadRules, true)
  assert.equal(alert.message, error.message)
  assert.equal(page.errors.length, 1)
})

test('null background state is rejected clearly and successful requests preserve the API shape', async () => {
  let result = null
  const page = loadPage({ runtime: { sendMessage(request, callback) { callback({ result }) } } })
  const target = page.factory('omegaTarget', {})
  await assert.rejects(target.state('currentProfileName'), /Background returned invalid state/)
  result = { currentProfileName: 'work', isSystemProfile: false }
  assert.equal(await target.state('currentProfileName'), 'work')
  assert.deepEqual(Array.from(await target.state(['currentProfileName', 'isSystemProfile'])), ['work', false])
  assert.equal(await target.state('lastProfileNameForCondition', 'direct'), 'direct')
})

test('popup does not render profiles from a null or failed state response and offers reload', () => {
  for (const response of [[new Error('Background is unavailable'), undefined], [null, null], [null, {}]]) {
    const elements = new Map()
    const done = []
    let reloaded = false
    const context = {
      console: { error() {} },
      location: { reload() { reloaded = true } },
      document: { getElementById(id) {
        if (!elements.has(id)) elements.set(id, { hidden: true })
        return elements.get(id)
      } },
      chrome: { tabs: { query(query, callback) { callback([]) } } },
      OmegaTargetPopup: {
        getMessage: key => key,
        getActivePageInfo(callback) { callback(null, null) },
        getState(keys, callback) { callback(...response) }
      }
    }
    context.window = context
    context.$script = (path, name, callback) => { if (callback) callback() }
    context.$script.done = name => done.push(name)
    vm.runInNewContext(fs.readFileSync(new URL('../popup/js/loader.js', import.meta.url), 'utf8'), context)
    assert.equal(done.includes('om-state'), false)
    assert.equal(elements.get('js-state-error-title').textContent, 'options_loadErrorTitle')
    assert.equal(elements.get('js-state-retry').hidden, false)
    elements.get('js-state-retry-button').onclick({ preventDefault() {} })
    assert.equal(reloaded, true)
  }
})
