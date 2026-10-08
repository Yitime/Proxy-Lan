(function() {
  try {
    if (globalThis.localStorage) localStorage.removeItem('log');
  } catch (_) {}
  window.onerror = function(message, url, line, col, error) {
    console.error(error && error.stack ? error.stack : url + ':' + line + ':' + col + ': ' + message);
  };
}).call(this);
