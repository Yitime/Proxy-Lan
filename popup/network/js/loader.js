window.UglifyJS_NoUnsafeEval = true
window.OmegaPopup = {};
$script('../../js/omega_pac.min.js', 'omega-pac')
$script('../../js/omega_target_popup.js', 'om-target', function() {
  function init(){
    OmegaTargetPopup.getState([
      'availableProfiles',
      'currentProfileName',
      'validResultProfiles',
      'isSystemProfile',
      'currentProfileCanAddRule',
      'proxyNotControllable',
      'externalProfile',
      'showExternalProfile',
      'lastProfileNameForCondition',
    ], function(err, state) {
      window.OmegaPopup.state = state;
      import('./index.js')
    });
  }
  init();
});
