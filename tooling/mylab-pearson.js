window.__ML = (function () {
  var SW = 1568;

  function K() { return SW / window.innerWidth; }

  function ctr(e) {
    var r = e.getBoundingClientRect(), k = K();
    return [Math.round((r.left + r.width / 2) * k), Math.round((r.top + r.height / 2) * k)];
  }

  function lpt(e, f) {
    var r = e.getBoundingClientRect(), k = K();
    return [Math.round((r.left + r.width * (f || 0.22)) * k), Math.round((r.top + r.height / 2) * k)];
  }

  function dedupe(s) {
    s = (s || '').replace(/\s+/g, ' ').trim();
    if (s.length % 2 === 0 && s.length > 0) {
      var h = s.length / 2;
      if (s.slice(0, h) === s.slice(h)) return s.slice(0, h);
    }
    return s;
  }

  function fields() {
    return [].slice.call(document.querySelectorAll('.acs-inputField')).map(function (e, i) {
      var raw = (e.textContent || '').trim();
      return {
        i: i,
        val: /enter your response/i.test(raw) ? '' : dedupe(raw),
        empty: /enter your response/i.test(raw),
        click: lpt(e, 0.22),
        vis: e.getBoundingClientRect().top > 0 && e.getBoundingClientRect().bottom < window.innerHeight
      };
    });
  }

  function btns() {
    var o = [];
    document.querySelectorAll('button').forEach(function (e) {
      var t = (e.textContent || '').trim();
      if (!/^(Check answer|Clear all|Next|Previous|Save|Submit|OK|Continue|Done|Get started|Start)/i.test(t)) return;
      var r = e.getBoundingClientRect();
      if (r.width < 10 || r.left < 0) return;
      o.push({ t: t.slice(0, 22), xy: ctr(e), dis: !!e.disabled });
    });
    return o;
  }

  function hit(re) {
    var b = [].slice.call(document.querySelectorAll('button,a,[role=button]')).filter(function (e) {
      var t = ((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '')).replace(/\s+/g, ' ').trim();
      return re.test(t) && !e.disabled && e.getBoundingClientRect().width > 8;
    });
    if (!b.length) return 'none';
    b[0].click();
    return 'hit:' + ((b[0].getAttribute('aria-label') || b[0].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40));
  }

  function radios() {
    return [].slice.call(document.querySelectorAll('input[type=radio]')).map(function (e, i) {
      var l = e.closest('label') || e.parentElement || {};
      return { i: i, on: e.checked, txt: ((l.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, 90), xy: ctr(e) };
    });
  }

  function boxes() {
    return [].slice.call(document.querySelectorAll('input[type=checkbox]')).map(function (e, i) {
      var l = e.closest('label') || e.parentElement || {};
      return { i: i, on: e.checked, txt: ((l.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, 90), xy: ctr(e) };
    });
  }

  function drops() {
    var o = [];
    document.querySelectorAll('*').forEach(function (e) {
      if (e.children.length) return;
      if (!/^Select$/i.test((e.textContent || '').trim())) return;
      var p = e.closest('[role=button],button,div');
      if (p) o.push({ xy: ctr(p) });
    });
    return o;
  }

  function tries() {
    var m = document.body.innerText.match(/(\d+)\s+tr(y|ies)\s+left/i);
    return m ? +m[1] : null;
  }

  function q() {
    var t = document.body.innerText.replace(/\n{2,}/g, '\n');
    var m = t.match(/\n\d+\.\d+\.[\w-]+\n\d+ parts?/) || t.match(/\n[\w.-]+\n\d+ parts?/);
    var i = m ? t.indexOf(m[0]) : -1;
    return (i < 0 ? t : t.slice(i)).split('\nAI Study Tool')[0].trim();
  }

  function fig() {
    var t = document.body.innerText;
    var i = t.lastIndexOf('\nNext\n');
    return i < 0 ? '' : t.slice(i + 6).replace(/\s+/g, ' ').trim();
  }

  function openFig() {
    var found = null;
    document.querySelectorAll('*').forEach(function (e) {
      if (e.children.length || found) return;
      if (!/Click the icon/i.test(e.textContent || '')) return;
      var p = e.parentElement, b = p && p.querySelector('button');
      if (!b && p && p.parentElement) b = p.parentElement.querySelector('button');
      if (b) found = b;
    });
    if (!found) return 'no icon';
    found.click();
    return 'opened';
  }

  function score() {
    return (document.body.innerText.match(/My score:[^\n]*/) || [''])[0];
  }

  function hookPopups() {
    if (window.__popHooked) return 'already';
    window.__popHooked = true;
    window.__popCount = 0;
    var real = window.open.bind(window);
    window.__realOpen = real;
    window.open = function (u, n, f) {
      try {
        window.__popCount++;
        var ifr = document.getElementById('__popupframe');
        if (!ifr) {
          ifr = document.createElement('iframe');
          ifr.id = '__popupframe';
          ifr.style.cssText = 'position:fixed;right:10px;top:70px;width:820px;height:640px;z-index:2147483647;border:3px solid #0a6;background:#fff';
          document.body.appendChild(ifr);
        }
        ifr.src = u || 'about:blank';
        return {
          focus: function () {}, blur: function () {},
          close: function () { var e = document.getElementById('__popupframe'); if (e) e.remove(); },
          closed: false, document: document, location: { href: u }
        };
      } catch (err) { return real(u, n, f); }
    };
    return 'popup interceptor installed';
  }

  function dump() {
    return JSON.stringify({ q: q(), f: fields(), b: btns(), r: radios(), d: drops(), t: tries(), s: score() });
  }

  return { K: K, SW: function (w) { SW = w; return SW; }, fields: fields, btns: btns, hit: hit,
           radios: radios, boxes: boxes, drops: drops, tries: tries, q: q, fig: fig,
           openFig: openFig, score: score, hookPopups: hookPopups, dump: dump };
})();
