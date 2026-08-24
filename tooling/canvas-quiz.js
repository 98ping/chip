// canvas-quiz.js — read and drive a Canvas *Classic Quizzes* /take page.
//
// Paste the whole file through javascript_tool once per page load (globals do not
// survive a reload). Everything is scoped to `#submit_quiz_form`, so it is safe
// on the review page (/history) too.
//
//   __QDUMP()            -> full JSON of every question + your current answers
//   __QSTATE()           -> one-line-per-question progress summary
//   __QSET(n, choice)    -> answer question n (1-based); see below
//   __QVERIFY()          -> re-read from the DOM what is actually selected
//
// __QSET's `choice` depends on the question type:
//   multiple choice / true-false : answer index (1-based) or exact answer text
//   multiple answers             : array of indices or texts
//   short answer / numerical     : the string to type
//   essay                        : the string to type
//   dropdowns / multi-blank      : object { blankName: valueOrText }
//   matching                     : object { leftText: rightOptionText }
//
// Canvas autosaves on `change`. __QSET fires native bubbling input+change events,
// which jQuery's delegated handlers pick up — watch for the "Quiz saved at ..."
// stamp in the header to confirm the server took it.

(() => {
  const FORM = () => document.querySelector("#submit_quiz_form") || document;

  const txt = (el) => (el ? el.innerText.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : "");

  const typeOf = (node) => {
    // NB: the wrapper class `display_question` also ends in `_question` — skipping
    // it is the difference between a real type and every question reading the same.
    const m = [...node.classList].find(
      (c) => c.endsWith("_question") && c !== "question" && c !== "display_question"
    );
    return m || "unknown";
  };

  // Every form control inside a question, grouped by its `name`. This is what
  // makes the reader type-agnostic: Canvas encodes the shape in the names.
  const controlsOf = (node) => {
    const byName = new Map();
    for (const el of node.querySelectorAll("input, select, textarea")) {
      if (el.type === "hidden" || el.disabled) continue;
      if (!el.name) continue;
      if (!byName.has(el.name)) byName.set(el.name, []);
      byName.get(el.name).push(el);
    }
    return byName;
  };

  const answerText = (el) => {
    const wrap = el.closest(".answer") || el.parentElement;
    if (!wrap) return el.value;
    const t = wrap.querySelector(".answer_text, .answer_html, label");
    return txt(t) || el.value;
  };

  function readQuestion(node, i) {
    const type = typeOf(node);
    const q = {
      index: i + 1,
      id: (node.id.match(/question_(\d+)/) || [])[1] || null,
      name: txt(node.querySelector(".question_name, .name")) || `Question ${i + 1}`,
      type,
      points: txt(node.querySelector(".question_points, .points")) || null,
      text: txt(node.querySelector(".question_text, .questionText")),
      answers: [],
      blanks: [],
      response: null,
      answered: false,
    };

    const controls = controlsOf(node);

    // radios / checkboxes -> a list of choices
    const choiceEls = [...node.querySelectorAll('input[type="radio"], input[type="checkbox"]')].filter((e) => !e.disabled);
    if (choiceEls.length) {
      q.answers = choiceEls.map((el, n) => ({
        n: n + 1,
        value: el.value,
        text: answerText(el),
        selected: el.checked,
      }));
      q.answered = q.answers.some((a) => a.selected);
      q.response = q.answers.filter((a) => a.selected).map((a) => a.text).join(" | ") || null;
    }

    // free-text (short answer, numerical, essay) -> a single control named question_<id>
    const free = [...controls.entries()].filter(
      ([name, els]) => /^question_\d+$/.test(name) && els[0].tagName !== "SELECT" && els[0].type !== "radio" && els[0].type !== "checkbox"
    );
    for (const [, els] of free) {
      q.response = els[0].value;
      q.answered = !!String(els[0].value).trim();
    }

    // essay via the rich content editor: the visible text lives in an iframe we
    // can't always reach — fall back to the hidden textarea's value.
    if (type === "essay_question" && !q.response) {
      const ta = node.querySelector("textarea");
      if (ta) { q.response = ta.value; q.answered = !!ta.value.trim(); }
    }

    // dropdowns / fill-in-multiple-blanks / matching -> controls named
    // question_<id>_<blank>, one per blank
    const blankEls = [...controls.entries()].filter(([name]) => /^question_\d+_/.test(name));
    if (blankEls.length && !choiceEls.length) {
      q.blanks = blankEls.map(([name, els]) => {
        const el = els[0];
        const blank = name.replace(/^question_\d+_/, "");
        const b = { blank, name, value: el.value || null };
        if (el.tagName === "SELECT") {
          b.options = [...el.options].map((o) => o.text.trim()).filter(Boolean);
          const sel = el.options[el.selectedIndex];
          b.value = sel && sel.value ? sel.text.trim() : null;
        }
        // matching questions label each select with the left-hand item
        const row = el.closest(".answer");
        if (row) {
          const left = row.querySelector(".answer_match_left, .answer_text");
          if (left) b.left = txt(left);
        }
        return b;
      });
      q.answered = q.blanks.every((b) => b.value);
      q.response = q.blanks.map((b) => `${b.left || b.blank} → ${b.value ?? "—"}`).join("; ");
    }

    return q;
  }

  const questionNodes = () => [...FORM().querySelectorAll(".display_question, .question")].filter(
    (n, i, arr) =>
      /question_\d+/.test(n.id) &&
      !n.classList.contains("text_only_question") &&
      !arr.some((o) => o !== n && o.contains(n))
  );

  function dump() {
    const qs = questionNodes().map(readQuestion);
    const m = location.pathname.match(/courses\/(\d+)\/quizzes\/(\d+)/) || [];
    return {
      title: (document.querySelector("#quiz_title, h1") || {}).innerText?.trim() || document.title,
      courseId: m[1] || null,
      quizId: m[2] || null,
      attemptUrl: location.href,
      capturedAt: new Date().toISOString(),
      pointsPossible: null,
      questions: qs,
    };
  }

  function state() {
    const qs = questionNodes().map(readQuestion);
    const timer = document.querySelector("#took_quiz_time, .time_running, #time_running");
    const saved = document.querySelector("#last_saved_indicator");
    return [
      ...qs.map((q) => `${String(q.index).padStart(2)}. [${q.answered ? "x" : " "}] ${q.type.replace("_question", "").padEnd(22)} ${(q.response || "").slice(0, 60)}`),
      `--- ${qs.filter((q) => q.answered).length}/${qs.length} answered`,
      saved ? `--- ${saved.innerText.trim()}` : "--- (no save stamp yet)",
      timer ? `--- timer: ${timer.innerText.trim()}` : "",
    ].filter(Boolean).join("\n");
  }

  const fire = (el) => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, " ").trim();

  function set(index, choice) {
    const node = questionNodes()[index - 1];
    if (!node) return `no question ${index}`;
    const type = typeOf(node);
    const controls = controlsOf(node);
    const choiceEls = [...node.querySelectorAll('input[type="radio"], input[type="checkbox"]')].filter((e) => !e.disabled);

    const pick = (want) => {
      if (typeof want === "number") return choiceEls[want - 1];
      return choiceEls.find((el) => norm(answerText(el)) === norm(want))
        || choiceEls.find((el) => norm(answerText(el)).startsWith(norm(want)))
        || choiceEls.find((el) => el.value === String(want));
    };

    if (choiceEls.length) {
      const wants = Array.isArray(choice) ? choice : [choice];
      if (choiceEls[0].type === "checkbox") choiceEls.forEach((el) => { el.checked = false; });
      const hit = [];
      for (const w of wants) {
        const el = pick(w);
        if (!el) return `question ${index}: no answer matching ${JSON.stringify(w)} — options: ${choiceEls.map((e, n) => `${n + 1}) ${answerText(e)}`).join("  ")}`;
        el.checked = true;
        el.click?.();
        el.checked = true;
        fire(el);
        hit.push(answerText(el));
      }
      return `Q${index} <- ${hit.join(" | ")}`;
    }

    // object form: dropdowns / multi-blank / matching
    if (choice && typeof choice === "object" && !Array.isArray(choice)) {
      const out = [];
      for (const [key, want] of Object.entries(choice)) {
        const entry = [...controls.entries()].find(([name, els]) => {
          const blank = name.replace(/^question_\d+_/, "");
          if (blank === key || name === key) return true;
          const row = els[0].closest(".answer");
          const left = row && row.querySelector(".answer_match_left, .answer_text");
          return left && norm(txt(left)) === norm(key);
        });
        if (!entry) { out.push(`no blank "${key}"`); continue; }
        const el = entry[1][0];
        if (el.tagName === "SELECT") {
          const opt = [...el.options].find((o) => norm(o.text) === norm(want)) || [...el.options].find((o) => o.value === String(want));
          if (!opt) { out.push(`"${key}": no option "${want}" — has ${[...el.options].map((o) => o.text.trim()).join(" | ")}`); continue; }
          el.value = opt.value;
        } else {
          el.value = want;
        }
        fire(el);
        out.push(`${key} <- ${want}`);
      }
      return `Q${index}: ${out.join("; ")}`;
    }

    // plain text control
    const free = [...controls.entries()].find(([name, els]) => /^question_\d+$/.test(name) && els[0].tagName !== "SELECT");
    if (free) {
      const el = free[1][0];
      el.focus();
      el.value = choice;
      fire(el);
      el.blur();
      return `Q${index} <- ${String(choice).slice(0, 80)}`;
    }
    return `question ${index}: type ${type} — no control matched, inspect it by hand`;
  }

  function verify() {
    return questionNodes().map(readQuestion).map((q) =>
      `${String(q.index).padStart(2)}. ${q.answered ? "" : "UNANSWERED "}${q.response ?? "—"}`
    ).join("\n");
  }

  window.__QDUMP = dump;
  window.__QSTATE = state;
  window.__QSET = set;
  window.__QVERIFY = verify;
  return "canvas-quiz.js loaded: __QDUMP() __QSTATE() __QSET(n, choice) __QVERIFY()";
})();
