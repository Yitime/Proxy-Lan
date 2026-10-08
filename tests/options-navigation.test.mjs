import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../js/omega_target_popup.js', import.meta.url), 'utf8')
const optionsUrl = 'chrome-extension://test/options.html'

function loadPopup(chrome) {
  const context = { chrome, console }
  vm.runInNewContext(source, context)
  return context.OmegaTargetPopup
}

function openOptions(target, hash) {
  return new Promise((resolve) => target.openOptions(hash, resolve))
}

test('popup switching waits for background acknowledgement and surfaces configuration errors', () => {
  let request, response
  const target = loadPopup({ runtime: { sendMessage(value, callback) { request = value; response = callback } }, i18n: { getMessage: () => '' } })
  let outcome = 'pending'
  target.applyProfile('自动', error => { outcome = error })
  assert.equal(outcome, 'pending')
  assert.equal(request.noReply, undefined)
  assert.equal(request.refreshActivePage, true)
  response({ error: { name: 'ProxyConfigurationError', profileName: '翻墙', message: '请先配置代理' } })
  assert.equal(outcome.profileName, '翻墙')
})

test('openOptions uses the native options-page API first', async () => {
  let opened = 0
  const target = loadPopup({
    runtime: {
      lastError: null,
      getURL: () => optionsUrl,
      openOptionsPage(callback) {
        opened++
        callback()
      }
    },
    i18n: { getMessage: () => '' }
  })

  await openOptions(target, null)
  assert.equal(opened, 1)
})

test('openOptions updates an existing options tab for hash routes', async () => {
  let updated = null
  const target = loadPopup({
    runtime: {
      lastError: null,
      getURL: () => optionsUrl
    },
    tabs: {
      query(_query, callback) {
        callback([{ id: 7, url: optionsUrl }])
      },
      update(tabId, properties, callback) {
        updated = { tabId, properties }
        callback()
      }
    },
    i18n: { getMessage: () => '' }
  })

  await openOptions(target, '#!/ui')
  assert.equal(updated.tabId, 7)
  assert.equal(updated.properties.active, true)
  assert.equal(updated.properties.url, optionsUrl + '#!/ui')
})

test('openOptions creates a tab when lookup fails', async () => {
  let created = null
  const target = loadPopup({
    runtime: {
      lastError: { message: 'query failed' },
      getURL: () => optionsUrl
    },
    tabs: {
      query(_query, callback) {
        callback([])
      },
      create(properties, callback) {
        created = properties
        callback()
      }
    },
    i18n: { getMessage: () => '' }
  })

  await openOptions(target, null)
  assert.equal(created.url, optionsUrl)
})
