import { waitTimeout, safeTexts, safeDecodeUri, copyToClipoard, displayProfileName, tr } from './utils.js'
import { initTabsSelector } from './tab.js'
import { initUrlCellDetail } from './url.js'
import Toastify from "../../../lib/zero-dependencies/toastify/toastify-es.js";
import { filesize} from "../../../lib/zero-dependencies/filesize/filesize.esm.js";
import {
  Tabulator,
  ColumnCalcsModule,
  TooltipModule,
  ValidateModule,
  EditModule,
  InteractionModule,
  FrozenColumnsModule,
  MenuModule,
  ResizeColumnsModule,
  SortModule,
  FilterModule,
  FormatModule,
  SelectRowModule,
  SelectRangeModule,
  KeybindingsModule,
} from "../../../lib/zero-dependencies/tabulator/tabulator_esm.js";
Tabulator.registerModule([
  ColumnCalcsModule,
  TooltipModule,
  ValidateModule,
  EditModule,
  MenuModule,
  InteractionModule,
  FrozenColumnsModule,
  ResizeColumnsModule,
  SortModule,
  FilterModule,
  FormatModule,
  SelectRowModule,
  SelectRangeModule,
  KeybindingsModule,
]);

const sortRequest = (a,b)=>{
  return parseInt(a.requestId) - parseInt(b.requestId)
}

const formatClock = (timestamp) => {
  const date = new Date(Number(timestamp));
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleTimeString([], { hour12: false });
};

const formatDateTime = (timestamp) => {
  const date = new Date(Number(timestamp));
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

const getHeaderValue = (headers, name)=>{
  const result = (headers || []).find((header)=> header.name?.toLowerCase() === name.toLowerCase())
  return result?.value;
}

const MAXRECORDS = 1000

const getCurrentTab = () => new Promise((resolve) => {
  chrome.tabs.getCurrent((tab) => resolve(tab || null))
})

const updateCurrentTab = (tabId, updateProperties) => new Promise((resolve, reject) => {
  chrome.tabs.update(tabId, updateProperties, (tab) => {
    if (chrome.runtime.lastError) {
      reject(new Error(chrome.runtime.lastError.message))
    } else {
      resolve(tab)
    }
  })
})

let recentlyRequestId = 0
let sequenceDataCache = {}
let autoScrollToBottom = true
let recordingPaused = false
let networkFilters = {
  tabId: null,
  search: '',
  status: 'all'
}

const statusMatchesFilter = (status, filter) => {
  if (filter === 'all') return true
  if (filter === 'ongoing') return ['start', 'ongoing'].includes(status)
  if (filter === 'done') return status === 'done'
  if (filter === 'fail') return ['error', 'timeout', 'timeoutAbort'].includes(status)
  return true
}

const applyNetworkFilters = (tabulatorInstance) => {
  const query = networkFilters.search.trim().toLowerCase()
  tabulatorInstance.setFilter((data) => {
    if (networkFilters.tabId && String(data.tabId) !== String(networkFilters.tabId)) {
      return false
    }
    if (!statusMatchesFilter(data.recentlyStatus, networkFilters.status)) {
      return false
    }
    if (!query) return true
    return [
      data.url,
      data.profileName,
      data.requestId,
      data.ip,
      data.method,
      data.contentType
    ].some((value) => String(value || '').toLowerCase().includes(query))
  })
}

const updateNetworkSummary = (tabulatorInstance) => {
  const rows = tabulatorInstance.getData()
  const counts = { total: rows.length, ongoing: 0, done: 0, fail: 0 }
  rows.forEach((row) => {
    if (['start', 'ongoing'].includes(row.recentlyStatus)) counts.ongoing++
    else if (row.recentlyStatus === 'done') counts.done++
    else if (['error', 'timeout', 'timeoutAbort'].includes(row.recentlyStatus)) counts.fail++
  })
  const values = {
    total: counts.total,
    ongoing: counts.ongoing,
    done: counts.done,
    fail: counts.fail
  }
  Object.entries(values).forEach(([key, value]) => {
    const el = document.getElementById('network-count-' + key)
    if (el) el.textContent = String(value)
  })
}

const exportNetworkCsv = (tabulatorInstance) => {
  const rows = tabulatorInstance.getFilteredData?.() || tabulatorInstance.getData()
  const fields = ['requestId', 'recentlyStatus', 'method', 'url', 'profileName', 'ip', 'statusCode', 'contentType', 'contentLength']
  const csvCell = (value) => '"' + String(value ?? '').replaceAll('"', '""') + '"'
  const csv = '\uFEFF' + [
    fields.map(csvCell).join(','),
    ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(','))
  ].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'network-requests-' + new Date().toISOString().slice(0, 19).replaceAll(':', '-') + '.csv'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  Toastify({
    text: tr('networkMonitor_exportSuccess'),
    position: 'center'
  }).showToast()
}

const initNetworkToolbar = (tabulatorInstance) => {
  const searchEl = document.getElementById('network-search')
  const statusEl = document.getElementById('network-status-filter')
  const recordingBtn = document.getElementById('network-recording-toggle')
  const recordingLabel = document.getElementById('network-recording-label')
  const exportBtn = document.getElementById('network-export')
  const searchLabel = document.getElementById('network-search-label')
  const exportLabel = document.getElementById('network-export-label')
  const totalLabel = document.getElementById('network-label-total')
  const ongoingLabel = document.getElementById('network-label-ongoing')
  const doneLabel = document.getElementById('network-label-done')
  const failLabel = document.getElementById('network-label-fail')
  const statusLabels = {
    all: tr('networkMonitor_filterAll'),
    ongoing: tr('networkMonitor_filterOngoing'),
    done: tr('networkMonitor_filterDone'),
    fail: tr('networkMonitor_filterFail')
  }

  if (searchEl) {
    searchEl.placeholder = tr('networkMonitor_searchPlaceholder')
    searchEl.addEventListener('input', () => {
      networkFilters.search = searchEl.value
      applyNetworkFilters(tabulatorInstance)
      updateNetworkSummary(tabulatorInstance)
    })
  }
  if (searchLabel) searchLabel.textContent = tr('networkMonitor_searchPlaceholder')
  if (exportLabel) exportLabel.textContent = tr('networkMonitor_export')
  if (totalLabel) totalLabel.textContent = tr('networkMonitor_total')
  if (ongoingLabel) ongoingLabel.textContent = tr('networkMonitor_ongoing')
  if (doneLabel) doneLabel.textContent = tr('networkMonitor_done')
  if (failLabel) failLabel.textContent = tr('networkMonitor_failed')
  if (statusEl) {
    Array.from(statusEl.options).forEach((option) => {
      option.textContent = statusLabels[option.value] || option.textContent
    })
    statusEl.addEventListener('change', () => {
      networkFilters.status = statusEl.value
      applyNetworkFilters(tabulatorInstance)
      updateNetworkSummary(tabulatorInstance)
    })
  }

  const updateRecordingButton = () => {
    if (!recordingBtn || !recordingLabel) return
    recordingBtn.setAttribute('aria-pressed', String(recordingPaused))
    recordingLabel.textContent = recordingPaused ? tr('networkMonitor_resume') : tr('networkMonitor_pause')
    const icon = recordingBtn.querySelector('.glyphicon')
    if (icon) icon.className = 'glyphicon ' + (recordingPaused ? 'glyphicon-play' : 'glyphicon-pause')
  }

  if (recordingBtn) {
    recordingBtn.addEventListener('click', () => {
      recordingPaused = !recordingPaused
      updateRecordingButton()
      document.dispatchEvent(new CustomEvent(recordingPaused ? 'network-monitor-pause' : 'network-monitor-resume'))
    })
  }
  if (exportBtn) {
    exportBtn.addEventListener('click', () => exportNetworkCsv(tabulatorInstance))
  }

  let summaryTimer = null
  const scheduleSummary = () => {
    clearTimeout(summaryTimer)
    summaryTimer = setTimeout(() => updateNetworkSummary(tabulatorInstance), 0)
  }
  ['rowAdded', 'rowUpdated', 'rowDeleted', 'dataChanged', 'dataLoaded'].forEach((eventName) => {
    tabulatorInstance.on(eventName, scheduleSummary)
  })
  updateRecordingButton()
  applyNetworkFilters(tabulatorInstance)
  updateNetworkSummary(tabulatorInstance)
}

const scrollTabulatorToBottom = (tabulatorInstance)=>{
  const el = tabulatorInstance.rowManager.element
  el.scrollTop = el.scrollHeight;
}

const listenerScrollEvent = (tabulatorInstance)=>{
  const targetEl = tabulatorInstance.rowManager.element;
  let isMouseScroll = false
  let timeout = null

  targetEl.addEventListener('wheel', () => {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null;
    }
    isMouseScroll = true;
    timeout = setTimeout(() => {
      isMouseScroll = false;
      timeout = null;
    }, 600);
  });

  tabulatorInstance.on("scrollVertical", function(top, topDir){
    if (!isMouseScroll) return;
    if (topDir) {
      autoScrollToBottom = false
      document.body.classList.add('disable-auto-scroll')
    } else {
      if (!autoScrollToBottom) {
        const maxTop = targetEl.scrollHeight - targetEl.clientHeight;
        if (maxTop - top < 30) {
          autoScrollToBottom = true;
          document.body.classList.remove('disable-auto-scroll')
        }
      }
    }
    //top - the current vertical scroll position
  });

}

const createTabulator = () => {
  const createFooterElement = () => {
    const footerEl = document.createElement("div");
    footerEl.className = "tabulator-footer";
    const footerContentsEl = document.createElement("div");
    footerContentsEl.className = "tabulator-footer-contents";
    footerEl.append(footerContentsEl);

    const tabsSelectorContainerEl = document.createElement('span')
    tabsSelectorContainerEl.classList.add('tabs-selector-container')
    footerContentsEl.append(tabsSelectorContainerEl)




    const paginatorEl = document.createElement("span");
    paginatorEl.className = "tabulator-paginator";
    footerContentsEl.append(paginatorEl);
    const paginatorBtnsEl = document.createElement("span")
    paginatorBtnsEl.classList.add('btn-group')

    const scrollToBottomBtnEl = document.createElement('button')
    scrollToBottomBtnEl.classList.add('btn', 'btn-default', 'btn-sm', 'scroll-to-bottom-btn')
    scrollToBottomBtnEl.innerHTML = `
      <span class="glyphicon glyphicon-fast-forward" aria-hidden="true"></span>
    `
    scrollToBottomBtnEl.onclick = ()=>{
      autoScrollToBottom = true;
      document.body.classList.remove('disable-auto-scroll')
      scrollTabulatorToBottom(tabulatorInstance)
    }
    paginatorBtnsEl.append(scrollToBottomBtnEl)


    const clearBtnEl = document.createElement('button')
    clearBtnEl.classList.add('btn', 'btn-default', 'btn-sm');
    clearBtnEl.innerHTML = `
      <span class="glyphicon glyphicon-ban-circle" aria-hidden="true"></span>
    `
    clearBtnEl.onclick = async ()=> {
      tabulatorInstance.clearData();
      sequenceDataCache = {};
      recentlyRequestId = 0;
      await waitTimeout(600);
      autoScrollToBottom = true;
      document.body.classList.remove('disable-auto-scroll')
    }
    paginatorBtnsEl.append(clearBtnEl);
    paginatorEl.append(paginatorBtnsEl)
    return footerEl;
  };

  const tabulatorInstance = new Tabulator(".network-list-container", {
    height: "100%",
    //addRowPos: "top",
    placeholder: tr('networkMonitor_noData'),
    data: [],
    layout: "fitColumns",
    //layout: "fitData",
    index: "requestId",
    //renderVertical: 'basic',
    columnDefaults: {
      headerClick: (e, column)=>{
        const def = column.getDefinition()
        if (!def.headerSort) return;
        const sorters = tabulatorInstance.getSorters()
        const result = sorters.find((sorter)=> {
          if (sorter.column === column && sorter.dir === 'asc') {
            const currSort = sorter.field + '_' + sorter.dir
            if (tabulatorInstance.__prevSort === currSort) {
              tabulatorInstance.clearSort()
              tabulatorInstance.__prevSort = null
            } else {
              tabulatorInstance.__prevSort = currSort;
            }
            return true
          }
          return false
        })
      }
    },
    //layout:"fitDataFill",
    //layout:"fitDataStretch",
    selectableRows: true,
    selectableRowsRangeMode: "click",
    selectableRowsPersistence: true,
    //    selectableRange:true, //allow only one range at a time
    //    selectableRangeColumns:false,
    //    selectableRangeRows:true,
    //    selectableRangeClearCells:false,
    footerElement: createFooterElement(),
    resizableColumnGuide:true,
    columns: [
      //Define Table Columns
      {
        title: "ID",
        width: 100,
        field: "requestId"
      },
      {
        title: "🕛️",
        field: "statusInfo.start",
        width: 105,
        hozAlign: "center",
        headerHozAlign: "center",
        headerSort: true,
        formatter: (cell) => {
          const cellVal = cell.getValue();
          return `<time title="${formatDateTime(cellVal)}">${formatClock(cellVal)}</time>`;
        },
      },
      {
        title: '',
        field: "recentlyStatus",
        width: 50,
        hozAlign: "center",
        headerSort: false,
        headerFilter:"list",
        headerFilterParams: {
          values: {
            "all": "",
            "ongoing": "Ongoing",
            "done": "Done",
            "fail": "Fail"
          },
          elementAttributes:{
            class: "form-control"
          },
          clearable:true,
          itemFormatter:function(label, value, item, element){
            switch (value) {
              case "ongoing": {
                return "<i class='glyphicon glyphicon-circle-arrow-down'/> Ongoing";
              }
              case "done": {
                return "<i class='glyphicon glyphicon-ok-sign'/> Done";
              }
              case "fail": {
                return `<i class='glyphicon glyphicon-exclamation-sign'/> Fail`;
              }
              default:{
                return `<i class='glyphicon glyphicon-info-sign'/> All`;
              }
            }
          }
        },
        headerFilterFunc: function(headerValue, rowValue, rowData, filterParams){
          switch (headerValue){
            case "ongoing":{
              return ['start', 'ongoing'].indexOf(rowValue) >= 0
            }
            case "done":{
              return headerValue == rowValue
            }
            case "fail":{
              return ['error', 'timeout', 'timeoutAbort'].indexOf(rowValue) >= 0
            }
            default: {
              return true
            }
          }
        },
        formatter: (cell) => {
          const recentlyStatus = cell.getValue();
          const request = cell.getRow().getData();
          switch (recentlyStatus) {
            case "start": {
              return "<i class='glyphicon glyphicon-circle-arrow-down status-start' title='Request start'/>";
            }
            case "done": {
              return "<i class='glyphicon glyphicon-ok-sign status-done' title='Request done'/>";
            }
            case "timeout": {
              return "<i class='glyphicon glyphicon-question-sign status-timeout' title='Request timeout'/>";
            }
            case "timeoutAbort": {
              return "<i class='glyphicon glyphicon-exclamation-sign status-timeout-abort' title='Request timeout abort'/>";
            }
            case "error": {
              const icon = document.createElement('i');
              icon.className = 'glyphicon glyphicon-exclamation-sign status-error';
              icon.title = `Request error: ${request.error || ''}`;
              return icon;
            }
            case "ongoing": {
              return "<i class='glyphicon glyphicon-circle-arrow-down status-ongoing' title='Request ongoing'/>";
            }
          }
        },
      },
      {
        title: "Profile",
        field: "profileName",
        width: 300,
        headerFilter:"input",
        headerFilterParams: {
          elementAttributes:{
            class: "form-control"
          }
        },
        tooltip: (e, cell, onRendered)=>{
          const el = document.createElement('div')
          const request = cell.getRow().getData();
          const actionProfile = request.actionProfile || {}
          const detailTitle = displayProfileName(actionProfile.title || actionProfile.shortTitle || '')
          el.innerText = detailTitle;
          return el;
        },
      },
      { title: "URL", field: "url", minWidth: 300, tooltip: true,
        cssClass: 'url-field',
        headerFilter:"input",
        headerFilterParams: {
          elementAttributes:{
            class: "form-control"
          }
        },
        formatter: (cell)=>{
          return `<span class="glyphicon glyphicon-duplicate copy-btn" aria-hidden="true"></span><span>${safeTexts(safeDecodeUri(cell.getValue()))}</span>`
        },
        cellClick: (e, cell)=>{
          if (e && e.target) {
            e.preventDefault();
            e.stopPropagation()
            if (e.target.classList.contains('copy-btn')) {
              copyToClipoard(cell.getValue()).then(()=>{
                Toastify({
                  text: tr('networkMonitor_copySuccess'),
                  position: "center",
                }).showToast();
              }).catch(()=>{
                Toastify({
                  text: tr('networkMonitor_copyError'),
                  position: "center",
                }).showToast();
              })
              return
            }
          }
          initUrlCellDetail(cell);
        }
      },
      {
        title: "Time",
        field: "recentlyStatus",
        headerSort: false,
        width: 100,
        formatter: (cell) => {
          const recentlyStatus = cell.getValue();
          const request = cell.getRow().getData();
          const startTimestamp = request.statusInfo["start"];
          const recentlyTimestamp = request.statusInfo[recentlyStatus];
          if (recentlyTimestamp && startTimestamp) {
            let  icon = `<span class="glyphicon glyphicon-question-sign request-from-icon"></span>`
            if (recentlyStatus == 'done') {
              icon = `<span class="glyphicon glyphicon-cloud request-from-icon" title="From remote server"></span>`
              if (request.fromCache) {
                icon = `<span class="glyphicon glyphicon-hdd request-from-icon" title="From local cache"></span>`
              }
            }
            const duration = Number.parseFloat(recentlyTimestamp - startTimestamp).toFixed(2)
            return `${icon} ${duration}ms`;
          }
          return "-";
        },
      },
      { title: "Remote IP", field: "ip", width: 200,
        headerFilter:"input",
        headerFilterParams: {
          elementAttributes:{
            class: "form-control"
          }
        },
      },
      { title: "MethodType", field: "type", width: 100, visible: false },
      { title: "Status", field: "statusCode", width: 100 },
      { title: "Type", field: "contentType", width: 100, tooltip: true,
        headerFilter:"input",
        headerFilterParams: {
          elementAttributes:{
            class: "form-control"
          }
        },
      },
      { title: "Size", field: "contentLength", width: 100, tooltip: true,
        formatter: (cell)=>{
          const cellVal = cell.getValue() || 0
          if (cellVal > 0) {
            return filesize(cellVal);
          } else {
            return '-'
          }
        }
      },
      { title: "Cache", field: "fromCache", width: 50, visible: false },
      { title: "Method", field: "method", width: 100, visible: false },
      { title: "Tab", field: "tabId", width: 50, visible: false },
    ],
  });
  tabulatorInstance.on("rowAdded", function(){
    const rows = tabulatorInstance.getRows()
    if (rows.length > MAXRECORDS) {
      const oldestRow = rows.reduce((oldest, row) => {
        const oldestId = Number(oldest?.getIndex?.() ?? Infinity);
        return Number(row.getIndex()) < oldestId ? row : oldest;
      }, null);
      oldestRow?.delete();
    }
  });



  return new Promise((resolve)=>{
    const onTableBuilt = ()=>{
      tabulatorInstance.alert('loading...')
      tabulatorInstance.off('tableBuilt', onTableBuilt)
      listenerScrollEvent(tabulatorInstance);
      resolve(tabulatorInstance);
    }
    tabulatorInstance.on('tableBuilt', onTableBuilt)
  })
};


function createConnectPort(tabulatorInstance, tabsSelectorInstance) {
  async function sequenceUpdateDatas(datas=[]){
    datas.forEach((data)=>{
      sequenceDataCache[data.requestId] = data;
    })
    if (recordingPaused) return
    if (sequenceUpdateDatas.isRunning) return
    sequenceUpdateDatas.isRunning = true
    try {
      while(Object.keys(sequenceDataCache).length > 0){
        let useReplace = false
        if (Object.keys(sequenceDataCache).length > 20) {
          useReplace = true
          const tableDatas = tabulatorInstance.getData()
          tableDatas.forEach((data)=> {
            if (!sequenceDataCache[data.requestId]) {
              sequenceDataCache[data.requestId] = data
            }
          })
        }
        let sequenceDatas = Object.values(sequenceDataCache)
        sequenceDatas.sort(sortRequest)
        if (sequenceDatas.length > MAXRECORDS) {
          sequenceDatas = sequenceDatas.slice(-MAXRECORDS);
        }
        sequenceDataCache = {}
        if (sequenceDatas.length == 0) {
          continue
        }
        const lastRequestId = parseInt(sequenceDatas[sequenceDatas.length - 1].requestId)
        if (useReplace) {
          const selectedDatas = tabulatorInstance.getSelectedData?.() || []
          await tabulatorInstance.replaceData(sequenceDatas)
          tabulatorInstance.selectRow(selectedDatas.map((data)=> data.requestId));
        } else {
          await tabulatorInstance.updateOrAddData(sequenceDatas)
        }
        if (lastRequestId > recentlyRequestId) {
          recentlyRequestId = lastRequestId;
        }
      }
      if (autoScrollToBottom) {
        scrollTabulatorToBottom(tabulatorInstance);
      }
    } catch (error) {
      console.error('Unable to update network request data', error);
    } finally {
      sequenceUpdateDatas.isRunning = false
    }
  }

  document.addEventListener('network-monitor-resume', function() {
    sequenceUpdateDatas();
  });

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      sequenceUpdateDatas()
    }
  });


  const config = { attributes: true, attributeFilter: ['class'] };

  const callback = function(mutationsList, observer) {
    for (const mutation of mutationsList) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        if (!document.body.classList.contains('disable-auto-scroll')) {
          sequenceUpdateDatas();
        }
      }
    }
  };
  const observer = new MutationObserver(callback);
  observer.observe(document.body, config);

  const port = chrome.runtime.connect({ name: "network-inspect" });
  const decorateRequest = (request)=>{
    if (request.actionProfile) {
      const prefix = request.actionProfile.prefix || ''
      request.profileName = prefix + displayProfileName(request.actionProfile.shortTitle)
    }
    if (request.responseHeaders && request.recentlyStatus == 'done') {
      request.contentType = getHeaderValue(request.responseHeaders, 'content-type') || '-';
      request.contentLength = parseInt(getHeaderValue(request.responseHeaders, 'content-length')) || 0;
    }
  }
  const onMessage = (msg) => {
    switch (msg.type) {
      case "connected": {
        port.postMessage({
          type: 'init',
          tabId: tabsSelectorInstance.getSelectedTabId()
        })
        break
      }
      case "init": {
        const requests = [];
        Object.values(msg.data).forEach((tabRequestInfo) => {
          if (tabRequestInfo) {
            const requestStatus = tabRequestInfo.requestStatus;
            Object.values(tabRequestInfo.requests).forEach((request) => {
              request.recentlyStatus = requestStatus[request.requestId];
              request.profileName = ''
              decorateRequest(request)
              // only display have start request
              if (request.statusInfo.start && !/^(chrome|moz)-extension:\/\//i.test(request.url)) {
                requests.push(request);
              }
            });
          }
        });
        tabulatorInstance.clearAlert();
        tabulatorInstance.clearData();
        sequenceDataCache = {};
        recentlyRequestId = 0;
        sequenceUpdateDatas(requests.slice(-MAXRECORDS))
        break;
      }
      case "update": {
        const { info, req, status } = msg.data
        //return
        if (req){
          const request = info.requests[req.requestId]
          const requestStatus = info.requestStatus;
          request.recentlyStatus = requestStatus[request.requestId];
          decorateRequest(request)
          sequenceUpdateDatas([request])
        }
        break;
      }
    }
  };

  const onDisconnect = () => {
    port.onMessage.removeListener(onMessage);
    port.onDisconnect.removeListener(onDisconnect);
    tabulatorInstance.alert(tr('networkMonitor_disconnected'))
  };
  port.onDisconnect.addListener(onDisconnect);
  port.onMessage.addListener(onMessage);
  return port;
}

const init = async () => {
  const currentTab = await getCurrentTab();
  if (currentTab?.id) {
    await updateCurrentTab(currentTab.id, {autoDiscardable: false});
  }
  const tabulatorInstance = await createTabulator();
  initNetworkToolbar(tabulatorInstance);
  const tabsSelectorContainerEl = document.querySelector('.tabs-selector-container')
  let port;
  const tabsSelectorInstance = await initTabsSelector(tabsSelectorContainerEl, {
    setTab: (tab)=>{
      networkFilters.tabId = tab && tab.id ? tab.id : null;
      applyNetworkFilters(tabulatorInstance);
      updateNetworkSummary(tabulatorInstance);
      port?.postMessage({
        type: 'init',
        ...(networkFilters.tabId ? { tabId: networkFilters.tabId } : {})
      });
    }
  })
  port = createConnectPort(tabulatorInstance, tabsSelectorInstance);
};

init();
