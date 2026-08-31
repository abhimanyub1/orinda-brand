/* ═══════════════════════════════════════════════════════════════════
   Orinda Labs — main.js
   No dependencies. Everything degrades gracefully without JS.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Theme toggle ─────────────────────────────────────────────── */
  var toggle = document.getElementById('themetoggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('orinda-theme', next); } catch (e) {}
    });
  }

  /* ── Sticky nav + scroll progress ─────────────────────────────── */
  var nav = document.getElementById('nav');
  var progress = document.getElementById('progress');
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY || 0;
      if (nav) nav.classList.toggle('is-stuck', y > 12);
      if (progress) {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.transform = 'scaleX(' + (max > 0 ? y / max : 0) + ')';
      }
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── Mobile menu ──────────────────────────────────────────────── */
  var burger = document.getElementById('burger');
  var menu = document.getElementById('mobilemenu');
  if (burger && menu && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.hidden = !open;
    });
    menu.addEventListener('click', function (e) {
      if (e.target.tagName !== 'A') return;
      nav.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      menu.hidden = true;
    });
  }

  /* ── Scroll reveal ────────────────────────────────────────────── */
  var revealables = document.querySelectorAll('.reveal');
  Array.prototype.forEach.call(revealables, function (el) {
    if (el.dataset.delay) el.style.setProperty('--rd', el.dataset.delay);
  });

  if (!('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(revealables, function (el) { el.classList.add('is-visible'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    Array.prototype.forEach.call(revealables, function (el) { io.observe(el); });

    /* Safety net: anything still hidden 4s after load gets shown anyway, so a
       stalled observer can never leave a section permanently invisible. */
    window.addEventListener('load', function () {
      setTimeout(function () {
        Array.prototype.forEach.call(revealables, function (el) {
          var r = el.getBoundingClientRect();
          if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('is-visible');
        });
      }, 4000);
    });
  }

  /* ── Animated counters ────────────────────────────────────────── */
  function formatNumber(value, decimals) {
    if (decimals) return value.toFixed(decimals);
    return Math.round(value).toLocaleString('en-US');
  }

  function runCounter(el) {
    var target = parseFloat(el.dataset.to);
    var decimals = parseInt(el.dataset.decimals || '0', 10);
    var suffix = el.dataset.suffix || '';
    if (isNaN(target)) return;
    if (reduced) { el.textContent = formatNumber(target, decimals) + suffix; return; }

    var duration = 1800;
    var start = null;
    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatNumber(target * eased, decimals) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  var counters = document.querySelectorAll('.count');
  if (counters.length) {
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(counters, runCounter);
    } else {
      var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          runCounter(entry.target);
          cio.unobserve(entry.target);
        });
      }, { threshold: 0.5 });
      Array.prototype.forEach.call(counters, function (el) { cio.observe(el); });
    }
  }

  /* ── Card pointer glow + subtle tilt ──────────────────────────── */
  if (!reduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    Array.prototype.forEach.call(document.querySelectorAll('.tilt'), function (card) {
      var glow = card.querySelector('.card__glow');
      var raf = 0;

      card.addEventListener('pointermove', function (e) {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          var r = card.getBoundingClientRect();
          var x = e.clientX - r.left;
          var y = e.clientY - r.top;
          if (glow) {
            glow.style.setProperty('--mx', x + 'px');
            glow.style.setProperty('--my', y + 'px');
          }
          var rx = ((y / r.height) - 0.5) * -5;
          var ry = ((x / r.width) - 0.5) * 5;
          card.style.transform =
            'perspective(900px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' +
            ry.toFixed(2) + 'deg) translateY(-4px)';
        });
      });

      card.addEventListener('pointerleave', function () {
        card.style.transform = '';
      });
    });
  }

  /* ── Hero constellation canvas ────────────────────────────────── */
  var canvas = document.getElementById('constellation');
  if (canvas && !reduced) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, nodes = [], animId = 0, visible = true;
    var pointer = { x: -9999, y: -9999 };

    function palette() {
      var light = document.documentElement.dataset.theme === 'light';
      return light
        ? { node: 'rgba(27,79,160,', link: 'rgba(74,155,232,', accent: 'rgba(232,112,58,' }
        : { node: 'rgba(160,200,245,', link: 'rgba(74,155,232,', accent: 'rgba(232,112,58,' };
    }

    function seed() {
      var rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var count = Math.round(Math.min(110, Math.max(28, (w * h) / 15000)));
      nodes = [];
      for (var i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: Math.random() * 1.6 + 0.7,
          accent: Math.random() < 0.18
        });
      }
    }

    function draw() {
      var c = palette();
      ctx.clearRect(0, 0, w, h);

      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        n.x += n.vx; n.y += n.vy;
        if (n.x < -20) n.x = w + 20; else if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20; else if (n.y > h + 20) n.y = -20;

        for (var j = i + 1; j < nodes.length; j++) {
          var m = nodes[j];
          var dx = n.x - m.x, dy = n.y - m.y;
          var d2 = dx * dx + dy * dy;
          if (d2 > 20164) continue;              /* 142px linking radius */
          var a = (1 - Math.sqrt(d2) / 142) * 0.30;
          ctx.strokeStyle = c.link + a.toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(m.x, m.y);
          ctx.stroke();
        }

        /* Pointer halo */
        var pdx = n.x - pointer.x, pdy = n.y - pointer.y;
        var pd2 = pdx * pdx + pdy * pdy;
        var near = pd2 < 32400;                   /* 180px */
        if (near) {
          var pa = (1 - Math.sqrt(pd2) / 180) * 0.42;
          ctx.strokeStyle = c.accent + pa.toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        }

        ctx.fillStyle = (n.accent ? c.accent : c.node) + (near ? '0.85' : '0.5') + ')';
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    }

    function start() { if (!animId) animId = requestAnimationFrame(draw); }
    function stop() { if (animId) { cancelAnimationFrame(animId); animId = 0; } }

    seed();
    start();

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(seed, 180);
    });

    window.addEventListener('pointermove', function (e) {
      var rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    }, { passive: true });

    window.addEventListener('pointerleave', function () {
      pointer.x = pointer.y = -9999;
    });

    /* Pause when the hero scrolls out of view or the tab is hidden. */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible && !document.hidden) start(); else stop();
      }, { threshold: 0 }).observe(canvas);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden || !visible) stop(); else start();
    });
  }

  /* ── Contact form (AJAX, with a graceful non-JS fallback) ─────── */
  var form = document.getElementById('contactform');
  var status = document.getElementById('formstatus');
  if (form && status) {
    form.addEventListener('submit', function (e) {
      if (form.action.indexOf('FORM_ENDPOINT') !== -1) {
        e.preventDefault();
        status.className = 'form__status is-err';
        status.textContent =
          'Form endpoint is not configured yet — please email hello@orindalabs.com.';
        return;
      }

      e.preventDefault();
      var button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      status.className = 'form__status';
      status.textContent = 'Sending…';

      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Request failed');
          form.reset();
          status.className = 'form__status is-ok';
          status.textContent = 'Thanks — we will be in touch within two business days.';
        })
        .catch(function () {
          status.className = 'form__status is-err';
          status.textContent =
            'Something went wrong. Please email hello@orindalabs.com instead.';
        })
        .finally(function () {
          if (button) button.disabled = false;
        });
    });
  }

  /* ── Footer year ──────────────────────────────────────────────── */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
