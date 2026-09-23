
import { tr } from './utils.js'

let tabInfo = {}
let selfTabId = null

const queryTabs = (queryInfo = {}) => new Promise((resolve, reject) => {
  chrome.tabs.query(queryInfo, (tabs) => {
    if (chrome.runtime.lastError) {
      reject(new Error(chrome.runtime.lastError.message))
    } else {
      resolve(tabs || [])
    }
  })
})

const getTab = (tabId) => new Promise((resolve, reject) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) {
      reject(new Error(chrome.runtime.lastError.message))
    } else {
      resolve(tab)
    }
  })
})

const getCurrentTab = () => new Promise((resolve) => {
  chrome.tabs.getCurrent((tab) => resolve(tab || null))
})

chrome.tabs.onCreated.addListener((tab) => {
  if (!tab.id) return
  tabInfo[tab.id] = tab
  updateTabSelectorOptions()
})

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabInfo[tabId]
  updateTabSelectorOptions()
})

chrome.tabs.onReplaced?.addListener((added, removed) => {
  delete tabInfo[removed]
  getTab(added).then((tab) => {
    tabInfo[added] = tab
    updateTabSelectorOptions()
  }).catch(() => {
    updateTabSelectorOptions()
  })
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const info = tabInfo[tabId] || (tabInfo[tabId] = {})
  info.id = tabId
  info.windowId = tab.windowId
  if (info.title !== tab.title || info.url !== tab.url) {
    info.title = tab.title
    info.url = tab.url
    updateTabSelectorOptions()
  }
})

const initTabInfo = async () => {
  const tabs = await queryTabs()
  tabs.forEach((tab) => {
    if (!tab.id) return
    tabInfo[tab.id] = tab
  })
  selfTabId = (await getCurrentTab())?.id || null
}

const updateTabSelectorOptions = (selectedKey) => {
  document.querySelectorAll('.tab-selector').forEach((selectorEl) => {
    const currentValue = String(selectedKey ?? selectorEl.value ?? '')
    const fragment = document.createDocumentFragment()

    const allOption = document.createElement('option')
    allOption.value = ''
    allOption.textContent = tr('networkMonitor_allTabs') || '(All)All tabs'
    allOption.selected = !currentValue
    fragment.append(allOption)

    if (currentValue && !tabInfo[currentValue]) {
      const closedOption = document.createElement('option')
      closedOption.value = currentValue
      closedOption.textContent = `(${currentValue})${tr('networkMonitor_closedTab') || '(Closed)'}`
      closedOption.selected = true
      closedOption.style.color = 'var(--negativeColor, red)'
      closedOption.style.fontWeight = 'bolder'
      fragment.append(closedOption)
    }

    Object.values(tabInfo)
      .filter((tab) => tab.id && tab.id !== selfTabId)
      .sort((a, b) => Number(a.id) - Number(b.id))
      .forEach((tab) => {
        const option = document.createElement('option')
        option.value = String(tab.id)
        option.selected = String(tab.id) === currentValue
        option.textContent = `(${tab.id})${tab.title || ''}`
        fragment.append(option)
      })

    selectorEl.replaceChildren(fragment)
    updateSelectedTabInfo(selectorEl)
  })
}

const updateSelectedTabInfo = (selectorEl) => {
  const containerEl = selectorEl.parentElement
  const tabId = selectorEl.value
  if (!tabId) {
    containerEl.classList.remove('tab-selected', 'tab-closed')
    return
  }

  containerEl.classList.add('tab-selected')
  const tab = tabInfo[tabId]
  const tabTipEl = containerEl.querySelector('.tab-tip')
  if (!tab) {
    containerEl.classList.add('tab-closed')
    tabTipEl.textContent = ''
    return
  }

  containerEl.classList.remove('tab-closed')
  try {
    tabTipEl.textContent = tab.url ? new URL(tab.url).hostname : ''
  } catch (_) {
    tabTipEl.textContent = ''
  }
}

export const initTabsSelector = async (containerEl, opts = {}) => {
  await initTabInfo()

  const sp = new URLSearchParams(document.location.search)
  const requestedTabId = /^\d+$/.test(sp.get('tabId') || '') ? Number(sp.get('tabId')) : null

  const selectorEl = document.createElement('select')
  selectorEl.classList.add('tab-selector', 'form-control')
  selectorEl.onchange = () => {
    updateSelectedTabInfo(selectorEl)
    const selectedTabId = Number(selectorEl.value) || null
    opts.setTab?.(selectedTabId ? tabInfo[selectedTabId] : null)
  }
  containerEl.append(selectorEl)

  const tabInfoContainerEl = document.createElement('span')
  tabInfoContainerEl.classList.add('tab-info-container')
  tabInfoContainerEl.innerHTML = `
  <span class="tab-closed-tip">(Closed)</span>
  <span class="btn-group tab-btns">
    <span class="btn btn-default btn-sm refresh-tab-btn">
      <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span>
    </span>
    <span class="btn btn-default btn-sm view-tab-btn">
      <span class="glyphicon glyphicon-eye-open" aria-hidden="true"></span>
    </span>
  </span>
  <span class="tab-tip"></span>
  `
  containerEl.append(tabInfoContainerEl)

  tabInfoContainerEl.querySelector('.refresh-tab-btn').onclick = () => {
    const selectedTabId = Number(selectorEl.value)
    if (!selectedTabId || selectedTabId === selfTabId) return
    if (tabInfo[selectedTabId]) {
      chrome.tabs.reload(selectedTabId, { bypassCache: true })
    }
  }

  tabInfoContainerEl.querySelector('.view-tab-btn').onclick = () => {
    const selectedTabId = Number(selectorEl.value)
    if (!selectedTabId || selectedTabId === selfTabId) return
    const tab = tabInfo[selectedTabId]
    if (!tab) return

    chrome.tabs.update(selectedTabId, { active: true })
    if (selfTabId && tabInfo[selfTabId]?.windowId !== tab.windowId) {
      chrome.windows.update(tab.windowId, { drawAttention: true, focused: true })
    }
  }

  updateTabSelectorOptions(requestedTabId)
  return {
    selfTabId,
    getSelectedTabId: () => Number(selectorEl.value) || null
  }
}
