function callBackgroundNoReply(method, args, cb) {
  chrome.runtime.sendMessage({
    method: method,
    args: args,
    noReply: true,
    refreshActivePage: true,
  });
  if (cb) return cb();
}

function callBackground(method, args, cb, refreshActivePage) {
  chrome.runtime.sendMessage({
    method: method,
    args: args,
    refreshActivePage: !!refreshActivePage,
  }, function(response) {
    if (chrome.runtime.lastError != null)
      return cb && cb(chrome.runtime.lastError)
    if (!response) return cb && cb(new Error('Background response is empty'))
    if (response.error) return cb && cb(response.error)
    return cb && cb(null, response.result)
  });
}

var requestInfoCallback = null;

OmegaTargetPopup = {
  getState: function (keys, cb) {
    callBackground('getState', [keys], cb);
    return;
  },
  setState: function (name, value, cb){
    var newItem = {};
    newItem[name] = value
    callBackground('setState', [newItem], cb);
    return;
  },
  applyProfile: function (name, cb) {
    callBackgroundNoReply('applyProfile', [name], cb);
  },
  openOptions: function (hash, cb) {
    var called = false;
    var optionsUrl = chrome.runtime.getURL('options.html');
    var targetUrl = optionsUrl + (hash || '');
    var done = function() {
      if (called) return;
      called = true;
      if (cb) cb();
    };
    var fallback = function() {
      chrome.tabs.create({ url: targetUrl }, done);
    };

    if (!hash && chrome.runtime.openOptionsPage) {
      try {
        var result = chrome.runtime.openOptionsPage(function() {
          if (chrome.runtime.lastError) {
            fallback();
          } else {
            done();
          }
        });
        if (result && typeof result.then === 'function') {
          result.then(done, fallback);
        }
        return;
      } catch (_) {}
    }

    chrome.tabs.query({}, function(tabs) {
      if (chrome.runtime.lastError) {
        return fallback();
      }
      var existing = (tabs || []).find(function(tab) {
        var tabUrl = tab.pendingUrl || tab.url || '';
        return tabUrl.indexOf(optionsUrl) === 0;
      });
      if (existing) {
        var updateProperties = { active: true };
        if (hash) updateProperties.url = targetUrl;
        chrome.tabs.update(existing.id, updateProperties, done);
      } else {
        fallback();
      }
    });
  },
  getActivePageInfo: function(cb) {
    chrome.tabs.query({active: true, lastFocusedWindow: true}, function (tabs) {
      if (tabs.length === 0 || !(tabs[0].pendingUrl || tabs[0].url)) return cb();
      var args = {tabId: tabs[0].id, url: tabs[0].pendingUrl || tabs[0].url};
      callBackground('getPageInfo', [args], cb)
    });
  },
  setDefaultProfile: function(profileName, defaultProfileName, cb) {
    callBackgroundNoReply('setDefaultProfile',
      [profileName, defaultProfileName], cb);
  },
  addCondition: function(condition, profileName, cb){
    callBackground('addCondition', [condition, profileName], cb)
  },
  getTempRules: function(cb){
    callBackground('getTempRules', [], cb);
  },
  addTempRule: function(domain, profileName, toggle, cb) {
    if (typeof toggle == 'function') {
      cb = toggle;
      toggle = null;
    }
    callBackground('addTempRule', [domain, profileName, toggle], cb, true);
  },
  openManage: function(cb) {
    chrome.tabs.create({
      url: 'chrome://extensions/?id=' + chrome.runtime.id,
    }, cb);
  },
  getMessage: chrome.i18n.getMessage.bind(chrome.i18n),
};
