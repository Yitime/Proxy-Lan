(function() {
  var logStore, waitTimeFn;

  logStore = idbKeyval.createStore('log-store', 'log-store');

  waitTimeFn = function(timeout) {
    if (timeout == null) {
      timeout = 1000;
    }
    return new Promise(function(resolve, reject) {
      return setTimeout(function() {
        return resolve();
      }, timeout);
    });
  };

  window.OmegaDebug = {
    resetOptions: function() {
      return new Promise(function(resolve, reject) {
        chrome.runtime.sendMessage({
          method: 'resetAllOptions'
        }, function(response) {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          if (!response) {
            reject(new Error('Background response is empty'));
            return;
          }
          if (response.error) {
            reject(new Error(response.error.message || response.error.reason || 'Unable to reset options'));
            return;
          }
          localStorage.clear();
          Promise.all([idbKeyval.clear(logStore), waitTimeFn(2000)])
            .then(function() {
              return idbKeyval.clear();
            })
            .then(function() {
              chrome.runtime.reload();
              resolve(response);
            })
            .catch(reject);
        });
      });
    },
    reportIssue: function() {
      return idbKeyval.get('lastError', logStore).then(function(lastError) {
        var body, env, err, extensionVersion, finalUrl, url;
        url = 'https://github.com/Yitime/Proxy-Lan/issues/new?title=&body=';
        finalUrl = url;
        try {
          extensionVersion = chrome.runtime.getManifest().version;
          env = {
            extensionVersion: extensionVersion,
            projectVersion: extensionVersion,
            userAgent: navigator.userAgent
          };
          body = chrome.i18n.getMessage('popup_issueTemplate', [env.projectVersion, env.userAgent]);
          body || (body = "\n\n\n<!-- Please write your comment ABOVE this line. -->\nProxy-Lan " + env.projectVersion + "\n" + env.userAgent);
          finalUrl = url + encodeURIComponent(body);
          err = String(lastError || '').slice(0, 4000);
          if (err) {
            body += "\n```\n" + err + "\n```";
            finalUrl = url + encodeURIComponent(body);
          }
        } catch (_error) {}
        return chrome.tabs.create({
          url: finalUrl
        });
      });
    }
  };

}).call(this);
