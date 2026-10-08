(function() {
  var initContextMenu, _ref;

  if (!globalThis.window) {
    globalThis.window = globalThis;
    globalThis.global = globalThis;
  }

  window.UglifyJS_NoUnsafeEval = true;


  initContextMenu = function() {
    if (!chrome.contextMenus) {
      return;
    }
    chrome.contextMenus.removeAll(function() {
      if (chrome.runtime.lastError) {
        console.error('Unable to clear context menus', chrome.runtime.lastError);
      }
      const menuItems = [
        {
          id: 'reportIssue',
          title: chrome.i18n.getMessage('popup_reportIssues'),
          contexts: ["action"]
        },
        {
          id: 'reload',
          title: chrome.i18n.getMessage('popup_Reload'),
          contexts: ["action"]
        }
      ];
      menuItems.push({
        id: 'options',
        title: chrome.i18n.getMessage('popup_showOptions'),
        contexts: ["action"]
      });
      menuItems.forEach((item) => chrome.contextMenus.create(item));
    });
  };

  initContextMenu();

  if ((_ref = chrome.contextMenus) != null) {
    _ref.onClicked.addListener(function(info, tab) {
      var url;
      switch (info.menuItemId) {
        case 'options':
          return (globalThis.browser || chrome).runtime.openOptionsPage();
        case 'reload':
          return chrome.runtime.reload();
        case 'reportIssue':
          return OmegaDebug.reportIssue();
      }
    });
  }

}).call(this);
