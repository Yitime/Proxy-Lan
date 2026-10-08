window.OmegaPopup = {};
$script(['js/index.js', 'js/profiles.js'], 'om-main');
$script(['js/i18n.js']);
$script('../js/omega_target_popup.js', 'om-target', function() {
  function showStateError(error) {
    document.getElementById('js-state-error-title').textContent = OmegaTargetPopup.getMessage('options_loadErrorTitle');
    document.getElementById('js-state-retry').hidden = false;
    document.getElementById('js-state-retry-label').textContent = OmegaTargetPopup.getMessage('common_retry');
    document.getElementById('js-state-retry-button').onclick = function(event) {
      event.preventDefault();
      location.reload();
    };
    console.error('Unable to load popup state', error);
  }
  function init(){
    chrome.tabs.query({active: true, lastFocusedWindow: true}, function(tabs){
      if (tabs && tabs.length > 0 && (tabs[0].pendingUrl || tabs[0].url)){
        const activeTab = tabs[0]
        window.OmegaPopup.activeTab = activeTab;
        const addruleEl = document.getElementById('js-addrule');
        addruleEl.setAttribute('href', '../popup.html?activeTabId=' + activeTab.id + '#!addRule')
      }
    })
    OmegaTargetPopup.getActivePageInfo(function(err, info) {
      window.OmegaPopup.pageInfo = info;
      $script.done('om-page-info');
    });
    OmegaTargetPopup.getState([
      'availableProfiles',
      'currentProfileName',
      'validResultProfiles',
      'isSystemProfile',
      'currentProfileCanAddRule',
      'proxyNotControllable',
      'externalProfile',
      'showExternalProfile',
    ], function(err, state) {
      if (err || !state || !state.availableProfiles) {
        showStateError(err || new Error('Background returned invalid popup state'));
        return;
      }
      window.OmegaPopup.state = state;
      $script.done('om-state');
    });
  }
  const permissionValue = {origins: ["<all_urls>"]}
  if (globalThis.browser && browser.proxy && browser.proxy.onRequest){
    Promise.all([browser.permissions.contains(permissionValue), browser.extension.isAllowedIncognitoAccess()])
    .then(([sitePermissions, isAllowedIncognitoAccess])=>{
      // chrome.contextMenus check is Android or PC,
      // browser.proxy.settings doesn't support Android
      if (sitePermissions && (!chrome.contextMenus || isAllowedIncognitoAccess)) {
        init();
      } else {
        location.href = 'grant_permissions.html'
      }
    }).catch(showStateError)
  } else {
    init();
  }
});
