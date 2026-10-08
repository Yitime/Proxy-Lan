(function() {
  var attachedPrefix, charCodeUnderscore, colors, isNavigationCancelled, profileColorPalette, profileColors;

  angular.module('omega').constant('builtinProfiles', OmegaPac.Profiles.builtinProfiles);

  profileColors = ['#9ce', '#9d9', '#fa8', '#fe9', '#d497ee', '#47b', '#5b5', '#d63', '#ca0'];

  colors = [].concat(profileColors);

  profileColorPalette = ((function() {
    var _results;
    _results = [];
    while (colors.length) {
      _results.push(colors.splice(0, 3));
    }
    return _results;
  })());

  angular.module('omega').constant('profileColors', profileColors);

  angular.module('omega').constant('profileColorPalette', profileColorPalette);

  attachedPrefix = '__ruleListOf_';

  angular.module('omega').constant('getAttachedName', function(name) {
    return attachedPrefix + name;
  });

  angular.module('omega').constant('defaultRuleListSettings', {
    format: 'AutoProxy',
    sourceUrl: 'https://raw.githubusercontent.com/gfwlist/gfwlist/master/gfwlist.txt'
  });

  angular.module('omega').constant('getParentName', function(name) {
    if (name.indexOf(attachedPrefix) === 0) {
      return name.substr(attachedPrefix.length);
    } else {
      return void 0;
    }
  });

  charCodeUnderscore = '_'.charCodeAt(0);

  angular.module('omega').constant('charCodeUnderscore', charCodeUnderscore);

  angular.module('omega').constant('isProfileNameHidden', function(name) {
    return name.charCodeAt(0) === charCodeUnderscore;
  });

  angular.module('omega').constant('isProfileNameReserved', function(name) {
    return name.charCodeAt(0) === charCodeUnderscore && name.charCodeAt(1) === charCodeUnderscore;
  });

  angular.module('omega').config(function($stateProvider, $urlRouterProvider, $httpProvider, $animateProvider, $compileProvider) {
    $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|chrome-extension|moz-extension):/);
    $compileProvider.imgSrcSanitizationWhitelist(/^\s*(https?|local|data|chrome-extension|moz-extension):/);
    $animateProvider.classNameFilter(/angular-animate/);
    $urlRouterProvider.otherwise(function($injector, $location) {
      if ($location.path() === '') {
        return $injector.get('omegaTarget').lastUrl() || '/io';
      } else {
        return '/io';
      }
    });
    return $stateProvider.state('ui', {
      url: '/ui',
      templateUrl: 'partials/ui.html'
    }).state('io', {
      url: '/io',
      templateUrl: 'partials/io.html',
      controller: 'IoCtrl'
    }).state('builtin', {
      url: '/builtin/:name',
      templateUrl: 'partials/builtin.html',
      controller: 'BuiltinCtrl'
    }).state('profile', {
      url: '/profile/*name',
      templateUrl: 'partials/profile.html',
      controller: 'ProfileCtrl'
    });
  });

  isNavigationCancelled = function(error) {
    return error && (error.message === 'transition superseded' ||
      error.message === 'transition aborted' || error.message === 'transition prevented');
  };

  angular.module('omega').factory('$exceptionHandler', function($log) {
    return function(exception, cause) {
      if (exception == null) exception = new Error('Unknown options-page error');
      if (isNavigationCancelled(exception)) {
        return;
      }
      if (exception.message === 'transition failed') {
        return;
      }
      return $log.error(exception, cause);
    };
  });

  angular.module('omega').factory('omegaDialog', function($modal, $q) {
    return {
      open: function(options) {
        var dialog = $modal.open(options);
        dialog.result = dialog.result.then(null, function(reason) {
          if (reason == null || reason === 'cancel' || reason === 'backdrop click' || reason === 'escape key press') {
            return $q.reject({ name: 'DialogDismissed', reason: reason });
          }
          return $q.reject(reason);
        });
        // Template failures are reported through result, rather than twice through opened.
        if (dialog.opened) dialog.opened.then(null, function() {});
        return dialog;
      }
    };
  });

  angular.module('omega').factory('omegaAction', function($q, $rootScope) {
    return function(result) {
      return $q.when(result).then(null, function(error) {
        if ((error && error.name === 'DialogDismissed') || error === 'form_invalid' || isNavigationCancelled(error)) return;
        console.error('Options action failed', error);
        return $rootScope.showAlert({
          type: 'error',
          message: error && error.message ? error.message : '操作失败，请重新加载后重试。'
        });
      });
    };
  });

  angular.module('omega').factory('omegaDebug', function($window) {
    return $window.OmegaDebug;
  });

  angular.module('omega').factory('downloadFile', function() {
    return function(blob, filename) {
      var noAutoBom;
      noAutoBom = true;
      return saveAs(blob, filename, noAutoBom);
    };
  });

}).call(this);

(function() {
  angular.module('omega').controller('BuiltinCtrl', function($scope, $stateParams, $rootScope, omegaTarget, trFilter) {
    var name = $stateParams.name === 'direct' ? 'direct' : 'system';
    var key = '+' + name;
    var defaultName = trFilter('profile_' + name);
    function refresh(options) {
      $scope.builtinProfile = angular.copy(OmegaPac.Profiles.byName(name, options));
      $scope.builtinProfile.displayName = $scope.builtinProfile.displayName || defaultName;
    }
    refresh($rootScope.options);
    omegaTarget.addOptionsChangeCallback(refresh);
    $scope.isSystem = function() { return name === 'system'; };
    function saveMetadata() {
      var metadata = angular.copy($rootScope.options['-builtinProfiles'] || {});
      var profile = angular.copy($scope.builtinProfile);
      profile.name = name;
      profile.displayName = (profile.displayName || '').trim();
      if (profile.displayName === defaultName) delete profile.displayName;
      metadata[key] = profile;
      $rootScope.options['-builtinProfiles'] = metadata;
      var displayed = name === 'system' ? $rootScope.systemProfile : $rootScope.directProfile;
      if (displayed) {
        displayed.color = profile.color;
        displayed.displayName = profile.displayName;
      }
    }
    $scope.updateBuiltinName = function() {
      if (($scope.builtinProfile.displayName || '').trim()) saveMetadata();
    };
    $scope.updateBuiltinColor = saveMetadata;
    $scope.resetBuiltinName = function() {
      $scope.builtinProfile.displayName = defaultName;
      saveMetadata();
    };
  });

}).call(this);

(function() {
  angular.module('omega').controller('FixedProfileCtrl', function($scope, omegaDialog, trFilter) {
    var defaultLabel, defaultPort, onBypassListChange, onProxyChange, proxyProperties, scheme, socks5AuthSupported, _fn, _i, _j, _len, _len1, _ref, _ref1, _ref2;
    $scope.urlSchemes = ['', 'http', 'https', 'ftp'];
    $scope.urlSchemeDefault = 'fallbackProxy';
    proxyProperties = {
      '': 'fallbackProxy',
      'http': 'proxyForHttp',
      'https': 'proxyForHttps',
      'ftp': 'proxyForFtp'
    };
    $scope.schemeDisp = {
      '': null,
      'http': 'http://',
      'https': 'https://',
      'ftp': 'ftp://'
    };
    defaultPort = {
      'http': 80,
      'https': 443,
      'socks4': 1080,
      'socks5': 1080
    };
    $scope.showAdvanced = false;
    $scope.optionsForScheme = {};
    _ref = $scope.urlSchemes;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      scheme = _ref[_i];
      defaultLabel = scheme ? trFilter('options_protocol_useDefault') : trFilter('options_protocol_direct');
      $scope.optionsForScheme[scheme] = [
        {
          label: defaultLabel,
          value: void 0
        }, {
          label: 'HTTP',
          value: 'http'
        }, {
          label: 'HTTPS',
          value: 'https'
        }, {
          label: 'SOCKS4',
          value: 'socks4'
        }, {
          label: 'SOCKS5',
          value: 'socks5'
        }
      ];
    }
    $scope.proxyEditors = {};
    $scope.validProxyHost = OmegaPac.Profiles.proxyHostValid;
    $scope.validProxyPort = OmegaPac.Profiles.proxyPortValid;
    $scope.proxyNotConfigured = function() {
      return !$scope.urlSchemes.some(function(scheme) { return !!($scope.proxyEditors[scheme] && $scope.proxyEditors[scheme].scheme); });
    };
    socks5AuthSupported = ((typeof browser !== "undefined" && browser !== null ? (_ref1 = browser.proxy) != null ? _ref1.onRequest : void 0 : void 0) != null);
    $scope.authSupported = {
      "http": true,
      "https": true,
      "socks5": socks5AuthSupported
    };
    $scope.isProxyAuthActive = function(scheme) {
      var _ref2;
      return ((_ref2 = $scope.profile.auth) != null ? _ref2[proxyProperties[scheme]] : void 0) != null;
    };
    $scope.editProxyAuth = function(scheme) {
      var auth, prop, proxy, scope, _ref2;
      prop = proxyProperties[scheme];
      proxy = $scope.profile[prop];
      scope = $scope.$new('isolate');
      scope.proxy = proxy;
      auth = (_ref2 = $scope.profile.auth) != null ? _ref2[prop] : void 0;
      scope.auth = auth && angular.copy(auth);
      scope.authSupported = $scope.authSupported[proxy.scheme];
      scope.protocolDisp = proxy.scheme;
      return omegaDialog.open({
        templateUrl: 'partials/fixed_auth_edit.html',
        scope: scope,
        size: scope.authSupported ? 'sm' : 'lg'
      }).result.then(function(auth) {
        var _base;
        if (!(auth != null ? auth.username : void 0)) {
          if ($scope.profile.auth) {
            return $scope.profile.auth[prop] = void 0;
          }
        } else {
          if ((_base = $scope.profile).auth == null) {
            _base.auth = {};
          }
          return $scope.profile.auth[prop] = auth;
        }
      });
    };
    onProxyChange = function(proxyEditors, oldProxyEditors) {
      var proxy, _base, _j, _len1, _name, _ref2, _ref3, _results;
      if (!proxyEditors) {
        return;
      }
      _ref2 = $scope.urlSchemes;
      _results = [];
      for (_j = 0, _len1 = _ref2.length; _j < _len1; _j++) {
        scheme = _ref2[_j];
        proxy = proxyEditors[scheme];
        if (!proxy.scheme) {
          if (!scheme) {
            proxyEditors[scheme] = {};
          }
          delete $scope.profile[proxyProperties[scheme]];
          continue;
        } else if (!oldProxyEditors[scheme].scheme) {
          if (proxy.scheme === proxyEditors[''].scheme) {
            if (proxy.port == null) {
              proxy.port = proxyEditors[''].port;
            }
          }
          if (proxy.port == null) {
            proxy.port = defaultPort[proxy.scheme];
          }
          if (proxy.host == null) {
            proxy.host = (_ref3 = proxyEditors[''].host) != null ? _ref3 : '';
          }
        }
        if (typeof proxy.host === 'string') proxy.host = proxy.host.trim();
        if ($scope.validProxyHost(proxy.host) && $scope.validProxyPort(proxy.port)) delete $scope.profile.needsConfiguration;
        _results.push((_base = $scope.profile)[_name = proxyProperties[scheme]] != null ? _base[_name] : _base[_name] = proxy);
      }
      return _results;
    };
    _ref2 = $scope.urlSchemes;
    _fn = function(scheme) {
      return $scope.$watch((function() {
        return $scope.profile[proxyProperties[scheme]];
      }), function(proxy) {
        if (scheme && proxy) {
          $scope.showAdvanced = true;
        }
        return $scope.proxyEditors[scheme] = proxy != null ? proxy : {};
      });
    };
    for (_j = 0, _len1 = _ref2.length; _j < _len1; _j++) {
      scheme = _ref2[_j];
      _fn(scheme);
    }
    $scope.$watch('proxyEditors', onProxyChange, true);
    onBypassListChange = function(list) {
      var item;
      return $scope.bypassList = ((function() {
        var _k, _len2, _results;
        _results = [];
        for (_k = 0, _len2 = list.length; _k < _len2; _k++) {
          item = list[_k];
          _results.push(item.pattern);
        }
        return _results;
      })()).join('\n');
    };
    $scope.$watch('profile.bypassList', onBypassListChange, true);
    return $scope.$watch('bypassList', function(bypassList, oldList) {
      var entry;
      if ((bypassList == null) || bypassList === oldList) {
        return;
      }
      return $scope.profile.bypassList = (function() {
        var _k, _len2, _ref3, _results;
        _ref3 = bypassList.split(/\r?\n/);
        _results = [];
        for (_k = 0, _len2 = _ref3.length; _k < _len2; _k++) {
          entry = _ref3[_k];
          if (entry) {
            _results.push({
              conditionType: "BypassCondition",
              pattern: entry
            });
          }
        }
        return _results;
      })();
    });
  });

}).call(this);

(function() {
  angular.module('omega').controller('IoCtrl', function($scope, $rootScope, downloadFile) {
    $scope.exportOptions = function() {
      return $rootScope.applyOptionsConfirm().then(function() {
        var blob, content, filename, plainOptions;
        plainOptions = angular.fromJson(angular.toJson($rootScope.options));
        content = JSON.stringify(plainOptions, null, 2);
        blob = new Blob([content], {
          type: "application/json;charset=utf-8"
        });
        filename = "Proxy-Lan-options-" + (new Date().toISOString().slice(0, 19).replaceAll(':', '-')) + ".json";
        return downloadFile(blob, filename);
      });
    };
    $scope.importSuccess = function() {
      return $rootScope.showAlert({
        type: 'success',
        i18n: 'options_importSuccess',
        message: 'Options imported.'
      });
    };
    $scope.restoreLocal = function(content) {
      $scope.restoringLocal = true;
      try {
        var parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Backup must contain a JSON object');
        }
      } catch (error) {
        $scope.restoringLocal = false;
        return $scope.restoreLocalError(error);
      }
      return $rootScope.resetOptions(content).then((function() {
        return $scope.importSuccess();
      }), function(error) {
        return $scope.restoreLocalError(error);
      })["finally"](function() {
        return $scope.restoringLocal = false;
      });
    };
    $scope.restoreLocalError = function(error) {
      console.error('Unable to import options backup', error);
      return $rootScope.showAlert({
        type: 'error',
        i18n: 'options_importFormatError',
        message: error && error.message ? error.message : 'Invalid backup file!'
      });
    };
    $scope.triggerFileInput = function() {
      angular.element('#restore-local-file').click();
    };
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty;

  angular.module('omega').controller('MasterCtrl', function($scope, $rootScope, $window, $q, omegaDialog, $state, profileColors, profileIcons, omegaTarget, $timeout, $location, $filter, getAttachedName, isProfileNameReserved, isProfileNameHidden, dispNameFilter, omegaDebug, omegaAction) {
    var checkFormValid, diff, key, onOptionChange, tr, type, _ref, _ref1, _ref2;
    tr = $filter('tr');
    $rootScope.runAction = omegaAction;
    $rootScope.options = null;
    omegaTarget.addOptionsChangeCallback(function(newOptions) {
      $rootScope.options = angular.copy(newOptions);
      $rootScope.optionsOld = angular.copy(newOptions);
      return $timeout(function() {
        $rootScope.optionsDirty = false;
      });
    });
    $rootScope.revertOptions = function() {
      if ($rootScope.optionsDirty) {
        return $window.location.reload();
      }
    };
    diff = jsondiffpatch.create({
      objectHash: function(obj) {
        return JSON.stringify(obj);
      },
      textDiff: {
        minLength: 1 / 0
      }
    });
    $rootScope.showAlert = function(alert) {
      return $timeout(function() {
        $scope.alert = alert;
        $scope.alertShown = true;
        $scope.alertShownAt = Date.now();
        $timeout($rootScope.hideAlert, 3000);
      });
    };
    $rootScope.hideAlert = function() {
      return $timeout(function() {
        if (Date.now() - $scope.alertShownAt >= 1000) {
          return $scope.alertShown = false;
        }
      });
    };
    checkFormValid = function() {
      var fields;
      fields = angular.element('.ng-invalid');
      if (fields.length > 0) {
        var input = angular.element('input.ng-invalid, select.ng-invalid, textarea.ng-invalid')[0];
        if (input) input.focus();
        $rootScope.showAlert({
          type: 'error',
          i18n: 'options_formInvalid'
        });
        return false;
      }
      return true;
    };
    $rootScope.applyOptions = function() {
      var patch, plainOptions;
      if (!$rootScope.optionsDirty) {
        return;
      }
      if (!checkFormValid()) {
        return;
      }
      if ($rootScope.$broadcast('omegaApplyOptions').defaultPrevented) {
        return;
      }
      plainOptions = angular.fromJson(angular.toJson($rootScope.options));
      patch = diff.diff($rootScope.optionsOld, plainOptions);
      return omegaTarget.optionsPatch(patch).then(function() {
        return $rootScope.showAlert({
          type: 'success',
          i18n: 'options_saveSuccess'
        });
      });
    };
    $rootScope.resetOptions = function(options) {
      return omegaTarget.resetOptions(options).then(function() {
        return $rootScope.showAlert({
          type: 'success',
          i18n: 'options_resetSuccess'
        });
      })["catch"](function(err) {
        $rootScope.showAlert({
          type: 'error',
          message: err
        });
        return $q.reject(err);
      });
    };
    $rootScope.profileByName = function(name) {
      return OmegaPac.Profiles.byName(name, $rootScope.options);
    };
    $rootScope.systemProfile = $rootScope.profileByName('system');
    $rootScope.directProfile = $rootScope.profileByName('direct');
    $scope.showResetOptionsModal = function() {
      if ($scope.optionsReseting) return;
      return omegaDialog.open({
        templateUrl: 'partials/reset_options_confirm.html'
      }).result.then(function() {
        $scope.optionsReseting = true;
        return Promise.resolve(omegaDebug.resetOptions()).then(function() {
          return $scope.optionsReseting = false;
        }, function(error) {
          console.error('Unable to reset options', error);
          $scope.optionsReseting = false;
          return $rootScope.showAlert({
            type: 'error',
            i18n: 'options_resetOptions',
            message: error && error.message ? error.message : 'Unable to reset options'
          });
        });
      });
    };
    $rootScope.externalProfile = {
      color: '#49afcd',
      name: tr('popup_externalProfile'),
      profileType: 'FixedProfile',
      fallbackProxy: {
        host: "127.0.0.1",
        port: 42,
        scheme: "http"
      }
    };
    $rootScope.applyOptionsConfirm = function() {
      if (!checkFormValid()) {
        return $q.reject('form_invalid');
      }
      if (!$rootScope.optionsDirty) {
        return $q.when(true);
      }
      return omegaDialog.open({
        templateUrl: 'partials/apply_options_confirm.html'
      }).result.then(function() {
        return $rootScope.applyOptions();
      });
    };
    $rootScope.newProfile = function() {
      var scope;
      scope = $rootScope.$new('isolate');
      scope.options = $rootScope.options;
      scope.isProfileNameReserved = isProfileNameReserved;
      scope.isProfileNameHidden = isProfileNameHidden;
      scope.profileByName = $rootScope.profileByName;
      scope.validateProfileName = {
        conflict: '!$value || !profileByName($value)',
        reserved: '!$value || !isProfileNameReserved($value)'
      };
      scope.profileIcons = profileIcons;
      scope.dispNameFilter = dispNameFilter;
      scope.options = $scope.options;
        return omegaDialog.open({
        templateUrl: 'partials/new_profile.html',
        scope: scope
      }).result.then(function(profile) {
        var choice;
        profile = OmegaPac.Profiles.create(profile);
        if (profile.profileType === 'FixedProfile') profile.needsConfiguration = true;
        choice = Math.floor(Math.random() * profileColors.length);
        if (profile.color == null) {
          profile.color = profileColors[choice];
        }
        OmegaPac.Profiles.updateRevision(profile);
        $rootScope.options[OmegaPac.Profiles.nameAsKey(profile)] = profile;
        return $state.go('profile', {
          name: profile.name
        });
      });
    };
    $rootScope.replaceProfile = function(fromName, toName) {
      return $rootScope.applyOptionsConfirm().then(function() {
        var scope;
        scope = $rootScope.$new('isolate');
        scope.options = $rootScope.options;
        scope.fromName = fromName;
        scope.toName = toName;
        scope.profileByName = $rootScope.profileByName;
        scope.dispNameFilter = dispNameFilter;
        scope.options = $scope.options;
        scope.profileSelect = function(model) {
          return "<div omega-profile-select=\"options | profiles:profile\"\n  ng-model=\"" + model + "\" options=\"options\"\n  disp-name=\"dispNameFilter\" style=\"display: inline-block;\">\n</div>";
        };
        return omegaDialog.open({
          templateUrl: 'partials/replace_profile.html',
          scope: scope
        }).result.then(function(_arg) {
          var fromName, toName;
          fromName = _arg.fromName, toName = _arg.toName;
          return omegaTarget.replaceRef(fromName, toName).then(function() {
            return $rootScope.showAlert({
              type: 'success',
              i18n: 'options_replaceProfileSuccess'
            });
          })["catch"](function(err) {
            return $rootScope.showAlert({
              type: 'error',
              message: err
            });
          });
        });
      });
    };
    $rootScope.renameProfile = function(fromName) {
      return $rootScope.applyOptionsConfirm().then(function() {
        var profile, scope;
        profile = $rootScope.profileByName(fromName);
        scope = $rootScope.$new('isolate');
        scope.options = $rootScope.options;
        scope.fromName = fromName;
        scope.isProfileNameReserved = isProfileNameReserved;
        scope.isProfileNameHidden = isProfileNameHidden;
        scope.profileByName = $rootScope.profileByName;
        scope.validateProfileName = {
          conflict: '!$value || $value == fromName || !profileByName($value)',
          reserved: '!$value || !isProfileNameReserved($value)'
        };
        scope.dispNameFilter = $scope.dispNameFilter;
        scope.options = $scope.options;
        return omegaDialog.open({
          templateUrl: 'partials/rename_profile.html',
          scope: scope
        }).result.then(function(toName) {
          var attachedName, defaultProfileName, rename, toAttachedName;
          if (toName !== fromName) {
            rename = omegaTarget.renameProfile(fromName, toName);
            attachedName = getAttachedName(fromName);
            if ($rootScope.profileByName(attachedName)) {
              toAttachedName = getAttachedName(toName);
              defaultProfileName = void 0;
              if ($rootScope.profileByName(toAttachedName)) {
                defaultProfileName = profile.defaultProfileName;
                rename = rename.then(function() {
                  var toAttachedKey;
                  toAttachedKey = OmegaPac.Profiles.nameAsKey(toAttachedName);
                  profile = $rootScope.profileByName(toName);
                  profile.defaultProfileName = 'direct';
                  OmegaPac.Profiles.updateRevision(profile);
                  delete $rootScope.options[toAttachedKey];
                  return $rootScope.applyOptions();
                });
              }
              rename = rename.then(function() {
                return omegaTarget.renameProfile(attachedName, toAttachedName);
              });
              if (defaultProfileName) {
                rename = rename.then(function() {
                  profile = $rootScope.profileByName(toName);
                  profile.defaultProfileName = defaultProfileName;
                  return $rootScope.applyOptions();
                });
              }
            }
            return rename.then(function() {
              return $state.go('profile', {
                name: toName
              });
            })["catch"](function(err) {
              return $rootScope.runAction($q.reject(err));
            });
          }
        });
      });
    };
    $scope.updatingProfile = {};
    $scope.ruleListUpdateState = {};
    $rootScope.updateProfile = function(name) {
      return $rootScope.applyOptionsConfirm().then(function() {
        if (name != null) {
          $scope.updatingProfile[name] = true;
          $scope.ruleListUpdateState[name] = { sourceUrl: $scope.options['+' + name].sourceUrl, error: '' };
        } else {
          OmegaPac.Profiles.each($scope.options, function(key, profile) {
            if (!profile.builtin) {
              return $scope.updatingProfile[profile.name] = true;
            }
          });
        }
        return omegaTarget.updateProfile(name, 'bypass_cache').then(function(results) {
          var error, profileName, result, singleErr, success;
          success = 0;
          error = 0;
          for (profileName in results) {
            if (!__hasProp.call(results, profileName)) continue;
            result = results[profileName];
            if (result instanceof Error) {
              error++;
            } else {
              success++;
            }
          }
          if (error === 0) {
            return $rootScope.showAlert({
              type: 'success',
              i18n: 'options_profileDownloadSuccess'
            });
          } else {
            if (error === 1) {
              singleErr = results[OmegaPac.Profiles.nameAsKey(name)];
              if (singleErr) {
                return $q.reject(singleErr);
              }
            }
            return $q.reject(results);
          }
        })["catch"](function(err) {
          var message, _ref2, _ref3, _ref4;
          message = tr('options_profileDownloadError_' + err.name, [(_ref2 = (_ref3 = err.statusCode) != null ? _ref3 : (_ref4 = err.original) != null ? _ref4.statusCode : void 0) != null ? _ref2 : '']);
          if (message) {
            if (name != null) $scope.ruleListUpdateState[name].error = message;
            return $rootScope.showAlert({
              type: 'error',
              message: message
            });
          } else {
            if (name != null) $scope.ruleListUpdateState[name].error = tr('options_profileDownloadError') + (err.message ? '：' + err.message : '');
            return $rootScope.showAlert({
              type: 'error',
              i18n: 'options_profileDownloadError'
            });
          }
        })["finally"](function() {
          if (name != null) {
            return $scope.updatingProfile[name] = false;
          } else {
            return $scope.updatingProfile = {};
          }
        });
      });
    };
    onOptionChange = function(options, oldOptions) {
      if (options === oldOptions || (oldOptions == null)) {
        return;
      }
      return $rootScope.optionsDirty = true;
    };
    $rootScope.$watch('options', onOptionChange, true);
    $rootScope.$on('$stateChangeStart', function(event, _, __, fromState) {
      if (!checkFormValid()) {
        return event.preventDefault();
      }
    });
    $rootScope.$on('$stateChangeSuccess', function() {
      return omegaTarget.lastUrl($location.url());
    });
    $window.onbeforeunload = function() {
      if ($rootScope.optionsDirty) {
        return tr('options_optionsNotSaved');
      } else {
        return null;
      }
    };
    document.addEventListener('click', (function() {
      return $rootScope.hideAlert();
    }), false);
    $scope.profileIcons = profileIcons;
    $scope.dispNameFilter = dispNameFilter;
    _ref2 = OmegaPac.Profiles.formatByType;
    for (type in _ref2) {
      if (!__hasProp.call(_ref2, type)) continue;
      $scope.profileIcons[type] = $scope.profileIcons['RuleListProfile'];
    }
    $scope.alertIcons = {
      'success': 'glyphicon-ok',
      'warning': 'glyphicon-warning-sign',
      'error': 'glyphicon-remove',
      'danger': 'glyphicon-danger'
    };
    $scope.alertClassForType = function(type) {
      if (!type) {
        return '';
      }
      if (type === 'error') {
        type = 'danger';
      }
      return 'alert-' + type;
    };
    return omegaTarget.refresh().then(function() {
      var loadingEl = document.getElementById('app-loading');
      var shellEl = document.getElementById('app-shell');
      if (loadingEl) loadingEl.hidden = true;
      if (shellEl) shellEl.hidden = false;
      document.body.classList.add('app-ready');
    })["catch"](function(error) {
      var loadingEl = document.getElementById('app-loading');
      var errorEl = document.getElementById('app-error');
      var detailEl = document.getElementById('app-error-detail');
      if (loadingEl) loadingEl.hidden = true;
      if (errorEl) errorEl.hidden = false;
      if (detailEl && error) {
        detailEl.hidden = false;
        detailEl.textContent = error.stack || error.message || String(error);
      }
      console.error('Unable to load options', error);
    });
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty;

  angular.module('omega').controller('ProfileCtrl', function($scope, $stateParams, $location, $rootScope, $timeout, $state, omegaDialog, profileColorPalette, getAttachedName, getParentName) {
    var name, profileTemplates, unwatch;
    name = $stateParams.name;
    profileTemplates = {
      'FixedProfile': 'profile_fixed.html',
      'SwitchProfile': 'profile_switch.html',
      'RuleListProfile': 'profile_rule_list.html'
    };
    $scope.deleteProfile = function() {
      var key, parent, pname, profileName, refProfiles, refSet, refs, scope;
      profileName = $scope.profile.name;
      refs = OmegaPac.Profiles.referencedBySet(profileName, $rootScope.options);
      scope = $rootScope.$new('isolate');
      scope.profile = $scope.profile;
      scope.dispNameFilter = $scope.dispNameFilter;
      scope.options = $scope.options;
      if (Object.keys(refs).length > 0) {
        refSet = {};
        for (key in refs) {
          if (!__hasProp.call(refs, key)) continue;
          pname = refs[key];
          parent = getParentName(pname);
          if (parent) {
            key = OmegaPac.Profiles.nameAsKey(parent);
            pname = parent;
          }
          refSet[key] = pname;
        }
        refProfiles = [];
        for (key in refSet) {
          if (!__hasProp.call(refSet, key)) continue;
          refProfiles.push(OmegaPac.Profiles.byKey(key, $rootScope.options));
        }
        scope.refs = refProfiles;
        return omegaDialog.open({
          templateUrl: 'partials/cannot_delete_profile.html',
          scope: scope
        }).result;
      } else {
        return omegaDialog.open({
          templateUrl: 'partials/delete_profile.html',
          scope: scope
        }).result.then(function() {
          var attachedName;
          attachedName = getAttachedName(profileName);
          delete $rootScope.options[OmegaPac.Profiles.nameAsKey(attachedName)];
          delete $rootScope.options[OmegaPac.Profiles.nameAsKey(profileName)];
          return $state.go('ui');
        });
      }
    };
    $scope.watchAndUpdateRevision = function(expression) {
      var onChange, revisionChanged;
      revisionChanged = false;
      onChange = function(profile, oldProfile) {
        if (profile === oldProfile || !profile || !oldProfile) {
          return profile;
        }
        if (revisionChanged && profile.revision !== oldProfile.revision) {
          return revisionChanged = false;
        } else {
          OmegaPac.Profiles.updateRevision(profile);
          return revisionChanged = true;
        }
      };
      return this.$watch(expression, onChange, true);
    };
    return unwatch = $scope.$watch((function() {
      var _ref;
      return (_ref = $scope.options) != null ? _ref['+' + name] : void 0;
    }), function(profile) {
      var templ, type, unwatch2, _ref;
      if (!profile) {
        if ($scope.options) {
          unwatch();
          $timeout(function() {
            if (!$state.transition && $location.path() === '/profile/' + name) {
              $location.path('/');
            }
          });
        } else {
          unwatch2 = $scope.$watch('options', function() {
            if ($scope.options) {
              unwatch2();
              if (!$scope.options['+' + name]) {
                unwatch();
                $timeout(function() {
                  if (!$state.transition && $location.path() === '/profile/' + name) {
                    $location.path('/');
                  }
                });
              }
            }
          });
        }
        return;
      }
      if (OmegaPac.Profiles.formatByType[profile.profileType]) {
        profile.format = OmegaPac.Profiles.formatByType[profile.profileType];
        profile.profileType = 'RuleListProfile';
      }
      $scope.profile = profile;
      type = $scope.profile.profileType;
      templ = (_ref = profileTemplates[type]) != null ? _ref : 'profile_unsupported.html';
      $scope.profileTemplate = 'partials/' + templ;
      return $scope.watchAndUpdateRevision('profile');
    });
  });

}).call(this);

(function() {
  angular.module('omega').directive('omegaRuleListEditor', function() {
    return {
      restrict: 'E',
      scope: { profile: '=', options: '=', dispNameFilter: '=', update: '&', updating: '=', updateState: '=', hideTargets: '@' },
      templateUrl: 'partials/rule_list_editor.html',
      controller: 'RuleListProfileCtrl'
    };
  });

  angular.module('omega').controller('RuleListProfileCtrl', function($scope, $window, $element, $timeout, trFilter, downloadFile) {
    $scope.ruleListFormats = OmegaPac.Profiles.ruleListFormats;
    $scope.ruleListFeedback = '';
    $scope.ruleListValidation = null;
    $scope.ruleListSearch = '';
    $scope.ruleListReplace = '';
    $scope.ruleListMatchCount = 0;
    var ruleListValidationTimer = null;
    $scope.ruleListRuleCount = null;
    $scope.downloadIntervals = [15, 60, 180, 360, 720, 1440, -1];
    $scope.downloadIntervalI18n = function(interval) { return 'options_downloadInterval_' + (interval < 0 ? 'never' : interval); };
    $scope.refreshRuleList = function() { return $scope.update({ name: $scope.profile.name }); };
    $scope.subscriptionError = function() {
      return $scope.updateState && $scope.updateState.sourceUrl === $scope.profile.sourceUrl ? $scope.updateState.error : '';
    };
    function readRules(profile) {
      var handler = OmegaPac.RuleList[profile.format || 'Switchy'];
      if (!handler) throw new Error('Unsupported rule list format');
      var text = profile.ruleList || '';
      if (handler.preprocess) text = handler.preprocess(text);
      var rules = profile.format === 'Switchy' && handler.detect(text)
        ? handler.parseOmega(text, profile.matchProfileName, profile.defaultProfileName, { strict: true })
        : handler.parse(text, profile.matchProfileName, profile.defaultProfileName);
      return rules || [];
    }

    $scope.updateRuleListMatchCount = function() {
      var text = $scope.profile && $scope.profile.ruleList || '';
      var query = $scope.ruleListSearch || '';
      if (!query) {
        $scope.ruleListMatchCount = 0;
        return;
      }
      var count = 0;
      var index = 0;
      while ((index = text.indexOf(query, index)) >= 0) {
        count++;
        index += query.length;
      }
      $scope.ruleListMatchCount = count;
    };

    $scope.replaceRuleListText = function() {
      if (!$scope.profile || $scope.profile.sourceUrl || !$scope.ruleListSearch) return;
      var text = $scope.profile.ruleList || '';
      var search = $scope.ruleListSearch;
      var replacement = $scope.ruleListReplace || '';
      var replaced = $scope.ruleListMatchCount;
      $scope.profile.ruleList = text.split(search).join(replacement);
      $scope.updateRuleListMatchCount();
      $scope.validateRuleList();
      $scope.ruleListFeedback = trFilter('options_ruleListReplaced', [replaced]);
    };

    $scope.validateRuleList = function() {
      var profile = $scope.profile;
      if (!profile) return;
      try {
        var rules = readRules(profile);
        if ($scope.options) rules.forEach(function(rule) {
          if (!OmegaPac.Profiles.byName(rule.profileName, $scope.options)) throw new Error('规则引用的模式不存在：' + rule.profileName);
        });
        $scope.ruleListRuleCount = rules.filter(function(rule) { return rule.condition.conditionType !== 'TrueCondition'; }).length;
        $scope.ruleListValidation = {
          valid: true,
          message: trFilter('options_ruleListRuleCount', [$scope.ruleListRuleCount])
        };
        return true;
      } catch (error) {
        $scope.ruleListRuleCount = null;
        $scope.ruleListValidation = {
          valid: false,
          message: trFilter('options_ruleListInvalid') + (error.message ? ': ' + error.message : '')
        };
        return false;
      }
    };

    $scope.queueRuleListValidation = function() {
      $timeout.cancel(ruleListValidationTimer);
      ruleListValidationTimer = $timeout(function() {
        $scope.validateRuleList();
        $scope.updateRuleListMatchCount();
      }, 300);
    };
    $scope.$watch('profile.sourceUrl', function(url, oldUrl) {
      if (url !== oldUrl && $scope.profile) {
        $scope.profile.lastUpdate = null;
        $scope.ruleListFeedback = '';
      }
    });
    $scope.$watchGroup(['profile.ruleList', 'profile.format', 'profile.sourceUrl', 'profile.matchProfileName', 'profile.defaultProfileName'], function() {
      $scope.queueRuleListValidation();
    });
    $scope.$on('$destroy', function() { $timeout.cancel(ruleListValidationTimer); });
    $scope.$on('omegaApplyOptions', function(event) {
      if ($scope.profile && !$scope.profile.sourceUrl && !$scope.validateRuleList()) {
        event.preventDefault();
        $timeout(function() { $element.find('textarea')[0].focus(); });
      }
    });

    $scope.importRuleList = function(content) {
      if ($scope.profile && $scope.profile.sourceUrl) return;
      if (!$scope.profile || typeof content !== 'string') {
        return $scope.ruleListImportError(new Error('Rule list content must be text'));
      }
      $scope.profile.ruleList = content;
      $scope.validateRuleList();
      $scope.ruleListFeedback = trFilter('options_ruleListImported');
    };

    $scope.ruleListImportError = function(error) {
      console.error('Unable to import rule list', error);
      $scope.ruleListValidation = {
        valid: false,
        message: trFilter('options_ruleListImportError')
      };
    };

    $scope.triggerRuleListImport = function() {
      $element[0].querySelector('.rule-list-file').click();
    };

    $scope.copyRuleList = function() {
      var text = $scope.profile && $scope.profile.ruleList || '';
      var done = function() {
        $scope.$applyAsync(function() {
          $scope.ruleListFeedback = trFilter('options_ruleListCopied');
        });
      };
      var failed = function() {
        $scope.$applyAsync(function() {
          $scope.ruleListFeedback = trFilter('options_ruleListCopyError');
        });
      };
      if ($window.navigator.clipboard && $window.navigator.clipboard.writeText) {
        $window.navigator.clipboard.writeText(text).then(done, failed);
      } else {
        failed();
      }
    };

    $scope.downloadRuleList = function() {
      var text = $scope.profile && $scope.profile.ruleList || '';
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      var name = ($scope.profile.name || 'rules').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
      downloadFile(blob, 'Proxy-Lan-rules-' + name + '.txt');
    };

    $scope.clearRuleList = function() {
      if (!$scope.profile || $scope.profile.sourceUrl) return;
      if (!$window.confirm(trFilter('options_ruleListClearConfirm'))) return;
      $scope.profile.ruleList = '';
      $scope.ruleListFeedback = trFilter('options_ruleListCleared');
    };
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty;

  angular.module('omega').controller('SwitchProfileCtrl', function($scope, $rootScope, $timeout, $q, omegaDialog, profileIcons, getAttachedName, omegaTarget, trFilter, defaultRuleListSettings) {
    var advancedConditionTypesExpanded, attachedReady, attachedReadyDefer, basicConditionTypeSet, basicConditionTypesExpanded, expandGroups, parseOmegaRules, parseSource, rulesReady, rulesReadyDefer, stateEditorKey, stopWatchingForRules, type, unwatchRulesShowNote, updateHasConditionTypes, _i, _len;
    $scope.basicConditionTypes = [
      {
        group: 'default',
        types: ['HostWildcardCondition', 'UrlWildcardCondition', 'UrlRegexCondition', 'FalseCondition']
      }
    ];
    $scope.advancedConditionTypes = [
      {
        group: 'host',
        types: ['HostWildcardCondition', 'HostRegexCondition', 'HostLevelsCondition', 'IpCondition']
      }, {
        group: 'url',
        types: ['UrlWildcardCondition', 'UrlRegexCondition', 'KeywordCondition']
      }, {
        group: 'special',
        types: ['WeekdayCondition', 'TimeCondition', 'FalseCondition']
      }
    ];
    expandGroups = function(groups) {
      var group, result, type, _i, _j, _len, _len1, _ref;
      result = [];
      for (_i = 0, _len = groups.length; _i < _len; _i++) {
        group = groups[_i];
        _ref = group.types;
        for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
          type = _ref[_j];
          result.push({
            type: type,
            group: 'condition_group_' + group.group
          });
        }
      }
      return result;
    };
    basicConditionTypesExpanded = expandGroups($scope.basicConditionTypes);
    advancedConditionTypesExpanded = expandGroups($scope.advancedConditionTypes);
    basicConditionTypeSet = {};
    for (_i = 0, _len = basicConditionTypesExpanded.length; _i < _len; _i++) {
      type = basicConditionTypesExpanded[_i];
      basicConditionTypeSet[type.type] = type.type;
    }
    $scope.conditionTypes = basicConditionTypesExpanded;
    $scope.showConditionTypes = 0;
    $scope.hasUrlConditions = false;
    $scope.isUrlConditionType = {
      'UrlWildcardCondition': true,
      'UrlRegexCondition': true
    };
    updateHasConditionTypes = function(rules) {
      if (!rules) return;
      $scope.hasUrlConditions = false;
      $scope.showConditionTypes = 0;
      rules.forEach(function(rule) {
        if (rule.condition.conditionType === 'TrueCondition') {
          rule.condition = {
            conditionType: 'HostWildcardCondition',
            pattern: '*'
          };
        }
        if ($scope.isUrlConditionType[rule.condition.conditionType]) $scope.hasUrlConditions = true;
        if (!basicConditionTypeSet[rule.condition.conditionType]) {
          $scope.showConditionTypes = 1;
        }
      });
      $scope.conditionTypes = $scope.showConditionTypes === 0 ? basicConditionTypesExpanded : advancedConditionTypesExpanded;
    };
    $scope.$watch('profile.rules', updateHasConditionTypes, true);
    rulesReadyDefer = $q.defer();
    rulesReady = rulesReadyDefer.promise;
    stopWatchingForRules = $scope.$watch('profile.rules', function(rules) {
      if (!rules) {
        return;
      }
      stopWatchingForRules();
      return rulesReadyDefer.resolve(rules);
    });
    $scope.addRule = function() {
      var rule, templ, _ref;
      rule = $scope.profile.rules.length > 0 ? ((_ref = $scope.profile.rules, templ = _ref[_ref.length - 1], _ref), angular.copy(templ)) : {
        condition: {
          conditionType: 'HostWildcardCondition',
          pattern: ''
        },
        profileName: $scope.attachedOptions.defaultProfileName
      };
      if (rule.condition.pattern) {
        rule.condition.pattern = '';
      }
      return $scope.profile.rules.push(rule);
    };
    $scope.validateCondition = function(condition, pattern) {
      var _;
      if (condition.conditionType.indexOf('Regex') >= 0) {
        try {
          new RegExp(pattern);
        } catch (_error) {
          _ = _error;
          return false;
        }
      }
      return true;
    };
    $scope.conditionHasWarning = function(condition) {
      var pattern;
      if (condition.conditionType === 'HostWildcardCondition') {
        pattern = condition.pattern;
        return pattern.indexOf(':') >= 0 || pattern.indexOf('/') >= 0;
      }
      return false;
    };
    $scope.validateIpCondition = function(condition, input) {
      var ip;
      if (!input) {
        return false;
      }
      ip = OmegaPac.Conditions.parseIp(input);
      return ip != null;
    };
    $scope.getWeekdayList = OmegaPac.Conditions.getWeekdayList;
    $scope.updateDay = function(condition, i, selected) {
      var char;
      condition.days || (condition.days = '-------');
      char = selected ? 'SMTWtFs'[i] : '-';
      condition.days = condition.days.substr(0, i) + char + condition.days.substr(i + 1);
      delete condition.startDay;
      return delete condition.endDay;
    };
    $scope.removeRule = function(index) {
      var removeForReal, scope;
      removeForReal = function() {
        return $scope.profile.rules.splice(index, 1);
      };
      if ($scope.options['-confirmDeletion']) {
        scope = $scope.$new('isolate');
        scope.rule = $scope.profile.rules[index];
        scope.ruleProfile = $scope.profileByName(scope.rule.profileName);
        scope.dispNameFilter = $scope.dispNameFilter;
        scope.options = $scope.options;
        return omegaDialog.open({
          templateUrl: 'partials/rule_remove_confirm.html',
          scope: scope
        }).result.then(removeForReal);
      } else {
        return removeForReal();
      }
    };
    $scope.cloneRule = function(index) {
      var rule;
      rule = angular.copy($scope.profile.rules[index]);
      $scope.profile.rules.splice(index + 1, 0, rule);
      return $timeout(function() {
        var input, _ref, _ref1;
        input = angular.element(".switch-rule-row:nth-child(" + (index + 2) + ") input");
        if ((_ref = input[0]) != null) {
          _ref.focus();
        }
        return (_ref1 = input[0]) != null ? _ref1.select() : void 0;
      });
    };
    $scope.showNotes = false;
    $scope.addNote = function(index) {
      $scope.showNotes = true;
      return unwatchRulesShowNote();
    };
    unwatchRulesShowNote = $scope.$watch('profile.rules', (function(rules) {
      if (rules && rules.some(function(rule) {
        return !!rule.note;
      })) {
        $scope.showNotes = true;
        return unwatchRulesShowNote();
      }
    }), true);
    $scope.sortableOptions = {
      handle: '.sort-bar',
      tolerance: 'pointer',
      axis: 'y',
      forceHelperSize: true,
      forcePlaceholderSize: true,
      containment: 'parent'
    };
    attachedReadyDefer = $q.defer();
    attachedReady = attachedReadyDefer.promise;
    $scope.$watch('profile.name', function(name) {
      $scope.attachedName = getAttachedName(name);
      return $scope.attachedKey = OmegaPac.Profiles.nameAsKey($scope.attachedName);
    });
    $scope.$watch('options[attachedKey]', function(attached) {
      return $scope.attached = attached;
    });
    $scope.watchAndUpdateRevision('options[attachedKey]');
    $scope.attachedOptions = {
      enabled: false
    };
    $scope.$watch('profile.defaultProfileName', function(name) {
      $scope.attachedOptions.enabled = name === $scope.attachedName;
      if (!$scope.attached || !$scope.attachedOptions.enabled) {
        return $scope.attachedOptions.defaultProfileName = name;
      }
    });
    $scope.$watch('attachedOptions.enabled', function(enabled, oldValue) {
      if (enabled === oldValue) {
        return;
      }
      if (enabled) {
        if ($scope.profile.defaultProfileName !== $scope.attachedName) {
          return $scope.profile.defaultProfileName = $scope.attachedName;
        }
      } else {
        if ($scope.profile.defaultProfileName === $scope.attachedName) {
          if ($scope.attached) {
            $scope.profile.defaultProfileName = $scope.attached.defaultProfileName;
            return $scope.attachedOptions.defaultProfileName = $scope.attached.defaultProfileName;
          } else {
            $scope.profile.defaultProfileName = 'direct';
            return $scope.attachedOptions.defaultProfileName = 'direct';
          }
        }
      }
    });
    $scope.$watch('attached.defaultProfileName', function(name) {
      if (name && $scope.attachedOptions.enabled) {
        return $scope.attachedOptions.defaultProfileName = name;
      }
    });
    $scope.$watch('attachedOptions.defaultProfileName', function(name) {
      attachedReadyDefer.resolve();
      if ($scope.attached && $scope.attachedOptions.enabled) {
        return $scope.attached.defaultProfileName = name;
      } else {
        return $scope.profile.defaultProfileName = name;
      }
    });
    $scope.attachNew = function() {
      $scope.attached = OmegaPac.Profiles.create({
        name: $scope.attachedName,
        defaultProfileName: $scope.profile.defaultProfileName,
        profileType: 'RuleListProfile',
        format: defaultRuleListSettings.format,
        sourceUrl: defaultRuleListSettings.sourceUrl,
        matchProfileName: $scope.profileByName('翻墙') ? '翻墙' : 'direct',
        color: $scope.profile.color
      });
      OmegaPac.Profiles.updateRevision($scope.attached);
      $scope.options[$scope.attachedKey] = $scope.attached;
      $scope.attachedOptions.enabled = true;
      return $scope.profile.defaultProfileName = $scope.attachedName;
    };
    $scope.removeAttached = function() {
      var scope;
      if (!$scope.attached) {
        return;
      }
      scope = $scope.$new('isolate');
      scope.attached = $scope.attached;
      scope.dispNameFilter = $scope.dispNameFilter;
      scope.options = $scope.options;
      return omegaDialog.open({
        templateUrl: 'partials/delete_attached.html',
        scope: scope
      }).result.then(function() {
        $scope.profile.defaultProfileName = $scope.attached.defaultProfileName;
        return delete $scope.options[$scope.attachedKey];
      });
    };
    stateEditorKey = 'web._profileEditor.' + $scope.profile.name;
    $scope.loadRules = false;
    $scope.editSource = false;
    parseOmegaRules = function(code, _arg) {
      var detect, err, key, name, refs, requireResult, setError, _ref;
      _ref = _arg != null ? _arg : {}, detect = _ref.detect, requireResult = _ref.requireResult;
      setError = function(error) {
        var args, message, _ref1;
        if (error.reason) {
          args = (_ref1 = error.args) != null ? _ref1 : [error.sourceLineNo, error.source];
          message = trFilter('ruleList_error_' + error.reason, args);
          if (message) {
            error.message = message;
          }
        }
        return {
          error: error
        };
      };
      if (detect && !OmegaPac.RuleList.Switchy.detect(code)) {
        return {
          error: {
            reason: 'notSwitchy'
          }
        };
      }
      refs = OmegaPac.RuleList.Switchy.directReferenceSet({
        ruleList: code
      });
      if (requireResult && !refs) {
        return setError({
          reason: 'resultNotEnabled'
        });
      }
      for (key in refs) {
        if (!__hasProp.call(refs, key)) continue;
        name = refs[key];
        if (!OmegaPac.Profiles.byKey(key, $scope.options)) {
          return setError({
            reason: 'unknownProfile',
            args: [name]
          });
        }
      }
      try {
        return {
          rules: OmegaPac.RuleList.Switchy.parseOmega(code, null, null, {
            strict: true,
            source: false
          })
        };
      } catch (_error) {
        err = _error;
        return setError(err);
      }
    };
    parseSource = function() {
      var diff, error, oldRules, patch, rules, _ref;
      if (!$scope.source) {
        return true;
      }
      _ref = parseOmegaRules($scope.source.code.trim(), {
        requireResult: true
      }), rules = _ref.rules, error = _ref.error;
      if (error) {
        $scope.source.error = error;
        $scope.editSource = true;
        return false;
      } else {
        $scope.source.error = void 0;
      }
      $scope.attachedOptions.defaultProfileName = rules.pop().profileName;
      diff = jsondiffpatch.create({
        objectHash: function(obj) {
          return JSON.stringify(obj);
        },
        textDiff: {
          minLength: 1 / 0
        }
      });
      oldRules = angular.fromJson(angular.toJson($scope.profile.rules));
      patch = diff.diff(oldRules, rules);
      jsondiffpatch.patch($scope.profile.rules, patch);
      return true;
    };
    $scope.toggleSource = function() {
      return $q.all([attachedReady, rulesReady]).then(function() {
        var args, code;
        $scope.editSource = !$scope.editSource;
        if ($scope.editSource) {
          args = {
            rules: $scope.profile.rules,
            defaultProfileName: $scope.attachedOptions.defaultProfileName
          };
          code = OmegaPac.RuleList.Switchy.compose(args, {
            withResult: true
          });
          $scope.source = {
            code: code
          };
        } else {
          if (!parseSource()) {
            return;
          }
          $scope.source = null;
          $scope.loadRules = true;
        }
        return omegaTarget.state(stateEditorKey, {
          editSource: $scope.editSource
        });
      });
    };
    $rootScope.$on('$stateChangeStart', function(event, _, __, fromState) {
      var sourceValid;
      if ($scope.editSource && $scope.source.touched) {
        sourceValid = parseSource();
        if (!sourceValid) {
          return event.preventDefault();
        }
      }
    });
    $scope.$on('omegaApplyOptions', function(event) {
      if ($scope.editSource && $scope.source.touched) {
        event.preventDefault();
        if (parseSource()) {
          $scope.source.touched = false;
          return $timeout(function() {
            return $rootScope.runAction($rootScope.applyOptions());
          });
        }
      }
    });
    omegaTarget.state(stateEditorKey).then(function(opts) {
      if (opts != null ? opts.editSource : void 0) {
        return $scope.toggleSource();
      } else {
        return $scope.loadRules = true;
      }
    }).then(null, function(error) {
      $scope.loadRules = true;
      return $rootScope.runAction($q.reject(error));
    });

  });

}).call(this);

(function() {
  angular.module('omega').directive('inputGroupClear', function($timeout) {
    return {
      restrict: 'A',
      templateUrl: 'partials/input_group_clear.html',
      scope: {
        'model': '=model',
        'type': '@type',
        'ngPattern': '=?ngPattern',
        'placeholder': '@placeholder',
        'controller': '=?controller'
      },
      link: function(scope, element, attrs) {
        scope.catchAll = new RegExp('');
        $timeout(function() {
          return scope.controller = element.find('input').controller('ngModel');
        });
        scope.oldModel = '';
        scope.controller = scope.input;
        scope.modelChange = function() {
          if (scope.model) {
            return scope.oldModel = '';
          }
        };
        return scope.toggleClear = function() {
          var _ref;
          return _ref = [scope.oldModel, scope.model], scope.model = _ref[0], scope.oldModel = _ref[1], _ref;
        };
      }
    };
  });

  angular.module('omega').directive('omegaUpload', function() {
    return {
      restrict: 'A',
      scope: {
        success: '&omegaUpload',
        error: '&omegaError'
      },
      link: function(scope, element, attrs) {
        var input;
        input = element[0];
        return element.on('change', function() {
          var reader;
          if (input.files.length > 0 && input.files[0].name.length > 0) {
            reader = new FileReader();
            reader.addEventListener('load', function(e) {
              return scope.$apply(function() {
                return scope.success({
                  '$content': e.target.result
                });
              });
            });
            reader.addEventListener('error', function(e) {
              return scope.$apply(function() {
                return scope.error({
                  '$error': e.target.error
                });
              });
            });
            reader.readAsText(input.files[0]);
            return input.value = '';
          }
        });
      }
    };
  });

  angular.module('omega').directive('omegaIp2str', function() {
    return {
      restrict: 'A',
      priority: 2,
      require: 'ngModel',
      link: function(scope, element, attr, ngModel) {
        ngModel.$parsers.push(function(value) {
          if (value) {
            return OmegaPac.Conditions.fromStr('Ip: ' + value);
          } else {
            return {
              conditionType: 'IpCondition',
              ip: '0.0.0.0',
              prefixLength: 0
            };
          }
        });
        return ngModel.$formatters.push(function(value) {
          if (value != null ? value.ip : void 0) {
            return OmegaPac.Conditions.str(value).split(' ', 2)[1];
          } else {
            return '';
          }
        });
      }
    };
  });

}).call(this);

(function() {
  angular.module('omega').filter('profiles', function(builtinProfiles, profileOrder, isProfileNameHidden, isProfileNameReserved) {
    var builtinProfileList, charCodePlus, profile, _;
    charCodePlus = '+'.charCodeAt(0);
    builtinProfileList = (function() {
      var _results;
      _results = [];
      for (_ in builtinProfiles) {
        profile = builtinProfiles[_];
        _results.push(profile);
      }
      return _results;
    })();
    return function(options, filter) {
      var name, result, value;
      result = [];
      for (name in options) {
        value = options[name];
        if (name.charCodeAt(0) === charCodePlus) {
          result.push(value);
        }
      }
      if (typeof filter === 'object' || (typeof filter === 'string' && filter.charCodeAt(0) === charCodePlus)) {
        if (typeof filter === 'string') {
          filter = filter.substr(1);
        }
        result = OmegaPac.Profiles.validResultProfilesFor(filter, options);
      }
      if (filter === 'all') {
        result = result.filter(function(profile) {
          return !isProfileNameHidden(profile.name);
        });
        result = result.concat(builtinProfileList);
      } else {
        result = result.filter(function(profile) {
          return !isProfileNameReserved(profile.name);
        });
      }
      if (filter === 'sorted') {
        result.sort(profileOrder);
      }
      return result;
    };
  });

  angular.module('omega').filter('tr', function(omegaTarget) {
    return omegaTarget.getMessage;
  });

  angular.module('omega').filter('dispName', function(omegaTarget, $rootScope) {
    return function(name) {
      var profile = typeof name === 'object' ? name : null;
      name = profile ? profile.name : name;
      var saved = $rootScope.options && $rootScope.options['-builtinProfiles'];
      var custom = saved && saved['+' + name];
      var label = custom ? custom.displayName : ($rootScope.options ? null : profile && profile.displayName);
      return (typeof label === 'string' && label.trim()) || omegaTarget.getMessage('profile_' + name) || name;
    };
  });

}).call(this);
