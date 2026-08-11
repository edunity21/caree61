/* ============================================================
   진로전담교사 심층면접 67문항 — 동작
   data.js 의 ITEMS / AREAS 를 읽어 목록·상세·낭독·타이머를 담당합니다.
   ============================================================ */
(function () {
  "use strict";

  var BUILD = "v15";
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
    queue: [], idx: 0, on: false, rate: 1, voiceQ: null, voiceA: null,
    onSeg: null, onDone: null, watch: null, parts: null, fromSeg: 0,

    pickVoices: function () {
      if (!window.speechSynthesis) return;
      var v = speechSynthesis.getVoices().filter(function (x) {
        return /ko(-|_)?KR/i.test(x.lang) || /Korean|한국/i.test(x.name);
      });
      if (!v.length) return;
      var male = v.filter(function (x) { return /InJoon|Male|남/i.test(x.name); });
      var female = v.filter(function (x) { return /SunHi|Female|여|Yuna/i.test(x.name); });
      this.voiceQ = male[0] || v[0];
      this.voiceA = female[0] || v[v.length - 1] || v[0];
      this.list = v;
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

    chunk: function (text) {
      var LIM = this.rate > 1.2 ? 90 : (this.rate < 1 ? 60 : 75);
      var raw = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
      var sentences = [];
      raw.forEach(function (s) {                    /* 긴 문장은 쉼표에서 한 번 더 */
        if (s.length <= LIM + 25) { sentences.push(s); return; }
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
      return out;
    },

    /* parts: [{text, who:'q'|'a', seg:index|null}] */
    play: function (parts, onSeg, onDone) {
      if (!window.speechSynthesis) {
        alert("이 브라우저는 읽어주기를 지원하지 않습니다. 크롬이나 사파리 최신 버전을 사용해 주십시오.");
        return;
      }
      this.stop();                       /* stop 이 onDone 을 지우므로 그 뒤에 설정합니다 */
      this.parts = parts;
      this.onSeg = onSeg || null;
      this.onDone = onDone || null;
      var self = this;
      this.queue = [];
      parts.forEach(function (p) {
        self.chunk(p.text).forEach(function (t, i, arr) {
          self.queue.push({ text: t, who: p.who, seg: p.seg, last: i === arr.length - 1 });
        });
      });
      this.idx = 0; this.on = true;
      showSpeaking(true);
      this.next();
    },

    next: function () {
      if (!this.on) return;
      if (this.idx >= this.queue.length) {          /* 자연 종료 — 완료 콜백을 넘겨 줍니다 */
        var done = this.onDone;
        this.stop();
        if (typeof done === "function") done();   /* 함수가 아닌 값이 들어와도 안전하게 */
        return;
      }
      var item = this.queue[this.idx], self = this, myIdx = this.idx, moved = false;
      var u = new SpeechSynthesisUtterance(item.text);
      u.lang = "ko-KR";
      u.rate = this.rate;
      u.pitch = item.who === "q" ? 0.95 : 1.02;
      var v = item.who === "q" ? this.voiceQ : this.voiceA;
      if (v) u.voice = v;
      if (this.onSeg) this.onSeg(item.seg);

      function advance(delay) {
        if (moved) return;
        moved = true;
        clearTimeout(self.watch);
        self.idx = myIdx + 1;
        setTimeout(function () { self.next(); }, delay);
      }
      u.onend = function () { advance(item.last ? 300 : 130); };
      u.onerror = function () { advance(130); };

      /* 안드로이드 크롬에서 낭독이 onend 없이 조용히 끊기는 경우가 있어,
         예상 소요의 두 배가 지나면 다음 구간으로 넘깁니다. */
      var est = (item.text.length / (5 * this.rate)) * 1000 + 4000;
      this.watch = setTimeout(function () { if (self.on) advance(80); }, est);

      setTimeout(function () { if (self.on) speechSynthesis.speak(u); }, 0);
    },

    stop: function () {
      this.on = false;
      this.onDone = null;
      clearTimeout(this.watch);
      if (window.speechSynthesis) speechSynthesis.cancel();
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
      b.onclick = function () { readAnswer(i); };
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

  var Auto = { on: false, scope: "qa", loop: false };
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
    if (document.visibilityState === "visible" && Auto.on) wakeOn();
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

  function autoRun() {
    var it = state.cur;
    if (!Auto.on || !it) return;
    var doQ = Auto.scope !== "a", doA = Auto.scope !== "q";
    if (doQ) {
      autoLabel(it, "문항");
      readQuestion(function () {
        if (!Auto.on) return;
        if (doA) autoPlayAnswer(); else autoNext();
      });
    } else {
      autoPlayAnswer();
    }
  }

  function autoPlayAnswer() {
    var it = state.cur;
    if (!Auto.on || !it) return;
    autoLabel(it, "모범답안");
    readAnswer(0, function () { if (Auto.on) autoNext(); });
  }

  function autoNext() {
    if (!Auto.on) return;
    var list = filtered();
    if (!list.length) { autoStop(); return; }
    var i = list.findIndex(function (x) { return x.no === state.cur.no; });
    if (i < 0) i = 0;
    var n = i + 1;
    if (n >= list.length) {
      if (!Auto.loop) {
        Auto.on = false; wakeOff(); autoPaint();
        if ($("autoNow")) $("autoNow").textContent = "연속 재생을 마쳤습니다 · " + list.length + "문항";
        return;
      }
      n = 0;
    }
    openedByAuto = true; open(list[n]); openedByAuto = false;
    setTimeout(function () { autoRun(); }, 450);
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
  $("readQ").onclick = function () { readQuestion(); };   /* 이벤트가 onDone 으로 새지 않게 */
  $("readA").onclick = function () { readAnswer(0); };
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
    var parts = TTS.parts, done = (typeof TTS.onDone === "function") ? TTS.onDone : null;
    var seg = TTS.queue[TTS.idx] ? TTS.queue[TTS.idx].seg : null;
    var from = 0;
    if (seg !== null) {
      for (var i = 0; i < parts.length; i++) { if (parts[i].seg === seg) { from = i; break; } }
    }
    TTS.play(parts.slice(from), TTS.onSeg, done);
  }
  $("rate").onchange = function () {
    TTS.rate = parseFloat(this.value);
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
    if (e.key === " " && state.cur) { e.preventDefault(); readQuestion(); }
  });

  window.addEventListener("beforeunload", function () { TTS.stop(); wakeOff(); });

  renderChips();
  renderList();
})();
