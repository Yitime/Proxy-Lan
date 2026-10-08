import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

test('error reporting stores only the latest bounded error and masks credential fields', async () => {
  const writes = []
  let deleted
  const plainLog = () => {}
  const context = {
    console: { log: plainLog, error() {}, warn() {} },
    idbKeyval: {
      createStore: () => 'errors',
      set: async (key, value, store) => { writes.push({ key, value, store }) },
      delMany: async (keys) => { deleted = [...keys] }
    }
  }
  vm.runInNewContext(fs.readFileSync(new URL('../log.js', import.meta.url), 'utf8'), context)
  context.console.log('ordinary diagnostics')
  assert.equal(context.console.log, plainLog)
  assert.equal(writes.length, 0)
  assert.deepEqual(deleted, Array.from({ length: 7 }, (_, index) => 'zerolog-' + (index + 1)))
  context.console.error({ password: 'private-password', token: 'private-token', message: 'failed' })
  await new Promise(setImmediate)
  assert.ok(!writes.at(-1).value.includes('private-password'))
  assert.ok(!writes.at(-1).value.includes('private-token'))
  context.console.error('x'.repeat(5000))
  await new Promise(setImmediate)
  assert.equal(writes.at(-1).value.length, 4000)
  assert.ok(writes.every(({ key, store }) => key === 'lastError' && store === 'errors'))
})

test('uncaught page errors reach the console without accumulating local storage logs', () => {
  const messages = []
  const removed = []
  const context = { console: { error: (value) => messages.push(value) } }
  context.window = context
  context.localStorage = { removeItem: (key) => removed.push(key) }
  vm.runInNewContext(fs.readFileSync(new URL('../js/log_error.js', import.meta.url), 'utf8'), context)
  context.onerror('failed', 'options.html', 10, 2)
  assert.equal(messages[0], 'options.html:10:2: failed')
  assert.deepEqual(removed, ['log'])
})
