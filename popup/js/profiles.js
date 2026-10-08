(function() {

  var profileTemplate = document.getElementById('js-profile-tpl')
    .cloneNode(true);
  profileTemplate.removeAttribute('id');

  var iconForProfileType = {
    'DirectProfile': 'mode-icon mode-icon-direct',
    'SystemProfile': 'mode-icon mode-icon-system',
    'FixedProfile': 'mode-icon mode-icon-proxy',
    'RuleListProfile': 'mode-icon mode-icon-list',
    'SwitchProfile': 'mode-icon mode-icon-auto',
  };
  var orderForType = {
    'FixedProfile': -2000,
    'SwitchProfile': 2000,
    'RuleListProfile': 3000,
  };

  $script.ready('om-state', updateMenuByState);
  $script.ready(['om-state', 'om-page-info'], updateMenuByStateAndPageInfo);

  return;

  function updateMenuByState() {
    var state = OmegaPopup.state;
    if (state.proxyNotControllable) {
      location.href = 'proxy_not_controllable.html';
      return;
    }
    addProfilesItems(state);
    $script.done('om-profile-items');
    updateOtherItems(state);
  }

  function displayName(profile) {
    return profile.displayName || OmegaTargetPopup.getMessage('profile_' + profile.name) || profile.name;
  }

  function compareProfile(a, b) {
    var diff;
    diff = (orderForType[a.profileType] | 0) - (orderForType[b.profileType] | 0);
    if (diff !== 0) {
      return diff;
    }
    if (a.name === b.name) {
      return 0;
    } else if (a.name < b.name) {
      return -1;
    } else {
      return 1;
    }
  }

  function updateMenuByStateAndPageInfo() {
    var state = OmegaPopup.state;
    var info = OmegaPopup.pageInfo;
    if (state.showExternalProfile && state.externalProfile) {
      showMenuForExternalProfile(state);
    }
    if (!info || !info.url) return updateOtherItems(null);
  }

  function showMenuForExternalProfile(state) {
    var profile = state.externalProfile;
    profile.name = OmegaTargetPopup.getMessage('popup_externalProfile')
    var profileDisp = createMenuItemForProfile(profile);

    var link = profileDisp.querySelector('a');
    link.id = 'js-external';
    link.addEventListener('click', function() {
      location.href = '../popup.html#!external';
    });

    if (state.currentProfileName === '') {
      profileDisp.classList.add('om-effective');
    }

    var profilesEnd = document.getElementById('js-profiles-end');
    profilesEnd.parentElement.insertBefore(profileDisp, profilesEnd);
  }

  function updateOtherItems(state) {
    var hasValidResults = state && state.validResultProfiles &&
      state.validResultProfiles.length;
    if (!hasValidResults || !state.currentProfileCanAddRule) {
      document.querySelector('.om-nav-addrule').classList.add('om-hidden');
      document.getElementById('js-addrule').href = '#';
    }
  }

  function addProfilesItems(state) {
    var systemProfileDisp = document.getElementById('js-system');
    var directProfileDisp = document.getElementById('js-direct');
    var systemProfile = state.availableProfiles['+system']
    var directProfile = state.availableProfiles['+direct']
    systemProfileDisp.querySelector('.om-profile-name').textContent = displayName(systemProfile);
    directProfileDisp.querySelector('.om-profile-name').textContent = displayName(directProfile);
    var currentProfileClass = 'om-active';
    if (state.isSystemProfile) {
      systemProfileDisp.parentElement.classList.add('om-active');
      currentProfileClass = 'om-effective';
    }
    if (state.currentProfileName === 'direct') {
      directProfileDisp.parentElement.classList.add(currentProfileClass);
    }
    systemProfileDisp.setAttribute('title',
      systemProfile.desc);
    directProfileDisp.setAttribute('title',
      directProfile.desc);
    systemProfileDisp.querySelector('.glyphicon').style.color =
      systemProfile.color;
    directProfileDisp.querySelector('.glyphicon').style.color =
      directProfile.color;

    var profilesEnd = document.getElementById('js-profiles-end');
    var profilesContainer = profilesEnd.parentElement;
    var profileCount = 0;
    var charCodeUnderscore = '_'.charCodeAt(0)
    var profiles = Object.keys(state.availableProfiles).map(function(key) {
      return state.availableProfiles[key];
    }).sort(compareProfile);
    profiles.forEach(function(profile) {
      if (profile.builtin) return;
      if (profile.name.charCodeAt(0) === charCodeUnderscore) return;
      profileCount++;

      var profileDisp = createMenuItemForProfile(profile,
        state.availableProfiles);
      var link = profileDisp.querySelector('a');
      link.id = 'js-profile-' + profileCount;
      link.addEventListener('click', function() {
        $script.ready('om-main', function() {
          OmegaPopup.applyProfile(profile.name);
        });
      });

      if (profile.name === state.currentProfileName) {
        profileDisp.classList.add(currentProfileClass);
      }

      profilesContainer.insertBefore(profileDisp, profilesEnd);
    });
    profilesContainer.querySelectorAll('.om-nav-item > a').forEach(function(link) {
      if (link.querySelector('.om-profile-name')) {
        link.setAttribute('aria-pressed', link.parentElement.classList.contains('om-active') ? 'true' : 'false');
      }
    });
  }

  function createMenuItemForProfile(profile, profiles) {
    var profileDisp = profileTemplate.cloneNode(true);
    var text = displayName(profile);
    profileDisp.querySelector('.om-profile-name').textContent = text;

    profileDisp.setAttribute('title', profile.desc || profile.name || '');
    var icon = profileDisp.querySelector('.glyphicon');
    icon.setAttribute('class', 'glyphicon ' + iconForProfileType[profile.profileType]);
    icon.style.color = profile.color;
    return profileDisp;
  }

})();
