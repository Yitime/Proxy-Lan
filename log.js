// Keep only the most recent error for the issue-reporting action.
const errorStore = idbKeyval.createStore('log-store', 'log-store')
const originalConsoleError = console.error.bind(console)
let pendingError = ''
let savingError = false

// Retire the seven daily records without removing the latest error.
void idbKeyval.delMany(Array.from({ length: 7 }, (_, index) => 'zerolog-' + (index + 1)), errorStore)
  .catch((error) => console.warn('Unable to remove legacy daily logs', error))

const errorReplacer = (key, value) =>
  ['username', 'password', 'host', 'port', 'token', 'gistToken', 'gistId'].includes(key) ? '<secret>' : value

async function saveLastError() {
  if (savingError) return
  savingError = true
  try {
    while (pendingError) {
      const value = pendingError
      pendingError = ''
      await idbKeyval.set('lastError', value, errorStore)
    }
  } catch (error) {
    console.warn('Unable to save the latest error', error)
  } finally {
    savingError = false
  }
}

console.error = (...args) => {
  originalConsoleError(...args)
  pendingError = args.map((value) => {
    if (value instanceof Error) return value.stack || value.message
    if (typeof value === 'string') return value
    try { return JSON.stringify(value, errorReplacer) }
    catch (_) { return String(value) }
  }).join(' ').slice(-4000)
  void saveLastError()
}
