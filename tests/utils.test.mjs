import test from 'node:test'
import assert from 'node:assert/strict'
import { safeTexts, safeDecodeUri, safeCssColor } from '../popup/network/js/utils.js'

test('safeTexts escapes HTML and handles nullish values', () => {
  assert.equal(safeTexts(null), '')
  assert.equal(
    safeTexts('<img src=x onerror="x">'),
    '&lt;img src=x onerror=&quot;x&quot;&gt;'
  )
})

test('safeDecodeUri returns malformed input unchanged', () => {
  assert.equal(safeDecodeUri('%E0%A4%A'), '%E0%A4%A')
  assert.equal(safeDecodeUri('https://example.com/a%20b'), 'https://example.com/a b')
})

test('safeCssColor rejects CSS and HTML injection', () => {
  globalThis.CSS = {
    supports: (property, value) => property === 'color' && !/[;<>]/.test(value)
  }
  assert.equal(safeCssColor('red'), 'red')
  assert.equal(safeCssColor('red;"></span><img src=x onerror=x>'), '')
  delete globalThis.CSS
})
