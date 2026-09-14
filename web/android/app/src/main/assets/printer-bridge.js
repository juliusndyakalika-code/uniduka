/*
 * Routes the web app's existing receipt printing to the Bluetooth printer.
 *
 * Injected by the shell so the web app needs no change. printReceipt.ts builds
 * the receipt into a hidden same-origin iframe and calls contentWindow.print().
 * That iframe is reachable from here, so its print() is replaced with a call
 * into the ThermalPrinter plugin.
 *
 * Falls through to the browser's own print when no printer is configured, which
 * is what a shop using a USB printer through the system dialog still wants.
 */
(function () {
  if (window.__mauzoPrinterBridge) return;
  window.__mauzoPrinterBridge = true;

  var Plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
  var Printer = Plugins.ThermalPrinter;
  if (!Printer) return;                       // not running in the shell

  function toast(message) {
    var el = document.createElement('div');
    el.textContent = message;
    el.style.cssText =
      'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;' +
      'background:#1c1917;color:#fff;padding:12px 18px;border-radius:12px;font:14px system-ui;' +
      'max-width:86vw;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.28)';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 4200);
  }

  /** Choose a printer the first time one is needed. */
  function choosePrinter() {
    return Printer.listDevices().then(function (res) {
      var devices = res.devices || [];
      if (!devices.length) {
        toast('No paired printer found. Pair it in Android Bluetooth settings first.');
        return null;
      }
      // One paired printer is the overwhelmingly common case; asking which of
      // one to use is a question with no information in it.
      if (devices.length === 1) {
        return Printer.select({ address: devices[0].address }).then(function () {
          return devices[0].address;
        });
      }
      var lines = devices.map(function (d, i) { return (i + 1) + '. ' + d.name; }).join('\n');
      var pick = window.prompt('Which printer?\n\n' + lines, '1');
      var idx = parseInt(pick, 10) - 1;
      if (isNaN(idx) || !devices[idx]) return null;
      return Printer.select({ address: devices[idx].address }).then(function () {
        return devices[idx].address;
      });
    });
  }

  function printText(text) {
    return Printer.printText({ text: text }).catch(function (err) {
      var msg = (err && (err.message || err)) + '';
      if (msg.indexOf('NO_PRINTER') !== -1) {
        return choosePrinter().then(function (address) {
          if (!address) return;
          return Printer.printText({ text: text }).catch(function (e2) {
            toast((e2 && e2.message) || 'Printing failed.');
          });
        });
      }
      toast(msg || 'Printing failed.');
    });
  }

  function patch(frame) {
    try {
      var w = frame.contentWindow;
      if (!w || w.__mauzoPatched) return;
      w.__mauzoPatched = true;
      w.print = function () {
        // innerText, not textContent: it respects the receipt's line breaks,
        // which is exactly the fixed-width layout a thermal printer wants.
        var text = (w.document && w.document.body && w.document.body.innerText) || '';
        if (text.trim()) printText(text);
      };
    } catch (e) { /* cross-origin frame; not ours */ }
  }

  // Patch at insertion, synchronously.
  //
  // A MutationObserver alone is not enough: its callback is a microtask, so an
  // iframe appended and printed in the same task is never patched. The web app
  // happens to print 400ms later, which would work, but a receipt reaching the
  // printer must not depend on winning that race.
  ['appendChild', 'insertBefore', 'replaceChild'].forEach(function (name) {
    var original = Node.prototype[name];
    Node.prototype[name] = function (node) {
      var result = original.apply(this, arguments);
      try {
        if (node && node.tagName === 'IFRAME') {
          patch(node);
          node.addEventListener('load', function () { patch(node); });
        }
      } catch (e) { /* never break insertion over printing */ }
      return result;
    };
  });

  // Backstop for frames inserted by means the patches above do not cover.
  new MutationObserver(function (records) {
    records.forEach(function (r) {
      Array.prototype.forEach.call(r.addedNodes, function (n) {
        if (n && n.tagName === 'IFRAME') {
          patch(n);
          n.addEventListener('load', function () { patch(n); });
        }
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Anything printing the main window rather than an iframe.
  var nativePrint = window.print ? window.print.bind(window) : null;
  window.print = function () {
    var text = (document.body && document.body.innerText) || '';
    if (text.trim()) printText(text); else if (nativePrint) nativePrint();
  };
})();
