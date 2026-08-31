/* ============================================================================
   Orinda Labs — site.js
   No dependencies, no trackers, no network calls.
   ============================================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Theme toggle ------------------------------------------------------ */
  var tbtn = document.querySelector('.theme-btn');
  if (tbtn) {
    tbtn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      if (!cur) {
        cur = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('orinda-theme', next); } catch (e) {}
    });
  }

  /* ---- Sticky header ----------------------------------------------------- */
  var head = document.querySelector('.site-head');
  if (head) {
    var tick = false;
    window.addEventListener('scroll', function () {
      if (tick) return;
      tick = true;
      requestAnimationFrame(function () {
        head.classList.toggle('stuck', (window.scrollY || 0) > 8);
        tick = false;
      });
    }, { passive: true });
  }

  /* ---- Mobile nav -------------------------------------------------------- */
  var ntog = document.querySelector('.nav-toggle');
  if (ntog && head) {
    ntog.addEventListener('click', function () {
      var open = head.classList.toggle('open');
      ntog.setAttribute('aria-expanded', String(open));
    });
  }

  /* ---- Scroll reveal ----------------------------------------------------- */
  var rises = document.querySelectorAll('.rise');
  Array.prototype.forEach.call(rises, function (el, n) {
    if (!el.style.getPropertyValue('--i')) el.style.setProperty('--i', (n % 6));
  });
  if (!('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(rises, function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    Array.prototype.forEach.call(rises, function (el) { io.observe(el); });

    /* Safety net — nothing may stay invisible because an observer stalled. */
    window.addEventListener('load', function () {
      setTimeout(function () {
        Array.prototype.forEach.call(rises, function (el) {
          var r = el.getBoundingClientRect();
          if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('in');
        });
      }, 4000);
    });
  }

  /* ---- Hero motion graphic ----------------------------------------------
     A venue floor. Neutral dots are people moving about; the graphic never
     "lights up" anyone on its own. When two come close, a consent ring opens
     between them and — only then — a warm consented moment forms and travels
     to the AI layer at the edge. Everything else stays dim, on purpose: the
     picture has to match the product, which captures only what is consented.
     ------------------------------------------------------------------------ */
  var cv = document.getElementById('floor');
  if (cv && !reduced) {
    var ctx = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, people = [], moments = [], raf = 0, onScreen = true;

    function ink() {
      var cs = getComputedStyle(document.documentElement);
      var read = function (n, fb) { return (cs.getPropertyValue(n) || fb).trim(); };
      return {
        dim: read('--muted', '#6f6e65'),
        brand: read('--brand', '#cc785c'),
        blue: read('--orinda-blue', '#1B4FA0'),
        ok: read('--ok', '#3d7a5d')
      };
    }
    var C = ink();

    function seed() {
      var r = cv.getBoundingClientRect();
      W = r.width; H = r.height;
      cv.width = Math.floor(W * dpr);
      cv.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var n = Math.round(Math.min(78, Math.max(22, (W * H) / 11000)));
      people = [];
      for (var i = 0; i < n; i++) {
        people.push({
          x: Math.random() * W,
          y: Math.random() * H,
          a: Math.random() * Math.PI * 2,
          sp: 0.10 + Math.random() * 0.16,
          cool: Math.random() * 220
        });
      }
      moments = [];
      C = ink();
    }

    /* The AI layer sits at the right edge — where consented moments land. */
    function hub() { return { x: W * 0.9, y: H * 0.5 }; }

    function step() {
      ctx.clearRect(0, 0, W, H);
      var h = hub(), i, j, p, q;

      /* Wander */
      for (i = 0; i < people.length; i++) {
        p = people[i];
        p.a += (Math.random() - 0.5) * 0.16;
        p.x += Math.cos(p.a) * p.sp;
        p.y += Math.sin(p.a) * p.sp;
        if (p.x < 8) { p.x = 8; p.a = Math.PI - p.a; }
        if (p.x > W - 8) { p.x = W - 8; p.a = Math.PI - p.a; }
        if (p.y < 8) { p.y = 8; p.a = -p.a; }
        if (p.y > H - 8) { p.y = H - 8; p.a = -p.a; }
        if (p.cool > 0) p.cool--;
      }

      /* A conversation starts only when two people are genuinely close. */
      for (i = 0; i < people.length; i++) {
        p = people[i];
        if (p.cool > 0) continue;
        for (j = i + 1; j < people.length; j++) {
          q = people[j];
          if (q.cool > 0) continue;
          var dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
          if (d2 > 2500) continue;                       /* 50px */
          p.cool = q.cool = 300;
          moments.push({
            x: (p.x + q.x) / 2, y: (p.y + q.y) / 2,
            t: 0, ax: p.x, ay: p.y, bx: q.x, by: q.y
          });
          break;
        }
      }

      /* Neutral crowd */
      ctx.fillStyle = C.dim;
      ctx.globalAlpha = 0.34;
      for (i = 0; i < people.length; i++) {
        p = people[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* Consented moments: ring opens, then the moment travels to the AI layer */
      for (i = moments.length - 1; i >= 0; i--) {
        var m = moments[i];
        m.t += 1;

        if (m.t < 46) {
          /* Consent ring between the two people */
          var g = m.t / 46;
          ctx.strokeStyle = C.ok;
          ctx.globalAlpha = 0.55 * (1 - g) + 0.2;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 4 + g * 16, 0, Math.PI * 2);
          ctx.stroke();

          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          ctx.moveTo(m.ax, m.ay);
          ctx.lineTo(m.bx, m.by);
          ctx.stroke();
        } else if (m.t < 150) {
          /* Travel to the AI layer */
          var t = (m.t - 46) / 104;
          var e = 1 - Math.pow(1 - t, 3);
          var cx = m.x + (h.x - m.x) * e;
          var cy = m.y + (h.y - m.y) * e - Math.sin(e * Math.PI) * 26;

          ctx.strokeStyle = C.brand;
          ctx.globalAlpha = 0.22 * (1 - t);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(cx, cy);
          ctx.stroke();

          ctx.fillStyle = C.brand;
          ctx.globalAlpha = 0.9 * (1 - t * 0.5);
          ctx.beginPath();
          ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          moments.splice(i, 1);
          continue;
        }
      }
      ctx.globalAlpha = 1;

      /* The AI layer itself */
      var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 900);
      ctx.strokeStyle = C.blue;
      ctx.globalAlpha = 0.16 + pulse * 0.12;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 22 + pulse * 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = C.blue;
      ctx.globalAlpha = 0.55 + pulse * 0.25;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(step);
    }

    function play() { if (!raf) raf = requestAnimationFrame(step); }
    function pause() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    seed();
    play();

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(seed, 160);
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        onScreen = es[0].isIntersecting;
        if (onScreen && !document.hidden) play(); else pause();
      }, { threshold: 0 }).observe(cv);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden || !onScreen) pause(); else play();
    });

    /* Re-read tokens when the theme flips. */
    if (tbtn) tbtn.addEventListener('click', function () { setTimeout(function () { C = ink(); }, 30); });
  }

  /* ---- Footer year ------------------------------------------------------- */
  var y = document.querySelector('.yr');
  if (y) y.textContent = String(new Date().getFullYear());
})();
