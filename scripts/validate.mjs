#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

const fail = (message) => failures.push(message)
const relative = (file) => path.relative(root, file).replaceAll(path.sep, '/')

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.git' || entry.name === 'node_modules') return []
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(target) : [target]
  })
}

const files = walk(root)
const customJavaScript = files.filter((file) => {
  const rel = relative(file)
  return file.endsWith('.js') && !rel.startsWith('lib/') && !rel.startsWith('scripts/') && !rel.startsWith('tests/')
})

for (const file of customJavaScript) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) {
    fail(`JavaScript syntax: ${relative(file)}\n${result.stderr.trim()}`)
  }
}

for (const file of files.filter((file) => file.endsWith('.json'))) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    fail(`JSON parse: ${relative(file)}: ${error.message}`)
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
const manifestRefs = [
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  manifest.action?.default_popup,
  manifest.background?.service_worker,
  manifest.options_page,
  manifest.options_ui?.page
].filter(Boolean)

for (const ref of manifestRefs) {
  if (!fs.existsSync(path.join(root, ref))) fail(`Manifest reference missing: ${ref}`)
}

for (const htmlFile of files.filter((file) => file.endsWith('.html') && !relative(file).startsWith('partials/'))) {
  const html = fs.readFileSync(htmlFile, 'utf8')
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/gi)) {
    const ref = match[1]
    if (/^(?:[a-z]+:|#|\/|\{\{)/i.test(ref)) continue
    const cleanRef = ref.split('#')[0].split('?')[0]
    if (!cleanRef) continue
    const resolved = path.resolve(path.dirname(htmlFile), cleanRef)
    if (!fs.existsSync(resolved)) fail(`HTML reference missing: ${relative(htmlFile)} -> ${ref}`)
  }
}

for (const file of customJavaScript) {
  const source = fs.readFileSync(file, 'utf8')
  for (const match of source.matchAll(/\$script\(\s*(?:'([^']+)'|\[([^\]]+)\])/g)) {
    const refs = match[1]
      ? [match[1]]
      : [...(match[2] || '').matchAll(/'([^']+)'/g)].map((item) => item[1])
    for (const ref of refs) {
      if (!ref.endsWith('.js') || ref.includes('$') || ref.includes('{')) continue
      const sourceDir = path.dirname(file)
      const candidates = [
        path.resolve(root, ref),
        path.resolve(sourceDir, ref),
        path.resolve(sourceDir, '..', ref),
        path.resolve(sourceDir, '..', '..', ref),
        path.resolve(sourceDir, '..', '..', '..', ref)
      ]
      if (!candidates.some((candidate) => fs.existsSync(candidate))) {
        fail('Dynamic script reference missing: ' + relative(file) + ' -> ' + ref)
      }
    }
  }
}

const messages = JSON.parse(fs.readFileSync(path.join(root, '_locales/zh_CN/messages.json'), 'utf8'))
const localizationKeys = new Set()
for (const file of [...customJavaScript, ...files.filter((file) => file.endsWith('.html') && !relative(file).startsWith('partials/')), ...files.filter((file) => relative(file).startsWith('partials/') && file.endsWith('.html'))]) {
  const text = fs.readFileSync(file, 'utf8')
  for (const match of text.matchAll(/(?:getMessage|tr)\(\s*'([A-Za-z0-9_]+)'|'([A-Za-z0-9_]+)'\s*\|\s*tr/g)) {
    const key = match[1] || match[2]
    if (key) localizationKeys.add(key)
  }
}
const dynamicPrefixes = ['profile_', 'popup_proxyNotControllable_', 'popup_proxyNotControllableDetails_', 'browserAction_', 'options_condition', 'options_profileDownloadError_']
for (const key of localizationKeys) {
  if (!(key in messages) && !dynamicPrefixes.some((prefix) => key.startsWith(prefix))) {
    fail(`Localization key missing: ${key}`)
  }
}

const backgroundSource = fs.readFileSync(path.join(root, 'js/background.js'), 'utf8')
const allowlistBlock = backgroundSource.match(/allowedMethods = new Set\(\[([\s\S]*?)\]\);/)?.[1] || ''
const allowedMethods = new Set([...allowlistBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]))
const usedMethods = new Set()
for (const file of customJavaScript) {
  const text = fs.readFileSync(file, 'utf8')
  for (const match of text.matchAll(/callBackground(?:NoReply)?\(\s*'([^']+)'/g)) usedMethods.add(match[1])
}
for (const method of usedMethods) {
  if (!allowedMethods.has(method)) fail(`Background method not allowlisted: ${method}`)
}

if (failures.length) {
  console.error(failures.join('\n\n'))
  console.error(`\nValidation failed with ${failures.length} problem(s).`)
  process.exit(1)
}

console.log(`Validation passed: ${customJavaScript.length} JavaScript files, ${localizationKeys.size} localization references, and ${manifestRefs.length} manifest resources.`)