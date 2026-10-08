(function() {
  var module, subdomainLevel = 0,
    __hasProp = {}.hasOwnProperty;

  module = angular.module('omegaPopup', ['omegaTarget', 'omegaDecoration', 'ui.bootstrap', 'ui.validate']);

  module.filter('tr', function(omegaTarget) {
    return omegaTarget.getMessage;
  });

  module.filter('dispName', function(omegaTarget) {
    return function(name) {
      if (typeof name === 'object') {
        if (name.displayName) return name.displayName;
        name = name.name;
      }
      return omegaTarget.getMessage('profile_' + name) || name;
    };
  });

  module.controller('PopupCtrl', function($scope, $window, $q, omegaTarget, profileIcons, profileOrder, dispNameFilter) {
    var generateConditionSuggestion, preselectedProfileNameForCondition, refresh, refreshOnProfileChange;
    $scope.closePopup = function() {
      return $window.top.close();
    };
    $scope.openManage = function() {
      omegaTarget.openManage();
      return $window.top.close();
    };
    refreshOnProfileChange = false;
    refresh = function() {
      if (refreshOnProfileChange) {
        return omegaTarget.refreshActivePage().then(function() {
          return $window.top.close();
        });
      } else {
        return $window.top.close();
      }
    };
    $scope.profileIcons = profileIcons;
    $scope.dispNameFilter = dispNameFilter;
    $scope.isActive = function(profileName) {
      if ($scope.isSystemProfile) {
        return profileName === 'system';
      } else {
        return $scope.currentProfileName === profileName;
      }
    };
    $scope.isEffective = function(profileName) {
      return $scope.isSystemProfile && $scope.currentProfileName === profileName;
    };
    $scope.getIcon = function(profile, normal) {
      if (!profile) {
        return;
      }
      if (!normal && $scope.isEffective(profile.name)) {
        return 'glyphicon-ok';
      } else {
        return void 0;
      }
    };
    $scope.getProfileTitle = function(profile) {
      return profile ? (profile.desc || profile.name || '') : '';
    };
    $scope.openOptions = function(hash) {
      return omegaTarget.openOptions(hash).then(function() {
        return $window.top.close();
      });
    };
    $scope.applyProfile = function(profile) {
      var next;
      next = function() {
        if (profile.profileType === 'SwitchProfile') {
          return omegaTarget.state('web.switchGuide').then(function(switchGuide) {
            if (switchGuide === 'showOnFirstUse') {
              return $scope.openOptions("#!/profile/" + profile.name);
            }
          });
        }
      };
      $scope.applyError = null;
      return omegaTarget.applyProfile(profile.name).then(function() {
        return refreshOnProfileChange ? omegaTarget.refreshActivePage() : null;
      }).then(next).then(function() {
        return $window.top.close();
      }, function(error) {
        $scope.applyError = { message: error.message || '模式切换失败，请重试。', profileName: error.original && error.original.profileName || profile.name, configurable: error.name === 'ProxyConfigurationError' };
      });
    };

    $scope.nameExternal = {
      open: false
    };
    $scope.addCondition = function(condition, profileName) {
      return omegaTarget.addCondition(condition, profileName).then(function() {
        omegaTarget.state('lastProfileNameForCondition', profileName);
        return refresh();
      });
    };
    $scope.validateProfileName = {
      conflict: '!$value || !availableProfiles["+" + $value]',
      hidden: '!$value || $value[0] != "_"'
    };
    $scope.saveExternal = function() {
      var name, _ref;
      $scope.nameExternal.open = false;
      name = (_ref = $scope.externalProfile) != null ? _ref.name : void 0;
      if (name) {
        return omegaTarget.addProfile($scope.externalProfile).then(function() {
          return omegaTarget.applyProfile(name).then(function() {
            return refresh();
          });
        });
      }
    };
    $scope.returnToMenu = function() {
      if (location.hash.indexOf('!') >= 0) {
        location.href = 'popup/index.html';
        return;
      }
      $scope.showConditionForm = false;
    };
    preselectedProfileNameForCondition = 'direct';
    if ($window.location.hash === '#!external') {
      $scope.nameExternal = {
        open: true
      };
    }
    omegaTarget.state(['availableProfiles', 'currentProfileName', 'isSystemProfile', 'validResultProfiles', 'refreshOnProfileChange', 'externalProfile', 'proxyNotControllable', 'lastProfileNameForCondition']).then(function(_arg) {
      var availableProfiles, charCodeUnderscore, currentProfileName, externalProfile, isSystemProfile, key, lastProfileNameForCondition, profile, profilesByNames, proxyNotControllable, refresh, validResultProfiles, _j, _len, _ref;
      availableProfiles = _arg[0], currentProfileName = _arg[1], isSystemProfile = _arg[2], validResultProfiles = _arg[3], refresh = _arg[4], externalProfile = _arg[5], proxyNotControllable = _arg[6], lastProfileNameForCondition = _arg[7];
      $scope.proxyNotControllable = proxyNotControllable;
      if (proxyNotControllable) {
        return;
      }
      $scope.availableProfiles = availableProfiles;
      $scope.currentProfile = availableProfiles['+' + currentProfileName];
      $scope.currentProfileName = currentProfileName;
      $scope.isSystemProfile = isSystemProfile;
      $scope.externalProfile = externalProfile;
      refreshOnProfileChange = refresh;
      charCodeUnderscore = '_'.charCodeAt(0);
      profilesByNames = function(names) {
        var name, profiles, shown, _j, _len;
        profiles = [];
        for (_j = 0, _len = names.length; _j < _len; _j++) {
          name = names[_j];
          shown = name.charCodeAt(0) !== charCodeUnderscore || name.charCodeAt(1) !== charCodeUnderscore;
          if (shown) {
            profiles.push(availableProfiles['+' + name]);
          }
        }
        return profiles;
      };
      $scope.validResultProfiles = profilesByNames(validResultProfiles);
      if (lastProfileNameForCondition) {
        _ref = $scope.validResultProfiles;
        for (_j = 0, _len = _ref.length; _j < _len; _j++) {
          profile = _ref[_j];
          if (profile.name === lastProfileNameForCondition) {
            preselectedProfileNameForCondition = lastProfileNameForCondition;
          }
        }
      }
      $scope.builtinProfiles = [];
      $scope.customProfiles = [];
      for (key in availableProfiles) {
        if (!__hasProp.call(availableProfiles, key)) continue;
        profile = availableProfiles[key];
        if (profile.builtin) {
          // Direct profile hidden from the menu
          if (profile.name === 'direct') continue;
          $scope.builtinProfiles.push(profile);
        } else if (profile.name.charCodeAt(0) !== charCodeUnderscore) {
          $scope.customProfiles.push(profile);
        }
      }
      return $scope.customProfiles.sort(profileOrder);
    });
    $q.all([omegaTarget.state('currentProfileCanAddRule'), omegaTarget.getActivePageInfo()]).then(function(_arg) {
      var canAddRule, info;
      canAddRule = _arg[0], info = _arg[1];
      $scope.currentProfileCanAddRule = canAddRule;
      if (info) {
        $scope.currentDomain = info.domain;
        $scope.subdomain = info.subdomain;
        if ($window.location.hash === '#!addRule') {
          return $scope.prepareConditionForm();
        }
      }
    });
    generateConditionSuggestion = function() {
      var conditionSuggestion, currentDomain, currentDomainEscaped, domainLooksLikeIp, subdomain, subdomains;
      currentDomain = $scope.currentDomain;
      subdomain = $scope.subdomain;
      currentDomainEscaped = currentDomain.replace(/\./g, '\\.');
      domainLooksLikeIp = false;
      if (currentDomain.indexOf(':') >= 0) {
        domainLooksLikeIp = true;
        if (currentDomain[0] !== '[') {
          currentDomain = '[' + currentDomain + ']';
          currentDomainEscaped = currentDomain.replace(/\./g, '\\.').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
        }
      } else if (currentDomain[currentDomain.length - 1] >= 0) {
        domainLooksLikeIp = true;
      }
      if (domainLooksLikeIp) {
        conditionSuggestion = {
          'HostWildcardCondition': currentDomain,
          'HostRegexCondition': '^' + currentDomainEscaped + '$',
          'UrlWildcardCondition': '*://' + currentDomain + '/*',
          'UrlRegexCondition': '://' + currentDomainEscaped + '(:\\d+)?/',
          'KeywordCondition': currentDomain
        };
      } else {
        if (subdomain) {
          subdomains = subdomain.split('.');
          subdomainLevel = subdomainLevel % (subdomains.length + 1);
          if (subdomainLevel > 0) {
            subdomains = subdomains.splice(subdomainLevel - 1);
            subdomains.push(currentDomain);
            currentDomain = subdomains.join('.');
            currentDomainEscaped = currentDomain.replace(/\./g, '\\.');
          }
        }
        conditionSuggestion = {
          'HostWildcardCondition': '*.' + currentDomain,
          'HostRegexCondition': '(^|\\.)' + currentDomainEscaped + '$',
          'UrlWildcardCondition': '*://*.' + currentDomain + '/*',
          'UrlRegexCondition': '://([^/.]+\\.)*' + currentDomainEscaped + '(:\\d+)?/',
          'KeywordCondition': currentDomain
        };
      }
      return conditionSuggestion;
    };
    return $scope.prepareConditionForm = function() {
      var conditionSuggestion;
      conditionSuggestion = generateConditionSuggestion();
      $scope.rule = {
        condition: {
          conditionType: 'HostWildcardCondition',
          pattern: conditionSuggestion['HostWildcardCondition']
        },
        profileName: preselectedProfileNameForCondition
      };
      $scope.$watch('rule.condition.conditionType', function(type) {
        return $scope.rule.condition.pattern = conditionSuggestion[type];
      });
      $scope.toggleSubDomainLevel = function(domain) {
        domain = domain || $scope.currentDomain;
        if ($window.location.hash === '#!addRule') {
          subdomainLevel++;
          conditionSuggestion = generateConditionSuggestion();
          return $scope.rule.condition.pattern = conditionSuggestion[$scope.rule.condition.conditionType];
        }
      };
      return $scope.showConditionForm = true;
    };
  });

}).call(this);
