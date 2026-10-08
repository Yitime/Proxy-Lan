(function() {
  handleClick('js-option', showOptions);
  handleClick('js-direct', applyProfile.bind(this, 'direct'));
  handleClick('js-system', applyProfile.bind(this, 'system'));
  OmegaPopup.applyProfile = applyProfile;
  return;

  function handleClick(id, handler) {
    document.getElementById(id).addEventListener('click', handler, false);
  }

  function closePopup() {
    window.top.close();
    // If the popup is opened as a tab, the above won't work. Let's reload then.
    document.body.style.opacity = 0;
    setTimeout(function() { history.go(0); }, 300);
  }

  function showOptions(e) {
    if (typeof OmegaTargetPopup !== 'undefined') {
      try {
        OmegaTargetPopup.openOptions(null, closePopup);
        e.preventDefault();
      } catch (_) {
      }
    }
  }

  function applyProfile(profileName) {
    $script.ready('om-target', function() {
      var errorPanel = document.getElementById('js-apply-error');
      errorPanel.hidden = true;
      OmegaTargetPopup.applyProfile(profileName, function(error) {
        if (!error) return closePopup();
        document.getElementById('js-apply-error-text').textContent = error.message || '模式切换失败，请重试。';
        errorPanel.hidden = false;
        var configure = document.getElementById('js-configure-profile');
        configure.hidden = error.name !== 'ProxyConfigurationError';
        configure.onclick = function(event) {
          event.preventDefault();
          OmegaTargetPopup.openOptions('#!/profile/' + encodeURIComponent(error.profileName || profileName), closePopup);
        };
      });
    });
  }

})();
