(function() {
  var orderForType;

  orderForType = {
    'FixedProfile': -2000,
    'SwitchProfile': 2000,
    'RuleListProfile': 3000
  };

  angular.module('omegaDecoration', []).value('profileIcons', {
    'DirectProfile': 'mode-icon mode-icon-direct',
    'SystemProfile': 'mode-icon mode-icon-system',
    'FixedProfile': 'mode-icon mode-icon-proxy',
    'RuleListProfile': 'mode-icon mode-icon-list',
    'SwitchProfile': 'mode-icon mode-icon-auto'
  }).constant('profileOrder', function(a, b) {
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
  }).directive('omegaProfileIcon', function(profileIcons) {
    return {
      restrict: 'A',
      template: '<span ng-style="{color: color || profile.color}" class="glyphicon {{icon || profileIcons[profile.profileType]}}" aria-hidden="true"></span>',
      scope: { profile: '=?omegaProfileIcon', icon: '=?icon', color: '=?color', options: '=options' },
      link: function(scope) { scope.profileIcons = profileIcons; }
    };
  }).directive('omegaProfileInline', function() {
    return {
      restrict: 'A',
      template: '<span omega-profile-icon="profile" options="options"></span>\n{{dispName ? dispName(profile) : profile.name}}',
      scope: {
        'profile': '=omegaProfileInline',
        'dispName': '=?dispName',
        'options': '=options'
      }
    };
  }).directive('omegaColorPicker', function($document, $timeout) {
    return {
      restrict: 'E',
      require: 'ngModel',
      scope: {},
      templateUrl: 'partials/profile_color_picker.html',
      link: function(scope, element, attrs, ngModel) {
        scope.palette = ['#315fd4', '#62a8e5', '#24765c', '#79c98c', '#e2ad43', '#eb875b', '#c3424f', '#a677d4', '#65738b', '#aaaaaa', '#243149', '#000000'];
        scope.picker = { open: false };
        function hex(number) { return Math.round(number).toString(16).padStart(2, '0'); }
        function readColor(value) {
          var match, color = value || '#315fd4', alpha = 1;
          if (/^#[0-9a-f]{3,4}$/i.test(color)) color = '#' + color.slice(1).split('').map(function(c) { return c + c; }).join('');
          if (/^#[0-9a-f]{8}$/i.test(color)) {
            alpha = parseInt(color.slice(7), 16) / 255;
            color = color.slice(0, 7);
          } else if ((match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(color))) {
            color = '#' + hex(Number(match[1])) + hex(Number(match[2])) + hex(Number(match[3]));
            alpha = match[4] == null ? 1 : Number(match[4]);
          }
          scope.picker.hex = /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : '#315FD4';
          scope.picker.nativeColor = scope.picker.hex;
          scope.picker.opacity = Math.round(Math.max(0, Math.min(1, alpha)) * 100);
          scope.picker.hexInvalid = false;
        }
        ngModel.$render = function() {
          scope.picker.color = ngModel.$viewValue || '#315fd4';
          readColor(scope.picker.color);
        };
        scope.applyColor = function(value) {
          if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value || '')) {
            scope.picker.hexInvalid = true;
            return;
          }
          var color = value.length === 4 ? '#' + value.slice(1).split('').map(function(c) { return c + c; }).join('') : value;
          color = color.toUpperCase();
          scope.picker.hexInvalid = false;
          scope.picker.hex = scope.picker.nativeColor = color;
          scope.picker.color = scope.picker.opacity === 100 ? color : color + hex(scope.picker.opacity * 255 / 100);
          ngModel.$setViewValue(scope.picker.color);
        };
        scope.selectColor = function(color) {
          scope.applyColor(color);
        };
        scope.toggle = function() {
          scope.picker.open = !scope.picker.open;
          if (scope.picker.open) readColor(ngModel.$viewValue);
        };
        function close() { scope.$applyAsync(function() { scope.picker.open = false; }); }
        function outside(event) { if (scope.picker.open && !element[0].contains(event.target)) close(); }
        function keydown(event) {
          if (scope.picker.open && event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation(); close();
            $timeout(function() { element[0].querySelector('.color-picker-trigger').focus(); });
          }
        }
        $document.on('click', outside);
        element.on('keydown', keydown);
        scope.$on('$destroy', function() {
          $document.off('click', outside);
          element.off('keydown', keydown);
        });
      }
    };
  }).directive('omegaHtml', function($compile) {
    return {
      restrict: 'A',
      link: function(scope, element, attrs, ngModel) {
        var getHtml, locals;
        locals = {
          $profile: function(profile, dispName, options) {
            if (profile == null) {
              profile = 'profile';
            }
            if (dispName == null) {
              dispName = 'dispNameFilter';
            }
            if (options == null) {
              options = 'options';
            }
            return "<span class=\"profile-inline\" omega-profile-inline=\"" + profile + "\"\n  disp-name=\"" + dispName + "\" options=\"" + options + "\"></span>";
          }
        };
        getHtml = function() {
          return scope.$eval(attrs.omegaHtml, locals);
        };
        return scope.$watch(getHtml, function(html) {
          element.html(html);
          return $compile(element.contents())(scope);
        });
      }
    };
  }).directive('omegaProfileSelect', function($timeout, profileIcons) {
    return {
      restrict: 'A',
      templateUrl: 'partials/omega_profile_select.html',
      require: '?ngModel',
      scope: {
        'profiles': '&omegaProfileSelect',
        'defaultText': '@?defaultText',
        'dispName': '=?dispName',
        'options': '=options'
      },
      link: function(scope, element, attrs, ngModel) {
        var updateView;
        scope.profileIcons = profileIcons;
        scope.currentProfiles = [];
        scope.dispProfiles = void 0;
        updateView = function() {
          var profile, _i, _len, _ref, _results;
          scope.profileIcon = '';
          _ref = scope.currentProfiles;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            profile = _ref[_i];
            if (profile.name === scope.profileName) {
              scope.selectedProfile = profile;
              scope.profileIcon = profileIcons[profile.profileType];
              break;
            } else {
              _results.push(void 0);
            }
          }
          return _results;
        };
        scope.$watch(scope.profiles, (function(profiles) {
          scope.currentProfiles = profiles || [];
          if (scope.dispProfiles != null) {
            scope.dispProfiles = scope.currentProfiles;
          }
          return updateView();
        }), true);
        scope.toggled = function(open) {
          if (open && (scope.dispProfiles == null)) {
            scope.dispProfiles = scope.currentProfiles;
            return scope.toggled = void 0;
          }
        };
        if (ngModel) {
          ngModel.$render = function() {
            scope.profileName = ngModel.$viewValue;
            return updateView();
          };
        }
        scope.setProfileName = function(name) {
          if (ngModel) {
            ngModel.$setViewValue(name);
            return ngModel.$render();
          }
        };
        return scope.getName = function(profile) {
          if (profile) {
            return scope.dispName(profile) || profile.name;
          }
        };
      }
    };
  });

}).call(this);
