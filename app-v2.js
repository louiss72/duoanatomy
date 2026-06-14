(function () {
  "use strict";

  const questions = Array.isArray(window.ANATOMY_QUESTIONS) ? window.ANATOMY_QUESTIONS : [];
  const storageKey = "anatomy-runway-practice:v1";
  const maxHistory = 24;
  const regionOrder = ["頭部", "腹部", "會陰", "下肢"];
  const regionBySection = new Map([
    ["咀嚼肌與表情肌", "頭部"],
    ["眼外肌", "頭部"],
    ["總頸動脈、外頸動脈與 內頸動脈分支", "頭部"],
    ["靜脈與硬腦膜靜脈竇", "頭部"],
    ["腦神經、分支、神經節與腺體", "頭部"],
    ["腹壁、後腹壁與膈肌", "腹部"],
    ["腹腔與骨盆入口動脈", "腹部"],
    ["腹腔靜脈", "腹部"],
    ["腹腔神經", "腹部"],
    ["腹腔臟器、韌帶與腸繫膜血管", "腹部"],
    ["骨盆底與會陰肌", "會陰"],
    ["內髂動脈及其分支", "會陰"],
    ["骨盆與會陰靜脈", "會陰"],
    ["骨盆神經", "會陰"],
    ["生殖器與相關結構", "會陰"],
    ["大腿與臀區肌肉", "下肢"],
    ["小腿與足部肌肉", "下肢"],
    ["下肢動脈", "下肢"],
    ["下肢靜脈", "下肢"],
    ["下肢神經", "下肢"],
    ["韌帶、膝關節與肌腱", "下肢"],
  ]);

  const state = {
    current: null,
    choices: [],
    answered: false,
    lastId: "",
    region: "all",
    markedOnly: false,
    stats: loadStats(),
  };

  const els = {
    sectionSelect: document.getElementById("sectionSelect"),
    markedOnly: document.getElementById("markedOnly"),
    resetButton: document.getElementById("resetButton"),
    seenStat: document.getElementById("seenStat"),
    accuracyStat: document.getElementById("accuracyStat"),
    poolStat: document.getElementById("poolStat"),
    sectionBadge: document.getElementById("sectionBadge"),
    markedBadge: document.getElementById("markedBadge"),
    hintPrompt: document.getElementById("hintPrompt"),
    historyRow: document.getElementById("historyRow"),
    optionGrid: document.getElementById("optionGrid"),
    feedback: document.getElementById("feedback"),
    resultText: document.getElementById("resultText"),
    answerText: document.getElementById("answerText"),
    noteText: document.getElementById("noteText"),
    imagePanel: document.getElementById("imagePanel"),
    answerImage: document.getElementById("answerImage"),
    imageCaption: document.getElementById("imageCaption"),
    imageLink: document.getElementById("imageLink"),
    imageLicense: document.getElementById("imageLicense"),
    skipButton: document.getElementById("skipButton"),
    nextButton: document.getElementById("nextButton"),
  };

  init();

  function init() {
    populateSections();
    els.sectionSelect.addEventListener("change", () => {
      state.region = els.sectionSelect.value;
      nextQuestion();
    });
    els.markedOnly.addEventListener("change", () => {
      state.markedOnly = els.markedOnly.checked;
      nextQuestion();
    });
    els.resetButton.addEventListener("click", resetProgress);
    els.skipButton.addEventListener("click", nextQuestion);
    els.nextButton.addEventListener("click", nextQuestion);
    nextQuestion();
  }

  function populateSections() {
    els.sectionSelect.innerHTML = "";
    els.sectionSelect.append(new Option("全部", "all"));
    regionOrder.forEach((region) => els.sectionSelect.append(new Option(region, region)));
  }

  function loadStats() {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) || {};
    } catch (_error) {
      return {};
    }
  }

  function saveStats() {
    localStorage.setItem(storageKey, JSON.stringify(state.stats));
  }

  function getStats(id) {
    if (!state.stats[id]) {
      state.stats[id] = {
        seen: 0,
        correct: 0,
        wrong: 0,
        streakWrong: 0,
        lastResult: null,
        lastAt: 0,
        history: [],
      };
    }
    return state.stats[id];
  }

  function filteredQuestions() {
    return questions.filter((item) => {
      if (state.region !== "all" && getRegion(item) !== state.region) return false;
      if (state.markedOnly && !item.marked) return false;
      return true;
    });
  }

  function nextQuestion() {
    const pool = filteredQuestions();
    if (!pool.length) {
      renderEmpty();
      return;
    }
    state.current = pickWeighted(pool);
    state.lastId = state.current.id;
    state.choices = buildChoices(state.current, pool);
    state.answered = false;
    renderQuestion();
    renderStats(pool);
  }

  function pickWeighted(pool) {
    const weighted = pool.map((item) => {
      const stats = getStats(item.id);
      const accuracy = stats.seen ? stats.correct / stats.seen : 0.5;
      let weight = 1.2;
      if (!stats.seen) weight += 1.4;
      weight += stats.wrong * 1.8;
      weight += stats.streakWrong * 4.2;
      weight += Math.max(0, 0.78 - accuracy) * 4.5;
      if (stats.lastResult === false) weight += 4;
      if (item.marked) weight += 0.35;
      if (item.id === state.lastId && pool.length > 1) weight *= 0.04;
      return { item, weight };
    });
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let ticket = Math.random() * total;
    for (const entry of weighted) {
      ticket -= entry.weight;
      if (ticket <= 0) return entry.item;
    }
    return weighted[weighted.length - 1].item;
  }

  function buildChoices(answer, pool) {
    const sameSection = pool.filter((item) => item.id !== answer.id && item.english !== answer.english);
    const fallback = questions.filter((item) => item.id !== answer.id && item.english !== answer.english);
    const source = sameSection.length >= 3 ? sameSection : fallback;
    const options = [answer.english];
    const shuffled = shuffle([...source]);
    for (const item of shuffled) {
      if (!options.includes(item.english)) options.push(item.english);
      if (options.length === 4) break;
    }
    return shuffle(options);
  }

  function renderQuestion() {
    const item = state.current;
    const stats = getStats(item.id);
    applyTone(stats);

    els.sectionBadge.textContent = `${getRegion(item)} / ${item.section}`;
    els.markedBadge.hidden = !item.marked;
    els.hintPrompt.textContent = item.hint;
    renderHistory(stats);

    els.feedback.hidden = true;
    els.feedback.className = "feedback";
    els.resultText.textContent = "";
    els.answerText.textContent = "";
    els.noteText.textContent = "";
    hideAnswerImage();
    els.nextButton.disabled = false;

    els.optionGrid.innerHTML = "";
    state.choices.forEach((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-button";
      button.textContent = choice;
      button.addEventListener("click", () => answer(choice));
      els.optionGrid.append(button);
    });
  }

  function renderHistory(stats) {
    els.historyRow.innerHTML = "";
    const recent = stats.history.slice(-maxHistory);
    recent.forEach((result) => {
      const dot = document.createElement("span");
      dot.className = `history-dot ${result ? "good" : "bad"}`;
      els.historyRow.append(dot);
    });
  }

  function answer(choice) {
    if (state.answered || !state.current) return;
    state.answered = true;

    const item = state.current;
    const stats = getStats(item.id);
    const correct = choice === item.english;

    stats.seen += 1;
    stats.lastAt = Date.now();
    stats.lastResult = correct;
    stats.history.push(correct);
    stats.history = stats.history.slice(-maxHistory);
    if (correct) {
      stats.correct += 1;
      stats.streakWrong = 0;
    } else {
      stats.wrong += 1;
      stats.streakWrong += 1;
    }
    saveStats();

    [...els.optionGrid.children].forEach((button) => {
      button.disabled = true;
      if (button.textContent === item.english) button.classList.add("correct");
      if (button.textContent === choice && !correct) button.classList.add("wrong");
    });

    els.feedback.hidden = false;
    els.feedback.classList.add(correct ? "good" : "bad");
    els.resultText.textContent = correct ? "答對" : "再看一次";
    els.answerText.textContent = item.english;
    els.noteText.textContent = item.note ? `原附註：${item.note}` : "";
    renderAnswerImage(item, correct);

    applyTone(stats);
    renderHistory(stats);
    renderStats(filteredQuestions());
    window.requestAnimationFrame(() => {
      els.feedback.scrollIntoView({ block: "end", behavior: "smooth" });
    });
  }

  function renderStats(pool) {
    const aggregate = pool.reduce(
      (acc, item) => {
        const stats = getStats(item.id);
        acc.seen += stats.seen;
        acc.correct += stats.correct;
        return acc;
      },
      { seen: 0, correct: 0 }
    );
    els.seenStat.textContent = String(aggregate.seen);
    els.accuracyStat.textContent = aggregate.seen
      ? `${Math.round((aggregate.correct / aggregate.seen) * 100)}%`
      : "--";
    els.poolStat.textContent = String(pool.length);
  }

  function renderEmpty() {
    applyTone({ seen: 0, correct: 0, history: [] });
    els.sectionBadge.textContent = "無題目";
    els.markedBadge.hidden = true;
    els.hintPrompt.textContent = "目前篩選沒有題目";
    els.historyRow.innerHTML = "";
    els.optionGrid.innerHTML = "";
    els.feedback.hidden = true;
    renderStats([]);
  }

  function renderAnswerImage(item, correct) {
    const image = item.image;
    if (correct || !image || !image.url) {
      hideAnswerImage();
      return;
    }

    const sourceName = image.sourceName || "來源";
    const title = image.title || `${item.english} anatomy image`;
    els.answerImage.src = image.url;
    els.answerImage.alt = title;
    els.answerImage.onload = () => {
      window.requestAnimationFrame(() => {
        els.imagePanel.scrollIntoView({ block: "end", behavior: "smooth" });
      });
    };
    els.answerImage.onerror = hideAnswerImage;
    els.imageCaption.textContent = title;
    els.imageLink.href = image.sourceUrl || image.url;
    els.imageLink.textContent = sourceName;
    els.imageLicense.textContent = [image.license, image.attribution].filter(Boolean).join(" · ");
    els.imageLicense.hidden = !els.imageLicense.textContent;
    els.imagePanel.hidden = false;
  }

  function hideAnswerImage() {
    els.imagePanel.hidden = true;
    els.answerImage.removeAttribute("src");
    els.answerImage.alt = "";
    els.answerImage.onload = null;
    els.answerImage.onerror = null;
    els.imageCaption.textContent = "";
    els.imageLink.removeAttribute("href");
    els.imageLink.textContent = "來源";
    els.imageLicense.textContent = "";
    els.imageLicense.hidden = true;
  }

  function applyTone(stats) {
    const seen = stats.seen || 0;
    const accuracy = seen ? stats.correct / seen : 0.5;
    const hue = Math.round(4 + accuracy * 132);
    const saturation = seen ? 68 : 16;
    const bg = seen ? `hsl(${hue} ${saturation}% 94%)` : "#f6f7fb";
    const soft = seen ? `hsl(${hue} ${saturation}% 90%)` : "#eef2f7";
    const strong = seen ? `hsl(${hue} 58% 36%)` : "#516170";
    document.documentElement.style.setProperty("--heat-bg", bg);
    document.documentElement.style.setProperty("--heat-soft", soft);
    document.documentElement.style.setProperty("--heat-strong", strong);
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", bg);
  }

  function resetProgress() {
    const ok = window.confirm("清除這台裝置上的練習紀錄？");
    if (!ok) return;
    state.stats = {};
    localStorage.removeItem(storageKey);
    nextQuestion();
  }

  function shuffle(items) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [items[index], items[other]] = [items[other], items[index]];
    }
    return items;
  }

  function getRegion(item) {
    return item.region || regionBySection.get(item.section) || "其他";
  }
})();
