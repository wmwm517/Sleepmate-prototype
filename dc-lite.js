/* dc-lite: 프로토타입 화면을 정적 사이트에서 돌리기 위한 작은 런타임 (morphdom 사용) */
(function () {
  var app = document.getElementById('app');
  var W = +app.dataset.w, H = +app.dataset.h;
  var embed = window.self !== window.top;
  if (embed) document.documentElement.classList.add('embed');

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () { scheduled = false; render(); });
  }
  var scheduled = false;

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (p) {
    if (typeof p === 'function') p = p(this.state, this.props);
    this.state = Object.assign({}, this.state, p);
    schedule();
  };
  DCLogic.prototype.forceUpdate = function () { schedule(); };

  var tpl = document.getElementById('tpl').content;
  var src = document.getElementById('logic').textContent;
  var Comp = new Function('DCLogic', src + '\n;return Component;')(DCLogic);
  var inst = new Comp({});
  if (!inst.props) inst.props = {};
  if (!inst.state) inst.state = {};

  var WHOLE = /^\s*\{\{([^}]+)\}\}\s*$/;
  var EV = { onclick: 'click', onpointerdown: 'pointerdown', onpointermove: 'pointermove', onpointerup: 'pointerup', onpointercancel: 'pointercancel', onchange: 'input', oninput: 'input' };
  var handlers = new Map(), hid = 0;

  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return +path;
    var cur = scope, parts = path.split('.');
    for (var i = 0; i < parts.length; i++) { if (cur == null) return undefined; cur = cur[parts[i]]; }
    return cur;
  }
  function interp(str, scope) {
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, p) { var v = lookup(p, scope); return v == null ? '' : String(v); });
  }
  function renderNodes(nodes, scope, out) { for (var i = 0; i < nodes.length; i++) renderNode(nodes[i], scope, out); }
  function renderNode(n, scope, out) {
    if (n.nodeType === 3) { out.push(document.createTextNode(interp(n.data, scope))); return; }
    if (n.nodeType !== 1) return;
    var tag = n.localName, m;
    if (tag === 'sc-if') {
      m = (n.getAttribute('value') || '').match(WHOLE);
      if (m ? lookup(m[1], scope) : n.getAttribute('value')) renderNodes(n.childNodes, scope, out);
      return;
    }
    if (tag === 'sc-for') {
      m = (n.getAttribute('list') || '').match(WHOLE);
      var list = (m ? lookup(m[1], scope) : null) || [], as = n.getAttribute('as') || 'item';
      list.forEach(function (it, i) { var s = Object.create(scope); s[as] = it; s.$index = i; renderNodes(n.childNodes, s, out); });
      return;
    }
    var el = n.cloneNode(false);
    Array.prototype.slice.call(n.attributes).forEach(function (a) {
      var name = a.name.toLowerCase();
      if (name.indexOf('hint-') === 0) { el.removeAttribute(a.name); return; }
      if (EV[name]) {
        el.removeAttribute(a.name);
        var mm = a.value.match(WHOLE), fn = mm && lookup(mm[1], scope);
        if (typeof fn === 'function') { var id = 'h' + (hid++); handlers.set(id, fn); el.setAttribute('data-on-' + EV[name], id); }
        return;
      }
      if (a.value.indexOf('{{') !== -1) el.setAttribute(a.name, interp(a.value, scope));
    });
    var kids = [];
    renderNodes(n.childNodes, scope, kids);
    kids.forEach(function (k) { el.appendChild(k); });
    out.push(el);
  }

  function render() {
    handlers = new Map(); hid = 0;
    var vals = inst.renderVals();
    var out = []; renderNodes(tpl.childNodes, vals, out);
    var next = document.createElement('div');
    out.forEach(function (o) { next.appendChild(o); });
    morphdom(app, next, {
      childrenOnly: true,
      onBeforeElUpdated: function (from, to) {
        if (from.tagName === 'INPUT' && to.hasAttribute('value')) from.value = to.getAttribute('value');
        return true;
      }
    });
  }

  ['click', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'input'].forEach(function (type) {
    app.addEventListener(type, function (e) {
      var el = e.target;
      while (el && el !== app) {
        if (el.nodeType === 1 && el.hasAttribute('data-on-' + type)) {
          var fn = handlers.get(el.getAttribute('data-on-' + type));
          if (fn) {
            var target = el;
            fn(new Proxy(e, { get: function (t, k) { if (k === 'currentTarget') return target; var v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } }));
          }
          return;
        }
        el = el.parentNode;
      }
    });
  });

  function fit() {
    var pad = embed ? 0 : 32;
    var s = Math.min(1, (window.innerWidth - pad) / W, (window.innerHeight - pad) / H);
    app.style.transform = 'scale(' + s + ')';
    var frame = app.parentNode;
    frame.style.width = W * s + 'px';
    frame.style.height = H * s + 'px';
  }
  render();
  if (inst.componentDidMount) inst.componentDidMount();
  fit();
  window.addEventListener('resize', fit);
})();
