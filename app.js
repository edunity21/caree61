/* ============================================================
   진로전담교사 심층면접 66문항 — 동작
   data.js 의 ITEMS / AREAS 를 읽어 목록·상세·낭독·타이머를 담당합니다.
   ============================================================ */
(function () {
  "use strict";

  var BUILD = "v18";
  var $ = function (id) { return document.getElementById(id); };
  try { console.log("진로전담교사 심층면접 · build " + BUILD + " · " + ITEMS.length + "문항"); } catch (e) {}
  var state = { grade: "all", area: "all", q: "", cur: null, done: loadDone() };

  /* ── 저장 ─────────────────────────────────────────── */
  function loadDone() {
    try { return JSON.parse(localStorage.getItem("jinro36.done") || "[]"); }
    catch (e) { return []; }
  }
  function saveDone() {
    try { localStorage.setItem("jinro36.done", JSON.stringify(state.done)); }
    catch (e) { /* 저장이 막힌 환경에서도 학습은 계속됩니다 */ }
  }
  function isDone(no) { return state.done.indexOf(no) > -1; }

  /* ── 낭독 ─────────────────────────────────────────── */
  var TTS = {
    queue: [], idx: 0, on: false, gen: 0, cancelAt: 0, rate: 1, voiceQ: null, voiceA: null,
    onSeg: null, onDone: null, watch: null, startWatch: null, keep: null,
    parts: null, fromSeg: 0,

    /* ── 발음이 뭉개지지 않게 하는 장치 ────────────────────
       배속을 올리면 음성 엔진은 글자를 그대로 빨리 읽는 것이 아니라
       음을 줄여 붙입니다. 아래 셋이 또렷함을 좌우합니다.
         ① 읽히는 문장 자체를 다듬을 것   ② 조각을 적절한 길이로 끊을 것
         ③ 기기에 설치된 음성을 쓸 것                                  */

    /* ① 낭독 전용 다듬기 — 화면 글자는 그대로 두고 읽는 문장만 손봅니다.
       낫표는 엔진에 따라 이름을 그대로 읽거나 그 자리에서 발음을 끊습니다.
       가운뎃점은 배속이 올라가면 앞뒤 낱말이 한 낱말로 뭉치므로 쉼표로 바꿉니다. */
    speech: function (text) {
      return String(text)
        /* 괄호 안의 원어는 소리로 들으면 흐름만 끊습니다. 한국어 설명만 남깁니다. */
        .replace(/\(\s*[A-Za-z][A-Za-z\s.'-]*\)/g, "")
        /* 괄호 안이 우리말이면 뜻이 담겨 있으므로 쉼표로 바꿔 살려 둡니다.
           단, 닫는 괄호 뒤에 조사가 붙어 있으면 쉼표를 넣지 않습니다.
           "집단상담(집단지도)의" 가 "집단지도, 의" 로 끊기면 조사가 홀로 남습니다. */
        .replace(/\s*\(\s*/g, ", ")
        .replace(/\s*\)(?=[가-힣])/g, "")
        .replace(/\s*\)/g, ",")
        /* 따옴표·낫표는 지우되 자리를 비우지 않습니다.
           공백을 남기면 "진로교육법 에"처럼 조사가 떨어져 어색하게 끊깁니다. */
        .replace(/[「」『』〈〉《》""'']/g, "")
        /* 가운뎃점 — 두 가지를 나누어 다룹니다.
           "중·고등학교" "시·도교육청" "서·논술형" 처럼 앞이 한 글자면 줄임말이므로
           사람이 읽듯 붙여 읽습니다. 쉼표를 넣으면 없는 곳에서 끊어집니다.
           "진로·진학" 처럼 낱말이 나열된 경우에만 쉼표로 바꿔 뭉치지 않게 합니다. */
        .replace(/(^|[\s,.(])([가-힣])·(?=[가-힣])/g, "$1$2")
        .replace(/(^|[\s,.(])([가-힣]{2})·(?=[가-힣])/g, function (m, a, b) {
          return /^(초중|중고)$/.test(b) ? a + b : m;    /* "초·중·고" 처럼 이어진 경우 */
        })
        .replace(/\s*·\s*/g, ", ")
        .replace(/\s*,(\s*[,.!?])/g, "$1")
        .replace(/\s+([,.!?])/g, "$1")
        .replace(/\s{2,}/g, " ")
        .replace(/^[\s,]+/, "")
        .trim();
    },

    /* 실제 낭독 속도를 재 둡니다. 음성마다 배속 반응이 달라서,
       재 보지 않으면 조각 길이도 감시 시간도 어림짐작이 됩니다. */
    meas: {},
    record: function (r, len, ms) {
      if (ms < 1200 || len < 20) return;   /* 너무 짧은 조각은 오차가 큽니다 */
      var k = r.toFixed(2), m = this.meas[k] || (this.meas[k] = { n: 0, cps: 0 });
      var c = len / (ms / 1000);
      m.cps = m.n ? (m.cps * m.n + c) / (m.n + 1) : c;
      m.n++;
      if (typeof this.onMeas === "function") this.onMeas();
    },
    /* 배속을 걸지 않았을 때의 속도. 가장 낮은 배속에서 잰 값을 기준으로 삼습니다. */
    baseCps: function () {
      var best = null;
      for (var k in this.meas) {
        if (this.meas[k].n < 1) continue;
        var r = parseFloat(k);
        if (!best || r < best.r) best = { r: r, cps: this.meas[k].cps };
      }
      return best ? best.cps / best.r : 4.6;
    },
    cpsFor: function (r) {
      var m = this.meas[r.toFixed(2)];
      if (m && m.n >= 1) return m.cps;
      return this.baseCps() * r;
    },
    /* 요청한 배속이 실제로 나오는지. 엔진이 상한을 두면 여기서 드러납니다. */
    effective: function (r) {
      var m = this.meas[r.toFixed(2)];
      if (!m || m.n < 1) return null;
      var base = this.baseCps();
      return base > 0 ? m.cps / base : null;
    },

    pickVoices: function () {
      if (!window.speechSynthesis) return;
      var v = speechSynthesis.getVoices().filter(function (x) {
        return /ko(-|_)?KR/i.test(x.lang) || /Korean|한국/i.test(x.name);
      });
      if (!v.length) return;
      /* ③ 빠른 배속에서는 기기에 설치된 음성이 훨씬 또렷합니다.
         내려받아 재생하는 음성은 배속을 올리면 끊기거나 뭉개집니다. */
      var local = v.filter(function (x) { return x.localService; });
      var pool = (this.rate >= 1.5 && local.length) ? local : v;
      var male = pool.filter(function (x) { return /InJoon|Male|남/i.test(x.name); });
      var female = pool.filter(function (x) { return /SunHi|Female|여|Yuna/i.test(x.name); });
      this.voiceQ = male[0] || pool[0];
      this.voiceA = female[0] || pool[pool.length - 1] || pool[0];
      this.list = v;
      this.hasLocal = local.length > 0;
      var sel = $("voice");
      if (sel && sel.options.length !== v.length + 1) {
        var cur = sel.value;
        sel.innerHTML = '<option value="">기본 음성</option>';
        v.forEach(function (x, i) {
          var o = document.createElement("option");
          o.value = String(i); o.textContent = x.name.replace(/Microsoft |Google /, "");
          sel.appendChild(o);
        });
        sel.value = cur;
      }
    },

    /* ② 조각 길이는 글자 수가 아니라 걸리는 시간으로 정합니다.
       한 발화가 15초쯤을 넘으면 크롬이 중간에 잘라 버리고,
       반대로 너무 짧게 끊으면 이음매마다 끝음절이 씹힙니다.
       배속이 오르면 같은 글자 수가 짧은 시간에 끝나므로 조각을 길게 잡습니다. */
    chunk: function (text) {
      text = this.speech(text);
      var cps = Math.max(this.cpsFor(this.rate), 2);
      /* 문장을 이어 붙이는 기준은 11초, 쉼표에서 강제로 자르는 한계는 14초입니다.
         한 발화가 15초를 넘으면 크롬이 도중에 끊어 버립니다. */
      var LIM = Math.max(50, Math.min(140, Math.round(11 * cps)));
      var HARD = Math.max(64, Math.min(170, Math.round(14 * cps)));
      var raw = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
      var sentences = [];
      raw.forEach(function (s) {                    /* 긴 문장은 쉼표에서 한 번 더 */
        if (s.length <= HARD) { sentences.push(s); return; }
        var b = "";
        s.split(/,\s*/).forEach(function (p, i, arr) {
          p = p + (i < arr.length - 1 ? "," : "");
          if (b && (b + p).length > LIM) { sentences.push(b); b = p; } else { b += p; }
        });
        if (b) sentences.push(b);
      });
      var out = [], buf = "";
      sentences.forEach(function (s) {
        s = s.trim(); if (!s) return;
        if (buf && (buf + " " + s).length > LIM) { out.push(buf); buf = s; }
        else buf = buf ? buf + " " + s : s;
      });
      if (buf) out.push(buf);

      /* 쉼표가 없는 긴 구절은 위에서 잘리지 않습니다.
         마지막으로 낱말 사이에서만 끊어 한계 안에 들여놓습니다. 낱말 중간은 자르지 않습니다. */
      var safe = [];
      out.forEach(function (s) {
        while (s.length > HARD) {
          var cut = s.lastIndexOf(" ", HARD);
          if (cut < HARD * 0.5) cut = s.indexOf(" ", HARD);   /* 띄어쓰기가 드물면 뒤쪽에서 */
          if (cut < 0) break;
          safe.push(s.slice(0, cut));
          s = s.slice(cut + 1);
        }
        if (s) safe.push(s);
      });
      return safe;
    },

    /* 한 구간의 예상 낭독 시간. 감시 타이머는 이 값을 넘길 때만 개입합니다.
       엔진이 배속 상한을 두면 요청한 배속보다 느리게 읽으므로,
       실제로 재 둔 속도를 씁니다. 어림짐작하면 아직 읽는 중인데 넘겨 버립니다. */
    est: function (text) {
      var cps = Math.max(this.cpsFor(this.rate), 2);
      return Math.max(3500, (text.length / cps) * 1000 + 3500);
    },

    /* 재생 세대(gen)를 하나 올려, 이전 발화가 뒤늦게 돌려주는 onend·onerror 를
       모두 무효로 만듭니다. 연속 재생이 두 갈래로 갈라져 겹쳐 읽히던 원인입니다. */
    reset: function () {
      this.gen++;
      this.on = false;
      this.onDone = null;
      clearTimeout(this.watch);
      clearTimeout(this.startWatch);
      this.keepAlive(false);
    },

    /* 크롬은 resume() 이 지금 읽던 구간을 처음부터 다시 읽어 버리는 경우가 있습니다.
       그래서 재생 중에는 건드리지 않고, 완전히 멎어 있을 때만 한 번 풀어 줍니다. */
    keepAlive: function (on) {
      var self = this;
      if (this.keep) { clearInterval(this.keep); this.keep = null; }
      if (!on || !window.speechSynthesis) return;
      this.keep = setInterval(function () {
        if (!self.on) { clearInterval(self.keep); self.keep = null; return; }
        if (document.hidden) return;
        try {
          if (speechSynthesis.paused && !speechSynthesis.speaking) speechSynthesis.resume();
        } catch (e) { /* noop */ }
      }, 10000);
    },

    /* parts: [{text, who:'q'|'a', seg:index|null}] */
    play: function (parts, onSeg, onDone) {
      if (!window.speechSynthesis) {
        alert("이 브라우저는 읽어주기를 지원하지 않습니다. 크롬이나 사파리 최신 버전을 사용해 주십시오.");
        return;
      }
      var busy = false;
      try { busy = speechSynthesis.speaking || speechSynthesis.pending; } catch (e) { /* noop */ }

      this.reset();                      /* reset 이 onDone 을 지우므로 그 뒤에 설정합니다 */
      if (busy) {
        try { speechSynthesis.cancel(); } catch (e) { /* noop */ }
        this.cancelAt = Date.now();
      }
      /* 취소 직후의 speak() 는 크롬에서 소리 없이 무시됩니다. 잠깐 두었다 시작합니다. */
      var gap = (Date.now() - (this.cancelAt || 0)) < 400;

      this.parts = parts;
      this.onSeg = onSeg || null;
      this.onDone = (typeof onDone === "function") ? onDone : null;
      var self = this, myGen = this.gen;
      this.queue = [];
      parts.forEach(function (p) {
        self.chunk(p.text).forEach(function (t, i, arr) {
          self.queue.push({ text: t, who: p.who, seg: p.seg, last: i === arr.length - 1 });
        });
      });
      this.idx = 0; this.on = true;
      showSpeaking(true);
      this.keepAlive(true);

      /* 취소가 있었으면 조금 두었다 시작합니다 */
      if (gap) setTimeout(function () { if (self.gen === myGen) self.next(); }, 180);
      else this.next();
    },

    next: function () {
      if (!this.on) return;
      var self = this, myGen = this.gen;

      if (this.idx >= this.queue.length) {          /* 자연 종료 — 완료 콜백을 넘겨 줍니다 */
        var done = this.onDone;
        this.finish();
        if (typeof done === "function") done();
        return;
      }

      var item = this.queue[this.idx], myIdx = this.idx, moved = false, started = false;
      var retried = false, holds = 0, t0 = 0;

      function talking() {
        try { return speechSynthesis.speaking || speechSynthesis.pending; } catch (e) { return false; }
      }

      function advance(delay) {
        if (moved || self.gen !== myGen || !self.on) return;   /* 지난 재생의 신호는 버립니다 */
        moved = true;
        clearTimeout(self.watch);
        clearTimeout(self.startWatch);
        self.idx = myIdx + 1;
        setTimeout(function () { if (self.gen === myGen) self.next(); }, delay);
      }

      /* 감시 타이머가 울려도 아직 말하는 중이면 기다립니다.
         여기서 그냥 넘어가면 앞 구간과 뒤 구간이 겹쳐 들립니다. */
      function onWatch() {
        if (moved || self.gen !== myGen) return;
        if (talking() && holds < 3) {
          holds++;
          self.watch = setTimeout(onWatch, 5000);
          return;
        }
        if (talking()) { try { speechSynthesis.cancel(); } catch (e) { /* noop */ } }
        advance(140);
      }

      function armWatch() {                 /* 실제로 말을 시작한 뒤부터 시간을 잽니다 */
        started = true;
        clearTimeout(self.startWatch);
        clearTimeout(self.watch);
        self.watch = setTimeout(onWatch, self.est(item.text));
      }

      function build() {
        var u = new SpeechSynthesisUtterance(item.text);
        u.lang = "ko-KR";
        u.rate = self.rate;
        /* 배속을 올리면 소리가 가늘어져 자음이 묻힙니다.
           음높이를 아주 조금 낮추면 같은 속도에서도 또렷하게 들립니다. */
        var base = item.who === "q" ? 0.95 : 1.02;
        u.pitch = self.rate >= 1.5 ? base - 0.05 : base;
        var v = item.who === "q" ? self.voiceQ : self.voiceA;
        if (v) u.voice = v;
        u.onstart = function () { if (self.gen === myGen) { t0 = Date.now(); armWatch(); } };
        u.onend = function () {
          if (t0) { self.record(self.rate, item.text.length, Date.now() - t0); t0 = 0; }
          advance(item.last ? 260 : 110);
        };
        u.onerror = function (e) {
          var why = e && e.error;
          if (why === "interrupted" || why === "canceled") return;  /* 우리가 멈춘 것입니다 */
          advance(110);
        };
        return u;
      }

      if (this.onSeg) this.onSeg(item.seg);

      /* 소리가 시작되지 않을 때만 다시 요청합니다.
         같은 발화를 취소 없이 두 번 speak() 하면 브라우저 큐에 둘 다 남아
         그 구간이 두 번 읽힙니다. 반드시 cancel() 로 숨은 것을 지운 뒤,
         새 발화 객체로 한 번만 다시 겁니다. */
      this.startWatch = setTimeout(function () {
        if (self.gen !== myGen || started || moved) return;
        if (talking()) { armWatch(); return; }     /* onstart 를 주지 않는 브라우저 */
        if (retried) { advance(80); return; }
        retried = true;
        try { speechSynthesis.cancel(); } catch (e) { /* noop */ }
        setTimeout(function () {
          if (self.gen !== myGen || started || moved) return;
          try { speechSynthesis.speak(build()); } catch (e) { /* noop */ }
          self.startWatch = setTimeout(function () {
            if (self.gen !== myGen || started || moved) return;
            if (talking()) armWatch(); else advance(80);
          }, 3200);
        }, 140);
      }, 2800);

      /* 사파리는 사용자 조작과 같은 흐름에서 speak() 해야 소리가 납니다.
         setTimeout 으로 미루지 않습니다. */
      try { speechSynthesis.speak(build()); } catch (e) { advance(80); }
    },

    /* 큐를 끝까지 읽고 스스로 끝난 경우. cancel() 을 부르지 않습니다 —
       바로 뒤에 이어지는 다음 재생이 통째로 무시되는 원인이었습니다. */
    finish: function () {
      this.reset();
      if (this.onSeg) this.onSeg(null);
      showSpeaking(false);
    },

    /* 사용자·화면이 부르는 정지.
       speaking 이 false 로 보여도 큐에 남아 있을 수 있으므로 반드시 취소합니다.
       (이걸 건너뛰면 정지를 눌러도 남은 구간이 뒤늦게 터져 나옵니다.) */
    stop: function () {
      this.reset();
      if (window.speechSynthesis) {
        try { speechSynthesis.cancel(); } catch (e) { /* noop */ }
        this.cancelAt = Date.now();
      }
      if (this.onSeg) this.onSeg(null);
      showSpeaking(false);
    }
  };
  if (window.speechSynthesis) {
    TTS.pickVoices();
    speechSynthesis.onvoiceschanged = function () { TTS.pickVoices(); };
  }
  function showSpeaking(on) {
    $("speaking").hidden = !on;
  }

  /* ── 타이머 ───────────────────────────────────────── */
  var Timer = { id: null, left: 0, total: 0, warned: false };

  function chime(times) {                       /* 실제 전형의 타종을 대신하는 신호음 */
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      for (var i = 0; i < times; i++) {
        var o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.5;
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
        o.start(t); o.stop(t + 0.4);
      }
    } catch (e) { /* 소리를 낼 수 없는 환경에서는 화면 표시로 대신합니다 */ }
  }
  function timerStop() {
    if (Timer.id) { clearInterval(Timer.id); Timer.id = null; }
    $("timerBtn").textContent = labelFor();
    $("timer").hidden = true;
    document.body.classList.remove("is-timing");
  }
  function labelFor() {
    var v = parseInt($("thinkSec").value, 10);
    return "⏱ " + (v >= 60 ? Math.floor(v / 60) + "분" + (v % 60 ? " " + (v % 60) + "초" : "") : v + "초") + " 시작";
  }

  function timerStart() {
    timerStop();
    Timer.warned = false;
    Timer.total = Timer.left = parseInt($("thinkSec").value, 10);
    $("timer").hidden = false;
    $("timerBtn").textContent = "⏱ 중지";
    document.body.classList.add("is-timing");
    paintTimer();
    Timer.id = setInterval(function () {
      Timer.left--;
      paintTimer();
      if (Timer.left === 30 && Timer.total > 60 && !Timer.warned) { Timer.warned = true; chime(1); }
      if (Timer.left <= 0) {
        chime(2);
        timerStop();
        $("timer").hidden = false;
        document.body.classList.add("is-timing");
        $("timerNum").textContent = "0:00";
        $("timerFill").style.width = "0%";
      }
    }, 1000);
  }
  function paintTimer() {
    var m = Math.floor(Timer.left / 60), s = Timer.left % 60;
    $("timerNum").textContent = m + ":" + (s < 10 ? "0" : "") + s;
    $("timerFill").style.width = (Timer.left / Timer.total * 100) + "%";
    $("timerFill").className = Timer.left <= 10 ? "is-low" : "";
  }

  /* ── 목록 ─────────────────────────────────────────── */
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return ITEMS.filter(function (it) {
      if (state.grade === "fresh") { if (!it.fresh) return false; }
      else if (state.grade !== "all" && it.grade !== state.grade) return false;
      if (state.area !== "all" && it.area !== state.area) return false;
      if (!q) return true;
      var hay = [it.slug, it.kind, it.area, it.prompt, it.fresh || "",
        it.subs.join(" "), it.keywords.join(" ")].join(" ").toLowerCase();
      return hay.indexOf(q) > -1;
    });
  }

  function renderChips() {
    var box = $("areaChips");
    box.innerHTML = "";
    var all = ["all"].concat(AREAS);
    all.forEach(function (a) {
      var b = document.createElement("button");
      b.className = "chip" + (state.area === a ? " is-on" : "");
      b.textContent = a === "all" ? "모든 영역" : a;
      b.onclick = function () { state.area = a; renderChips(); renderList(); };
      box.appendChild(b);
    });
  }

  function renderList() {
    var box = $("cards"), list = filtered();
    box.innerHTML = "";
    $("empty").hidden = list.length > 0;
    list.forEach(function (it) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.className = "card" + (it.grade === "S" ? " is-s" : "") +
        (state.cur && state.cur.no === it.no ? " is-on" : "");
      b.innerHTML =
        '<div class="card__top">' +
          '<span class="card__no">' + pad(it.no) + '</span>' +
          '<span class="card__grade">' + it.grade + '</span>' +
          (isDone(it.no) ? '<span class="card__done">✓</span>' : '') +
        '</div>' +
        '<div class="card__title"></div>' +
        '<div class="card__kind">' + it.kind + " · " + it.area + '</div>' +
        (it.fresh ? '<span class="card__fresh">최신 반영</span>' : '');
      b.querySelector(".card__title").textContent = it.slug;
      b.onclick = function () { open(it); };
      li.appendChild(b);
      box.appendChild(li);
    });
    $("progressNum").textContent = state.done.length;
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ── 상세 ─────────────────────────────────────────── */
  var openedByAuto = false;
  function open(it) {
    if (!openedByAuto) autoStop();          /* 목록·이전·다음으로 직접 옮기면 연속 재생 종료 */
    TTS.stop(); timerStop();
    state.cur = it;
    document.body.classList.add("is-detail");
    $("welcome").hidden = true;
    $("q").hidden = false;

    $("qGrade").textContent = it.grade === "S" ? "S 반드시 준비" : "A 준비 권장";
    $("qGrade").className = "badge" + (it.grade === "S" ? " is-s" : "");
    $("qKind").textContent = it.kind;
    $("qArea").textContent = it.area;
    $("qNo").textContent = pad(it.no);
    $("qTitle").textContent = it.slug;
    $("qFresh").hidden = !it.fresh;
    if (it.fresh) $("qFresh").textContent = it.fresh;
    $("qPrompt").textContent = it.prompt;

    ["qRubric", "qPitfall", "qEvidence"].forEach(function (id, k) {
      var box = $(id); if (!box) return;
      box.innerHTML = "";
      var src = k === 0 ? it.rubric : (k === 1 ? it.pitfall : it.evidence);
      (src || []).forEach(function (x) {
        var li = document.createElement("li"); li.textContent = x; box.appendChild(li);
      });
    });

    var fc = $("qFocus"); fc.innerHTML = "";
    (it.focus || []).forEach(function (f) {
      var li = document.createElement("li"); li.textContent = f; fc.appendChild(li);
    });

    var subs = $("qSubs"); subs.innerHTML = "";
    it.subs.forEach(function (s) {
      var li = document.createElement("li"); li.textContent = s; subs.appendChild(li);
    });

    var kw = $("qKw"); kw.innerHTML = "";
    it.keywords.forEach(function (k) {
      var li = document.createElement("li"); li.textContent = k; kw.appendChild(li);
    });
    kw.hidden = true;
    $("kwToggle").hidden = false;
    $("kwToggle").setAttribute("aria-expanded", "false");

    $("ansBody").hidden = true;
    $("ansToggle").hidden = false;
    $("ansToggle").setAttribute("aria-expanded", "false");

    /* 발화 시간 막대 */
    var rib = $("ribbon"); rib.innerHTML = "";
    it.answer.forEach(function (a, i) {
      var s = document.createElement("span");
      s.style.flex = a.sec;
      s.className = "is-" + Math.min(i + 1, 3);
      s.dataset.seg = i;
      rib.appendChild(s);
    });
    var m = Math.floor(it.total_sec / 60), s2 = it.total_sec % 60;
    $("totalSec").textContent = m + "분 " + (s2 ? s2 + "초" : "") + " 기준";

    /* 답안 구간 */
    var segs = $("segs"); segs.innerHTML = "";
    it.answer.forEach(function (a, i) {
      var b = document.createElement("button");
      b.className = "seg"; b.dataset.seg = i;
      b.innerHTML =
        '<div class="seg__head">' +
          '<span class="seg__label">' + a.label + '</span>' +
          '<span class="seg__sec">' + a.sec + '초</span>' +
          (a.sub ? '<span class="seg__sub">질문 ' + a.sub + '</span>' : '') +
        '</div><p class="seg__text"></p>';
      b.querySelector(".seg__text").textContent = a.text;
      b.onclick = function () {
        if (Auto.on) {                  /* 연속 재생 중이면 그 구간부터 이어 갑니다 */
          autoLabel(it, "모범답안");
          readAnswer(i, function () { if (Auto.on) autoNext(); });
        } else {
          readAnswer(i);
        }
      };
      segs.appendChild(b);
    });

    $("doneBtn").className = "btn" + (isDone(it.no) ? " is-done" : "");
    $("doneBtn").textContent = isDone(it.no) ? "✓ 완료함" : "✓ 연습 완료";
    $("qSrc").textContent = "원본 대응 " + it.source + "  ·  재구성 전 번호 " + it.origin
      + "번  ·  " + ITEMS.length + "문항 " + BUILD;

    renderList();
    $("detailScroll").scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  function markSeg(i) {
    Array.prototype.forEach.call(document.querySelectorAll(".seg"), function (el) {
      el.classList.toggle("is-live", i !== null && +el.dataset.seg === i);
    });
    Array.prototype.forEach.call(document.querySelectorAll("#ribbon span"), function (el) {
      el.classList.toggle("is-live", i !== null && +el.dataset.seg === i);
    });
  }

  function questionParts(it) {
    var parts = [{ text: it.prompt, who: "q", seg: null }];
    it.subs.forEach(function (s) { parts.push({ text: s, who: "q", seg: null }); });
    return parts;
  }
  function answerParts(it, from) {
    from = from || 0;
    return it.answer.slice(from).map(function (a, i) {
      return { text: a.text, who: "a", seg: from + i };
    });
  }
  function readQuestion(onDone) {
    var it = state.cur; if (!it) return;
    TTS.rate = parseFloat($("rate").value);
    TTS.play(questionParts(it), markSeg, onDone);
  }

  function readAnswer(from, onDone) {
    var it = state.cur; if (!it) return;
    showAnswer();
    TTS.rate = parseFloat($("rate").value);
    TTS.play(answerParts(it, from || 0), markSeg, onDone);
  }

  function showAnswer() {
    $("ansBody").hidden = false;
    $("ansToggle").setAttribute("aria-expanded", "true");
  }

  /* ── 연속 재생 ───────────────────────────────────── */
  /* index.html 이 구버전으로 캐시되어도 동작하도록, 컨트롤이 없으면 여기서 만듭니다.
     style.css 까지 구버전인 경우를 대비해 최소 배치는 인라인으로 지정합니다. */
  function ensureAutoBar() {
    if ($("autoBtn")) return true;
    var tools = document.querySelector(".tools");
    if (!tools) return false;
    var bar = document.createElement("div");
    bar.className = "auto";
    bar.setAttribute("style",
      "display:flex;align-items:center;gap:7px;flex-wrap:wrap;" +
      "margin-top:12px;padding-top:12px;border-top:1px dashed #D3DAE2");
    bar.innerHTML =
      '<button class="btn" id="autoBtn">▶ 연속 재생</button>' +
      '<select class="sel" id="autoScope" aria-label="연속 재생 범위">' +
        '<option value="qa" selected>문항 + 답안</option>' +
        '<option value="a">답안만</option>' +
        '<option value="q">문항만</option>' +
      '</select>' +
      '<label class="chk" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#4E5D6B">' +
        '<input type="checkbox" id="autoLoop" style="width:15px;height:15px;margin:0"> 끝나면 처음부터</label>' +
      '<span class="auto__now" id="autoNow" aria-live="polite" ' +
        'style="font-size:11.5px;color:#9C6B1E;margin-left:auto"></span>';
    tools.appendChild(bar);
    return true;
  }
  var AUTO_OK = ensureAutoBar();

  var Auto = { on: false, scope: "qa", loop: false, step: 0 };
  var wakeLock = null;

  function wakeOn() {                       /* 낭독 중 화면이 꺼지면 음성이 끊기므로 */
    try {
      if (navigator.wakeLock && !wakeLock) {
        navigator.wakeLock.request("screen").then(function (s) {
          wakeLock = s;
          s.addEventListener("release", function () { wakeLock = null; });
        }, function () { /* 지원하지 않는 브라우저는 그대로 진행합니다 */ });
      }
    } catch (e) { /* noop */ }
  }
  function wakeOff() {
    try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) { /* noop */ }
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (Auto.on) wakeOn();
    /* 탭이 가려진 동안 크롬이 음성을 일시정지해 둔 경우를 풀어 줍니다. */
    if (TTS.on && window.speechSynthesis) {
      try { if (speechSynthesis.paused) speechSynthesis.resume(); } catch (e) { /* noop */ }
    }
  });

  function autoPaint() {
    if (!AUTO_OK) return;
    $("autoBtn").textContent = Auto.on ? "⏹ 연속 정지" : "▶ 연속 재생";
    $("autoBtn").className = "btn" + (Auto.on ? " btn--solid" : "");
    $("autoBtn").setAttribute("aria-pressed", Auto.on ? "true" : "false");
    document.body.classList.toggle("is-auto", Auto.on);
    if (!Auto.on) $("autoNow").textContent = "";
  }

  function autoLabel(it, what) {
    if (!AUTO_OK) return;
    var list = filtered();
    var i = list.findIndex(function (x) { return x.no === it.no; }) + 1;
    $("autoNow").textContent = "연속 " + i + "/" + list.length + " · " + pad(it.no) + "번 " + what;
    if ($("speakingTxt")) $("speakingTxt").textContent = pad(it.no) + "번 " + what;
  }

  function autoStop() {
    if (typeof Auto === "undefined" || !Auto || !Auto.on) return;
    Auto.on = false;
    Auto.step++;
    TTS.stop();
    wakeOff();
    if ($("speakingTxt")) $("speakingTxt").textContent = "읽는 중";
    autoPaint();
  }

  function autoStart() {
    if (!AUTO_OK) return;
    var list = filtered();
    if (!list.length) return;
    if (!state.cur || list.findIndex(function (x) { return x.no === state.cur.no; }) < 0) {
      openedByAuto = true; open(list[0]); openedByAuto = false;
    }
    Auto.on = true;
    Auto.scope = $("autoScope").value;
    Auto.loop = $("autoLoop").checked;
    saveAutoPrefs();
    wakeOn();
    autoPaint();
    autoRun();
  }

  /* 낭독이 끝났다는 신호가 늦게 두 번 들어와도 한 번만 넘어가도록,
     단계마다 번호를 붙여 지난 단계의 신호는 버립니다. */
  function autoStepGuard(fn) {
    var my = ++Auto.step;
    return function () { if (Auto.on && Auto.step === my) fn(); };
  }

  function autoRun() {
    var it = state.cur;
    if (!Auto.on || !it) return;
    var doQ = Auto.scope !== "a", doA = Auto.scope !== "q";
    if (doQ) {
      autoLabel(it, "문항");
      readQuestion(autoStepGuard(function () {
        if (doA) autoPlayAnswer(); else autoNext();
      }));
    } else {
      autoPlayAnswer();
    }
  }

  function autoPlayAnswer() {
    var it = state.cur;
    if (!Auto.on || !it) return;
    autoLabel(it, "모범답안");
    readAnswer(0, autoStepGuard(function () { autoNext(); }));
  }

  function autoNext() {
    if (!Auto.on || !state.cur) return;
    Auto.step++;                                  /* 이 시점 이후의 지난 신호는 무효 */
    var list = filtered();
    if (!list.length) { autoStop(); return; }
    var i = list.findIndex(function (x) { return x.no === state.cur.no; });
    if (i < 0) i = 0;
    var n = i + 1;
    if (n >= list.length) {
      if (!Auto.loop) {
        Auto.on = false; wakeOff(); autoPaint();
        if ($("speakingTxt")) $("speakingTxt").textContent = "읽는 중";
        if ($("autoNow")) $("autoNow").textContent = "연속 재생을 마쳤습니다 · " + list.length + "문항";
        return;
      }
      n = 0;
    }
    openedByAuto = true; open(list[n]); openedByAuto = false;
    var my = Auto.step;
    setTimeout(function () { if (Auto.on && Auto.step === my) autoRun(); }, 500);
  }

  function saveAutoPrefs() {
    if (!AUTO_OK) return;
    try {
      localStorage.setItem("jinro36.auto", JSON.stringify({
        scope: $("autoScope").value, loop: $("autoLoop").checked
      }));
    } catch (e) { /* noop */ }
  }
  (function loadAutoPrefs() {
    if (!AUTO_OK) return;
    try {
      var p = JSON.parse(localStorage.getItem("jinro36.auto") || "{}");
      if (p.scope) $("autoScope").value = p.scope;
      if (p.loop) $("autoLoop").checked = true;
    } catch (e) { /* noop */ }
  })();

  if (AUTO_OK) {
    $("autoBtn").onclick = function () { Auto.on ? autoStop() : autoStart(); };
    $("autoScope").onchange = function () {
      saveAutoPrefs();
      if (Auto.on) { Auto.scope = this.value; TTS.stop(); autoRun(); }
    };
    $("autoLoop").onchange = function () { saveAutoPrefs(); Auto.loop = this.checked; };
  }

  function move(step) {
    if (!state.cur) return;
    var list = filtered();
    if (!list.length) return;
    var i = list.findIndex(function (x) { return x.no === state.cur.no; });
    if (i < 0) i = 0;
    open(list[(i + step + list.length) % list.length]);
  }

  /* ── 연결 ─────────────────────────────────────────── */
  $("search").oninput = function () { state.q = this.value; renderList(); };
  Array.prototype.forEach.call($("gradeChips").children, function (b) {
    b.onclick = function () {
      state.grade = b.dataset.grade;
      Array.prototype.forEach.call($("gradeChips").children, function (x) {
        x.classList.toggle("is-on", x === b);
      });
      renderList();
    };
  });

  $("kwToggle").onclick = function () {
    $("qKw").hidden = false; this.setAttribute("aria-expanded", "true");
  };
  $("ansToggle").onclick = function () { showAnswer(); };
  /* readQuestion 을 그대로 넘기면 클릭 이벤트가 완료 콜백 자리에 들어가 오류가 납니다. */
  $("readQ").onclick = function () { autoStop(); readQuestion(); };
  $("readA").onclick = function () { autoStop(); readAnswer(0); };
  $("stopBtn").onclick = function () { autoStop(); TTS.stop(); };
  $("speakingStop").onclick = function () { autoStop(); TTS.stop(); };
  function applyVoice() {
    var sel = $("voice");
    if (!sel || !TTS.list) return;
    if (sel.value === "") { TTS.pickVoices(); return; }
    var v = TTS.list[parseInt(sel.value, 10)];
    if (v) { TTS.voiceQ = v; TTS.voiceA = v; }
  }
  function restartSpeech() {
    if (!TTS.on || !TTS.parts) return;
    var parts = TTS.parts, done = TTS.onDone;
    var seg = TTS.queue[TTS.idx] ? TTS.queue[TTS.idx].seg : null;
    var from = 0;
    if (seg !== null) {
      for (var i = 0; i < parts.length; i++) { if (parts[i].seg === seg) { from = i; break; } }
    }
    TTS.play(parts.slice(from), TTS.onSeg, done);
  }
  /* 요청한 배속과 실제로 나오는 배속은 다를 수 있습니다.
     엔진마다 상한이 있어서, 2.0배를 걸어도 1.6배까지만 빨라지는 음성이 있습니다.
     짐작으로 안내하지 않고 실제로 재서 알려 줍니다. */
  function updateRateNote() {
    var el = $("rateNote"); if (!el) return;
    var r = parseFloat($("rate").value), msg = [];

    if (r >= 1.5 && TTS.list && TTS.list.length && !TTS.hasLocal) {
      msg.push("이 기기에는 내려받아 재생하는 한국어 음성만 있습니다. 빠른 배속에서 끊길 수 있습니다");
    }
    var eff = TTS.effective(r);
    if (eff) {
      var shown = Math.round(eff * 100) / 100;
      if (eff < r * 0.9) {
        msg.push("이 음성은 실제로 약 " + shown.toFixed(1) + "배까지만 빨라집니다");
      } else if (r >= 1.5) {
        msg.push("실제 " + shown.toFixed(1) + "배로 나오고 있습니다");
      }
    } else if (r >= 1.8) {
      msg.push("한 번 낭독해 보면 이 음성이 실제로 몇 배까지 내는지 재서 알려 드립니다");
    }

    el.textContent = msg.join(" · ");
    el.hidden = !msg.length;
  }
  TTS.onMeas = updateRateNote;

  $("rate").onchange = function () {
    TTS.rate = parseFloat(this.value);
    /* 기본 음성을 쓰는 중이면, 빠른 배속에 맞는 음성으로 다시 고릅니다. */
    if (!$("voice") || $("voice").value === "") TTS.pickVoices();
    updateRateNote();
    restartSpeech();
  };
  if ($("voice")) $("voice").onchange = function () { applyVoice(); restartSpeech(); };
  $("timerBtn").onclick = function () { Timer.id ? timerStop() : timerStart(); };
  $("thinkSec").onchange = function () { if (!Timer.id) $("timerBtn").textContent = labelFor(); };

  (function renderExam() {
    var t = $("examTable"); if (!t || typeof EXAM === "undefined") return;
    var b = t.querySelector("tbody");
    var head = document.createElement("tr");
    head.innerHTML = '<th colspan="2">' + EXAM.title + '</th>';
    b.appendChild(head);
    ([["일시", EXAM.date], ["장소", EXAM.place]].concat(EXAM.rows)).forEach(function (r) {
      var tr = document.createElement("tr");
      var th = document.createElement("th"); th.textContent = r[0];
      var td = document.createElement("td"); td.textContent = r[1];
      tr.appendChild(th); tr.appendChild(td); b.appendChild(tr);
    });
  })();

  $("doneBtn").onclick = function () {
    var no = state.cur.no;
    if (isDone(no)) state.done = state.done.filter(function (x) { return x !== no; });
    else state.done.push(no);
    saveDone();
    this.className = "btn" + (isDone(no) ? " is-done" : "");
    this.textContent = isDone(no) ? "✓ 완료함" : "✓ 연습 완료";
    renderList();
  };

  $("prevBtn").onclick = function () { move(-1); };
  $("nextBtn").onclick = function () { move(1); };
  function rand() { open(ITEMS[Math.floor(Math.random() * ITEMS.length)]); }
  $("randomBtn").onclick = rand;
  $("randomBtn2").onclick = rand;
  $("startBtn").onclick = function () { open(ITEMS[0]); };
  $("backBtn").onclick = function () {
    autoStop(); TTS.stop(); timerStop();
    document.body.classList.remove("is-detail");
    window.scrollTo(0, 0);
  };

  /* 전체화면 API는 iOS 사파리에서 동작하지 않으므로,
     지원되지 않는 환경에서는 CSS 기반 넓게 보기(집중 모드)로 대체합니다. */
  var FS_OK = (function () {
    var el = document.documentElement;
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return false;
    if (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)) return false;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen);
  })();

  function isZen() { return document.body.classList.contains("is-zen"); }
  function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function isNarrow() { return window.matchMedia("(max-width:900px)").matches; }

  /* 브라우저 UI를 숨기는 것(fullscreen)과 페이지 레이아웃을 접는 것(zen)은 별개입니다.
     좁은 화면에서는 둘을 함께 켭니다. 데스크톱은 기존 동작(목록 유지)을 유지합니다. */
  function syncWide() {
    var on = isFull() || isZen();
    document.body.classList.toggle("is-full", isFull());
    $("zenExit").hidden = !isZen();
    $("fsBtn").textContent = on ? "⤡ 넓게 보기 해제" : "⛶ 넓게 보기";
    $("fsBtn").setAttribute("aria-pressed", on ? "true" : "false");
  }
  function setZen(to) {
    document.body.classList.toggle("is-zen", to);
    syncWide();
  }
  function exitFull() {
    if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
  }
  function toggleFull() {
    var el = document.documentElement;
    if (isFull() || isZen()) { exitFull(); setZen(false); return; }
    /* 좁은 화면에서는 브라우저 UI만 숨겨도 체감이 없으므로 레이아웃을 함께 접습니다. */
    if (isNarrow() || !FS_OK) setZen(true);
    if (FS_OK) {
      var p;
      try { p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el); } catch (e) { p = null; }
      if (p && p.catch) p.catch(function () { setZen(true); });
    }
  }
  $("fsBtn").onclick = toggleFull;
  $("zenExit").onclick = function () { exitFull(); setZen(false); };
  ["fullscreenchange", "webkitfullscreenchange"].forEach(function (ev) {
    document.addEventListener(ev, function () {
      /* 안드로이드 뒤로가기 등으로 전체화면이 풀리면 레이아웃도 함께 되돌립니다. */
      if (!isFull() && isNarrow()) document.body.classList.remove("is-zen");
      syncWide();
    });
  });
  syncWide();

  /* 상단바 실제 높이를 CSS 변수로 — 안드로이드 글자 크기 확대 설정에서도
     고정 타이머가 상단바에 가려지지 않게 합니다. */
  var topbarEl = document.querySelector(".topbar");
  function measureTopbar() {
    var h = topbarEl ? Math.round(topbarEl.getBoundingClientRect().height) : 44;
    if (h === 0 && !isZen()) return;   /* 일시적으로 감춰진 순간의 0 은 무시 */
    document.documentElement.style.setProperty("--topbar-h", h + "px");
  }
  measureTopbar();
  window.addEventListener("resize", measureTopbar);
  window.addEventListener("orientationchange", measureTopbar);
  if (window.ResizeObserver && topbarEl) new ResizeObserver(measureTopbar).observe(topbarEl);

  document.addEventListener("keydown", function (e) {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "ArrowRight") move(1);
    if (e.key === "ArrowLeft") move(-1);
    if (e.key === "Escape") { autoStop(); TTS.stop(); if (isZen()) { exitFull(); setZen(false); } }
    if (e.key === "f" || e.key === "F") toggleFull();
    if (e.key === " " && state.cur) { e.preventDefault(); autoStop(); readQuestion(); }
  });

  window.addEventListener("beforeunload", function () { TTS.stop(); wakeOff(); });

  /* 화면에 보이는 문항 수는 전부 data.js 에서 세어 씁니다.
     제목에 숫자를 적어 두면 data.js 만 옛 파일일 때 제목과 목록이 어긋납니다. */
  (function stampCount() {
    var n = ITEMS.length;
    if ($("brandTitle")) $("brandTitle").textContent = "진로전담교사 심층면접 · " + n + "문항";
    if ($("progressDen")) $("progressDen").textContent = "/" + n;
    if ($("welcomeCount")) $("welcomeCount").textContent = n + "문항";
    var last = ITEMS[n - 1];
    document.title = "진로전담교사 심층면접 " + n + "문항";
    try {
      console.log("문항 수 " + n + " · 마지막 번호 " + (last ? last.no : "?") +
                  " · 목록에 보이는 수와 다르면 data.js 가 옛 파일입니다");
    } catch (e) { /* noop */ }
  })();

  /* 시험용 통로 — 평소에는 아무 일도 하지 않습니다.
     낭독 규칙을 브라우저 없이 점검할 때만 씁니다. */
  if (typeof window.__TEST_HOOK === "function") window.__TEST_HOOK({ TTS: TTS, Auto: Auto });

  renderChips();
  renderList();
})();
