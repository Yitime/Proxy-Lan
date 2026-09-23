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

  await openOptions(target, '#!/general')
  assert.equal(updated.tabId, 7)
  assert.equal(updated.properties.active, true)
  assert.equal(updated.properties.url, optionsUrl + '#!/general')
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
