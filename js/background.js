(function() {
  var Log, OmegaTargetCurrent, Promise, dispName, options, zeroBackground, _ref,
    __hasProp = {}.hasOwnProperty;

  OmegaTargetCurrent = Object.create(OmegaTargetChromium);

  Promise = OmegaTargetCurrent.Promise;

  Promise.longStackTraces();

  OmegaTargetCurrent.Log = Object.create(OmegaTargetCurrent.Log);

  Log = OmegaTargetCurrent.Log;

  options = null;

  if ((_ref = chrome.contextMenus) != null) {
    _ref.onClicked.addListener(function(info, tab) {
      return options != null ? options.ready.then(function() {
        switch (info.menuItemId) {
          case 'inspectPage':
          case 'inspectLink':
          case 'inspectElement':
          case 'inspectFrame':
            return options._inspect.inspect(info, tab);
        }
      }) : void 0;
    });
  }

  dispName = function(name) {
    if (options && (name === 'system' || name === 'direct')) {
      var metadata = options.getAll()['-builtinProfiles'];
      var profile = metadata && metadata['+' + name];
      if (profile && typeof profile.displayName === 'string' && profile.displayName.trim()) return profile.displayName.trim();
    }
    return chrome.i18n.getMessage('profile_' + name) || name;
  };

  zeroBackground = function(zeroStorage, opts) {
    var actionForUrl, charCodeUnderscore, drawContext, drawError, drawIcon, encodeError, external, iconCache, isHidden, proxyImpl, refreshActivePageIfEnabled, resetAllOptions, state, storage, tabs, timeout, unhandledPromises, unhandledPromisesId, unhandledPromisesNextId;
    unhandledPromises = [];
    unhandledPromisesId = [];
    unhandledPromisesNextId = 1;
    Promise.onPossiblyUnhandledRejection(function(reason, promise) {
      Log.error("[" + unhandledPromisesNextId + "] Unhandled rejection:\n", reason);
      unhandledPromises.push(promise);
      unhandledPromisesId.push(unhandledPromisesNextId);
      return unhandledPromisesNextId++;
    });
    Promise.onUnhandledRejectionHandled(function(promise) {
      var index;
      index = unhandledPromises.indexOf(promise);
      Log.log("[" + unhandledPromisesId[index] + "] Rejection handled!", promise);
      unhandledPromises.splice(index, 1);
      return unhandledPromisesId.splice(index, 1);
    });
    iconCache = {};
    drawContext = null;
    drawError = null;
    drawIcon = function(resultColor, automatic) {
      var cacheKey, canvas, e, icon, size, _i, _len, _ref1;
      cacheKey = "omega+" + resultColor + "+" + !!automatic;
      icon = iconCache[cacheKey];
      if (icon) {
        return icon;
      }
      try {
        if (drawContext == null) {
          canvas = new OffscreenCanvas(300, 300);
          drawContext = canvas.getContext('2d', {
            willReadFrequently: true
          });
        }
        icon = {};
        _ref1 = [16, 19, 24, 32, 38];
        for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
          size = _ref1[_i];
          drawContext.scale(size, size);
          drawContext.clearRect(0, 0, 1, 1);
          drawOmega(drawContext, resultColor, automatic);
          drawContext.setTransform(1, 0, 0, 1, 0, 0);
          icon[size] = drawContext.getImageData(0, 0, size, size);
          if (icon[size].data[3] === 255) {
            throw new Error('Icon drawing blocked by privacy.resistFingerprinting.');
          }
        }
      } catch (_error) {
        e = _error;
        if (drawError == null) {
          drawError = e;
          Log.error(e);
          Log.error('Profile-colored icon disabled. Falling back to static icon.');
        }
        icon = null;
      }
      return iconCache[cacheKey] = icon;
    };
    charCodeUnderscore = '_'.charCodeAt(0);
    isHidden = function(name) {
      return name.charCodeAt(0) === charCodeUnderscore && name.charCodeAt(1) === charCodeUnderscore;
    };
    actionForUrl = function(url, opts) {
      if (opts == null) {
        opts = {};
      }
      return options.ready.then(function() {
        var request;
        request = OmegaPac.Conditions.requestFromUrl(url);
        return options.matchProfile(request);
      }).then(function(_arg) {
        var attached, automatic, badgeText, condition, condition2Str, current, currentName, details, direct, icon, name, prefix, profile, result, resultColor, results, shortTitle, _i, _len, _ref1, _ref2;
        profile = _arg.profile, results = _arg.results;
        current = options.currentProfile();
        currentName = dispName(current.name);
        details = '';
        direct = false;
        attached = false;
        prefix = '';
        condition2Str = function(condition) {
          return condition.pattern || OmegaPac.Conditions.str(condition);
        };
        for (_i = 0, _len = results.length; _i < _len; _i++) {
          result = results[_i];
          if (Array.isArray(result)) {
            if (result[1] == null) {
              attached = false;
              name = result[0];
              if (name[0] === '+') {
                name = name.substr(1);
              }
              if (isHidden(name)) {
                attached = true;
              } else if (name !== current.name) {
                details += chrome.i18n.getMessage('browserAction_defaultRuleDetails');
                details += " => " + (dispName(name)) + "\n";
              }
            } else if (result[1].length === 0) {
              if (result[0] === 'DIRECT') {
                details += chrome.i18n.getMessage('browserAction_directResult');
                details += '\n';
                direct = true;
              } else {
                details += "" + result[0] + "\n";
              }
            } else if (typeof result[1] === 'string') {
              details += "" + result[1] + " => " + result[0] + "\n";
            } else {
              condition = condition2Str((_ref1 = result[1].condition) != null ? _ref1 : result[1]);
              details += "" + condition + " => ";
              if (result[0] === 'DIRECT') {
                details += chrome.i18n.getMessage('browserAction_directResult');
                details += '\n';
                direct = true;
              } else {
                details += "" + result[0] + "\n";
              }
            }
          } else if (result.profileName) {
            if (attached) {
              details += chrome.i18n.getMessage('browserAction_attachedPrefix');
              prefix = chrome.i18n.getMessage('browserAction_attachedPrefix');
              attached = false;
            }
            condition = (_ref2 = result.source) != null ? _ref2 : condition2Str(result.condition);
            details += "" + condition + " => " + (dispName(result.profileName)) + "\n";
          }
        }
        if (!details) {
          details = options.printProfile(current);
        }
        resultColor = profile.color;
        automatic = !options.isCurrentProfileStatic();
        icon = null;
        if (!opts.skipIcon) {
          // Automatic modes add an A inside the result-colored ring.
          icon = drawIcon(resultColor, automatic);
        }
        shortTitle = currentName;
        if (profile.name !== current.name) {
          shortTitle += ' => ' + profile.name;
        }
        if (options._options['-showResultProfileOnActionBadgeText']) {
          badgeText = profile.name || '';
          if (profile.builtin) {
            badgeText = dispName(profile.name + '_badge_text');
          }
          badgeText = badgeText.substring(0, 4);
        }
        return {
          title: chrome.i18n.getMessage('browserAction_titleWithResult', [currentName, dispName(profile.name), details]),
          currentName: currentName,
          name: dispName(profile.name),
          profile: profile,
          badgeText: badgeText,
          shortTitle: shortTitle,
          prefix: prefix,
          icon: icon,
          resultColor: resultColor,
          automatic: automatic
        };
      })["catch"](function() {
        return null;
      });
    };
    storage = new OmegaTargetCurrent.Storage('local');
    state = new OmegaTargetCurrent.BrowserStorage(zeroStorage, 'omega.local.');
    state.remove(['syncOptions', 'gistId', 'gistToken', 'syncUsername', 'syncBackendType',
      'lastGistCommit', 'lastGistSync', 'customCss', 'firstRun', 'web.switchGuide']);
    proxyImpl = OmegaTargetCurrent.proxy.getProxyImpl(Log);
    state.set({
      proxyImplFeatures: proxyImpl.features
    });
    options = new OmegaTargetCurrent.Options(storage, state, Log, proxyImpl);
    options._actionForUrl = actionForUrl;
    options.initWithOptions(null);
    tabs = new OmegaTargetCurrent.ChromeTabs(actionForUrl);
    tabs.watch();
    options._inspect = new OmegaTargetCurrent.Inspect(function(url, tab) {
      if (url === tab.url) {
        options.clearBadge();
        tabs.processTab(tab);
        state.remove('inspectUrl');
        return;
      }
      state.set({
        inspectUrl: url
      });
      return actionForUrl(url).then(function(action) {
        var parsedUrl, title, urlDisp;
        if (!action) {
          return;
        }
        parsedUrl = OmegaTargetCurrent.Url.parse(url);
        if (parsedUrl.hostname === OmegaTargetCurrent.Url.parse(tab.url).hostname) {
          urlDisp = parsedUrl.path;
        } else {
          urlDisp = parsedUrl.hostname;
        }
        title = chrome.i18n.getMessage('browserAction_titleInspect', urlDisp) + '\n';
        title += action.title;
        chrome.action.setTitle({
          title: title,
          tabId: tab.id
        });
        return tabs.setTabBadge(tab, {
          text: '#',
          color: action.resultColor
        });
      });
    });
    options.setProxyNotControllable(null);
    timeout = null;
    proxyImpl.watchProxyChange(function(details) {
      var internal, noRevert, notControllableBefore, parsed, reason;
      if (!details) {
        return;
      }
      notControllableBefore = options.proxyNotControllable();
      internal = false;
      noRevert = false;
      switch (details['levelOfControl']) {
        case "controlled_by_other_extensions":
        case "not_controllable":
          reason = details['levelOfControl'] === 'not_controllable' ? 'policy' : 'app';
          options.setProxyNotControllable(reason);
          noRevert = true;
          break;
        default:
          options.setProxyNotControllable(null);
      }
      if (details['levelOfControl'] === 'controlled_by_this_extension') {
        internal = true;
        if (!notControllableBefore) {
          return;
        }
      }
      Log.log('external proxy: ', details);
      if (timeout != null) {
        clearTimeout(timeout);
      }
      parsed = null;
      timeout = setTimeout((function() {
        if (parsed) {
          return options.setExternalProfile(parsed, {
            noRevert: noRevert,
            internal: internal
          });
        }
      }), 500);
      parsed = proxyImpl.parseExternalProfile(details, options._options);
    });
    external = false;
    options.currentProfileChanged = function(reason) {
      var current, currentName, details, icon, message, shortTitle, title;
      iconCache = {};
      if (reason === 'external') {
        external = true;
      } else if (reason !== 'clearBadge') {
        external = false;
      }
      current = options.currentProfile();
      currentName = '';
      if (current) {
        currentName = dispName(current.name);
      }
      details = options.printProfile(current);
      if (currentName) {
        title = chrome.i18n.getMessage('browserAction_titleWithResult', [currentName, '', details]);
        shortTitle = currentName;
      } else {
        title = details;
        shortTitle = details;
      }
      if (external && current && current.profileType !== 'SystemProfile') {
        message = chrome.i18n.getMessage('browserAction_titleExternalProxy');
        title = message + '\n' + title;
        shortTitle = 'Omega-Extern: ' + details;
        options.setBadge();
      }
      if (!current) {
        return tabs.resetAll({});
      }
      if (!current.name || !OmegaPac.Profiles.isInclusive(current)) {
        icon = drawIcon(current.color);
      } else {
        icon = drawIcon(options.profile('direct').color, true);
      }
      return tabs.resetAll({
        icon: icon,
        title: title,
        shortTitle: shortTitle
      });
    };
    encodeError = function(obj) {
      if (obj instanceof Error) {
        return {
          _error: 'error',
          name: obj.name,
          message: obj.message,
          profileName: obj.profileName,
          statusCode: obj.statusCode,
          stack: obj.stack,
          original: obj
        };
      } else {
        return obj;
      }
    };
    refreshActivePageIfEnabled = function() {
      if (zeroStorage['omega.local.refreshOnProfileChange'] === 'false') {
        return;
      }
      return chrome.tabs.query({
        active: true,
        lastFocusedWindow: true
      }, function(tabs) {
        var activeTab, url;
        activeTab = tabs && tabs[0];
        if (!activeTab) {
          return;
        }
        url = activeTab.pendingUrl || activeTab.url;
        if (!url) {
          return;
        }
        if (url.substr(0, 6) === 'chrome') {
          return;
        }
        if (url.substr(0, 6) === 'about:') {
          return;
        }
        if (url.substr(0, 4) === 'moz-') {
          return;
        }
        if (activeTab.pendingUrl) {
          return chrome.tabs.update(activeTab.id, {
            url: url
          });
        } else {
          return chrome.tabs.reload(activeTab.id, {
            bypassCache: true
          });
        }
      });
    };
    resetAllOptions = function() {
      return options.ready.then(function() {
        var logStore;
        if (typeof options._watchStop === "function") {
          options._watchStop();
        }
        logStore = idbKeyval.createStore('log-store', 'log-store');
        return Promise.all([
          chrome.storage.local.clear(),
          idbKeyval.clear(logStore),
          idbKeyval.clear()
        ]);
      });
    };
    return chrome.runtime.onMessage.addListener(function(request, sender, respond) {
      var allowedMethods, args, method, reply, target;
      if (!(request && request.method)) {
        return;
      }
      if (sender && sender.id && sender.id !== chrome.runtime.id) {
        respond({
          error: {
            reason: 'forbiddenSender'
          }
        });
        return;
      }
      allowedMethods = new Set([
        'resetAllOptions',
        'getState',
        'setState',
        'applyProfile',
        'getPageInfo',
        'addCondition',
        'getAll',
        'renameProfile',
        'replaceRef',
        'patch',
        'reset',
        'updateProfile',
        'addProfile'
      ]);
      if (!allowedMethods.has(request.method) ||
          !/^[A-Za-z0-9_]+$/.test(request.method)) {
        respond({
          error: {
            reason: 'noSuchMethod'
          }
        });
        return;
      }
      reply = !request.noReply;
      options.ready.then(function() {
        if (request.method === 'resetAllOptions') {
          target = globalThis;
          method = resetAllOptions;
        } else if (request.method === 'getState') {
          target = state;
          method = state.get;
        } else if (request.method === 'setState') {
          target = state;
          method = state.set;
        } else {
          target = options;
          method = target[request.method];
        }
        if (typeof method !== 'function') {
          throw new Error("No such method " + request.method + "!");
        }
        args = Array.isArray(request.args) ? request.args : [];
        return Promise.resolve().then(function() {
          return method.apply(target, args);
        }).then(function(result) {
          var key, value;
          if (request.refreshActivePage) {
            refreshActivePageIfEnabled();
          }
          if (!reply) {
            return;
          }
          if (request.method === 'updateProfile') {
            for (key in result) {
              if (!__hasProp.call(result, key)) continue;
              value = result[key];
              result[key] = encodeError(value);
            }
          }
          respond({
            result: result
          });
        });
      })["catch"](function(error) {
        if (error.name !== 'ProxyConfigurationError') Log.error(request.method + ' ==>', error);
        if (reply) {
          respond({
            error: encodeError(error)
          });
        }
      });
      if (reply) {
        return true;
      }
    });
  };

  globalThis.zeroBackground = zeroBackground;

}).call(this);
