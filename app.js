(function () {
  "use strict";

  var STORAGE_KEY = "cta-study-calendar.state.v1";
  var BACKUP_SCHEMA = "cta-calendar-backup.v1";
  var EVALUATION_SCHEMA = "cta-evaluation.v1";
  var EXAM_DATE = "2026-11-14";
  var TASKS = Object.create(null);
  var history = Array.isArray(window.CTA_HISTORY) ? window.CTA_HISTORY : [];
  var manifest = Array.isArray(window.CTA_TASK_MANIFEST) ? window.CTA_TASK_MANIFEST : [];
  var state = loadState();
  var today = torontoToday();
  var viewDate = state.ui && state.ui.lastMonth ? parseMonth(state.ui.lastMonth) : parseMonth(today.slice(0, 7));
  var activeDate = null;
  var activeTimerState = null;
  var activeTimerStartedAt = 0;
  var timerInterval = null;
  var toastTimer = null;
  var mapViewer = null;

  window.registerCTATask = function (task) {
    var errors = validateTask(task);
    if (errors.length) throw new Error("日课文件无效：" + errors.join("；"));
    TASKS[task.meta.date] = task;
  };

  var elements = {
    heading: document.getElementById("calendarHeading"),
    grid: document.getElementById("calendarGrid"),
    previous: document.getElementById("previousMonth"),
    next: document.getElementById("nextMonth"),
    today: document.getElementById("todayButton"),
    exportBackup: document.getElementById("exportBackup"),
    importBackupButton: document.getElementById("importBackupButton"),
    importBackupInput: document.getElementById("importBackupInput"),
    dialog: document.getElementById("dayDialog"),
    dialogTitle: document.getElementById("dayDialogTitle"),
    dialogMeta: document.getElementById("dayDialogMeta"),
    dialogBody: document.getElementById("dayDialogBody"),
    closeDialog: document.getElementById("closeDialog"),
    mapDialog: document.getElementById("mapDialog"),
    mapDialogTitle: document.getElementById("mapDialogTitle"),
    mapDialogBody: document.getElementById("mapDialogBody"),
    closeMapDialog: document.getElementById("closeMapDialog"),
    previousMapPage: document.getElementById("previousMapPage"),
    nextMapPage: document.getElementById("nextMapPage"),
    mapPageLabel: document.getElementById("mapPageLabel"),
    zoomOutMap: document.getElementById("zoomOutMap"),
    zoomInMap: document.getElementById("zoomInMap"),
    mapZoomLabel: document.getElementById("mapZoomLabel"),
    fitMap: document.getElementById("fitMap"),
    locateMap: document.getElementById("locateMap"),
    countdown: document.getElementById("countdownValue"),
    toast: document.getElementById("toast")
  };

  bindStaticEvents();
  updateCountdown();
  loadTaskScripts().then(function () {
    renderCalendar();
  }).catch(function (error) {
    renderCalendar();
    notify(error.message, true);
  });

  function defaultState() {
    return { schemaVersion: 1, taskStates: {}, ui: { lastMonth: "2026-10" } };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      if (parsed.schemaVersion !== 1 || !parsed.taskStates) return defaultState();
      parsed.ui = parsed.ui || { lastMonth: "2026-10" };
      return parsed;
    } catch (error) {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function ensureTaskState(task) {
    var date = task.meta.date;
    var existing = state.taskStates[date];
    if (!existing || existing.taskVersion !== task.meta.version) {
      var carryAnswers = {};
      var carrySubmitted = {};
      if (existing && date === "2026-10-02" && existing.taskVersion === "2026-10-02.v3" && task.meta.version === "2026-10-02.v4") {
        task.choiceQuestions.forEach(function (question) {
          if (existing.choiceAnswers && Array.isArray(existing.choiceAnswers[question.id])) {
            carryAnswers[question.id] = existing.choiceAnswers[question.id].slice();
            if (existing.choiceSubmitted) carrySubmitted[question.id] = true;
          }
        });
      }
      if (existing) {
        state.priorTaskStates = state.priorTaskStates || {};
        state.priorTaskStates[date + "@" + existing.taskVersion] = existing;
      }
      state.taskStates[date] = {
        taskVersion: task.meta.version,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        choiceAnswers: carryAnswers,
        choiceSubmitted: false,
        choiceSubmittedIds: carrySubmitted,
        applicationAnswers: {},
        assignmentAnswers: {},
        notes: existing ? existing.notes || "" : "",
        elapsedSeconds: existing ? existing.elapsedSeconds || 0 : 0,
        evaluation: null,
        exportedAt: null
      };
      saveState();
    }
    if (typeof state.taskStates[date].elapsedSeconds !== "number") state.taskStates[date].elapsedSeconds = 0;
    state.taskStates[date].assignmentAnswers = state.taskStates[date].assignmentAnswers || {};
    state.taskStates[date].choiceSubmittedIds = state.taskStates[date].choiceSubmittedIds || {};
    if (task.meta.shuffleQuestions && !state.taskStates[date].questionOrder) {
      var order = task.choiceQuestions.map(function (question) { return question.id; });
      for (var index = order.length - 1; index > 0; index -= 1) {
        var randomIndex = Math.floor(Math.random() * (index + 1));
        var previous = order[index];
        order[index] = order[randomIndex];
        order[randomIndex] = previous;
      }
      state.taskStates[date].questionOrder = order;
      saveState();
    }
    return state.taskStates[date];
  }

  function loadTaskScripts() {
    return manifest.reduce(function (chain, item) {
      return chain.then(function () {
        if (!item || !item.date || !item.src) throw new Error("任务清单存在缺少日期或路径的条目");
        return loadScript(item.src).then(function () {
          if (!TASKS[item.date]) throw new Error(item.src + " 未注册 " + item.date + " 的日课");
        });
      });
    }, Promise.resolve());
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = function () { reject(new Error("无法读取日课文件：" + src)); };
      document.head.appendChild(script);
    });
  }

  function bindStaticEvents() {
    elements.previous.addEventListener("click", function () { changeMonth(-1); });
    elements.next.addEventListener("click", function () { changeMonth(1); });
    elements.today.addEventListener("click", function () {
      viewDate = parseMonth(today.slice(0, 7));
      persistViewedMonth();
      renderCalendar();
    });
    elements.closeDialog.addEventListener("click", function () { elements.dialog.close(); });
    elements.closeMapDialog.addEventListener("click", function () { elements.mapDialog.close(); });
    elements.previousMapPage.addEventListener("click", function () { changeMapPage(-1); });
    elements.nextMapPage.addEventListener("click", function () { changeMapPage(1); });
    elements.zoomOutMap.addEventListener("click", function () { zoomMap(1 / 1.25); });
    elements.zoomInMap.addEventListener("click", function () { zoomMap(1.25); });
    elements.fitMap.addEventListener("click", fitMapPage);
    elements.locateMap.addEventListener("click", locateMapFocus);
    elements.mapDialogBody.addEventListener("wheel", onMapWheel, { passive: false });
    elements.mapDialogBody.addEventListener("pointerdown", onMapPointerDown);
    elements.mapDialogBody.addEventListener("pointermove", onMapPointerMove);
    elements.mapDialogBody.addEventListener("pointerup", onMapPointerUp);
    elements.mapDialogBody.addEventListener("pointercancel", onMapPointerUp);
    elements.mapDialogBody.addEventListener("keydown", onMapKeyDown);
    window.addEventListener("resize", function () { if (mapViewer) fitMapPage(); });
    elements.mapDialog.addEventListener("close", function () { mapViewer = null; });
    elements.mapDialog.addEventListener("click", function (event) {
      if (event.target === elements.mapDialog) elements.mapDialog.close();
    });
    elements.dialog.addEventListener("close", stopTimer);
    elements.dialog.addEventListener("click", function (event) {
      if (event.target === elements.dialog) elements.dialog.close();
    });
    elements.exportBackup.addEventListener("click", exportBackup);
    elements.importBackupButton.addEventListener("click", function () { elements.importBackupInput.click(); });
    elements.importBackupInput.addEventListener("change", importBackup);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        stopTimer();
      } else if (elements.dialog.open && activeDate && TASKS[activeDate] && TASKS[activeDate].meta.kind !== "rest") {
        startTimer(ensureTaskState(TASKS[activeDate]));
      }
    });
    window.addEventListener("beforeunload", stopTimer);
  }

  function changeMonth(delta) {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1);
    persistViewedMonth();
    renderCalendar();
  }

  function persistViewedMonth() {
    state.ui.lastMonth = formatMonth(viewDate);
    saveState();
  }

  function renderCalendar() {
    var year = viewDate.getFullYear();
    var month = viewDate.getMonth();
    elements.heading.textContent = year + "年" + (month + 1) + "月";
    elements.grid.replaceChildren();

    var first = new Date(year, month, 1);
    var mondayIndex = (first.getDay() + 6) % 7;
    var start = new Date(year, month, 1 - mondayIndex);

    for (var index = 0; index < 42; index += 1) {
      var date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      elements.grid.appendChild(createCalendarCell(date, month));
    }
  }

  function createCalendarCell(date, activeMonth) {
    var dateKey = formatDate(date);
    var records = history.filter(function (item) { return item.date === dateKey; });
    var task = TASKS[dateKey];
    var taskState = task && state.taskStates[dateKey] && state.taskStates[dateKey].taskVersion === task.meta.version
      ? state.taskStates[dateKey] : null;
    var hasContent = records.length > 0 || Boolean(task) || dateKey === EXAM_DATE;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-cell";
    button.setAttribute("role", "gridcell");
    button.disabled = !hasContent;
    if (date.getMonth() !== activeMonth) button.classList.add("outside-month");
    if (dateKey === today) button.classList.add("today");
    if (dateKey === EXAM_DATE) button.classList.add("exam-day");

    var statusParts = records.map(function (record) { return "Day" + record.dayNumber; });
    if (task) statusParts.push(statusLabel(task, taskState));
    if (dateKey === EXAM_DATE) statusParts.push("考试日");
    button.setAttribute("aria-label", humanDate(dateKey) + (statusParts.length ? "，" + statusParts.join("，") : "，无任务"));

    var number = document.createElement("span");
    number.className = "date-number";
    number.textContent = String(date.getDate());
    button.appendChild(number);

    var items = document.createElement("span");
    items.className = "cell-items";
    records.forEach(function (record) {
      items.appendChild(tag("Day" + record.dayNumber, "history"));
    });
    if (task) items.appendChild(tag(statusLabel(task, taskState), statusClass(task, taskState)));
    if (dateKey === EXAM_DATE) items.appendChild(tag("考试", "exam"));
    button.appendChild(items);

    if (hasContent) button.addEventListener("click", function () { openDay(dateKey); });
    return button;
  }

  function tag(text, className) {
    var element = document.createElement("span");
    element.className = "cell-tag " + className;
    element.textContent = text;
    return element;
  }

  function statusLabel(task, taskState) {
    if (task.meta.kind === "rest") return "休息日";
    if (taskState && taskState.evaluation) return "已评测";
    if (taskState && (taskState.choiceSubmitted || hasAnswer(taskState))) return "待评测";
    return "学习任务";
  }

  function statusClass(task, taskState) {
    if (task.meta.kind === "rest") return "rest";
    if (taskState && taskState.evaluation) return "evaluated";
    if (taskState && (taskState.choiceSubmitted || hasAnswer(taskState))) return "pending";
    return "task";
  }

  function hasAnswer(taskState) {
    return Object.keys(taskState.choiceAnswers || {}).some(function (key) { return taskState.choiceAnswers[key].length; }) ||
      Object.keys(taskState.applicationAnswers || {}).some(function (key) { return String(taskState.applicationAnswers[key]).trim(); }) ||
      Object.keys(taskState.assignmentAnswers || {}).some(function (key) { return String(taskState.assignmentAnswers[key]).trim(); });
  }

  function openDay(dateKey) {
    stopTimer();
    activeDate = dateKey;
    var task = TASKS[dateKey];
    var records = history.filter(function (item) { return item.date === dateKey; });
    elements.dialogTitle.textContent = humanDate(dateKey);
    elements.dialogMeta.textContent = task && task.meta.dayNumber ? "Day" + task.meta.dayNumber : records.length ? "历史学习记录" : dateKey === EXAM_DATE ? "考试日" : "学习日";
    elements.dialogBody.replaceChildren();

    if (dateKey === EXAM_DATE && !task) renderExamNotice();
    if (records.length) renderHistory(records);
    if (task) renderTask(task);
    elements.dialog.showModal();
    if (task && task.meta.kind !== "rest") startTimer(ensureTaskState(task));
    elements.closeDialog.focus();
  }

  function renderExamNotice() {
    var section = createSection("考试日", "考试日不自动安排普通学习任务。");
    elements.dialogBody.appendChild(section);
  }

  function renderHistory(records) {
    var section = document.createElement("section");
    section.className = "detail-section";
    var heading = document.createElement("h3");
    heading.textContent = "历史学习记录";
    section.appendChild(heading);
    var list = document.createElement("ul");
    list.className = "record-list";
    records.forEach(function (record) {
      var item = document.createElement("li");
      item.className = "record-card";
      var text = document.createElement("div");
      var strong = document.createElement("strong");
      strong.textContent = record.title;
      var note = document.createElement("p");
      note.textContent = "来源于现有学习总结；网页不改写原记录。";
      text.append(strong, note);
      var link = document.createElement("a");
      link.href = encodeURI(record.source);
      link.textContent = "打开总结";
      item.append(text, link);
      list.appendChild(item);
    });
    section.appendChild(list);
    elements.dialogBody.appendChild(section);
  }

  function renderTask(task) {
    var taskState = ensureTaskState(task);
    var section = document.createElement("section");
    section.className = "detail-section";
    var heading = document.createElement("h3");
    heading.textContent = task.meta.title || "当日学习任务";
    section.appendChild(heading);

    var meta = document.createElement("div");
    meta.className = "task-meta";
    [
      task.meta.dayNumber ? "Day" + task.meta.dayNumber : null,
      task.meta.subjects && task.meta.subjects.join(" / "),
      task.meta.estimatedMinutes ? task.meta.estimatedMinutes + "分钟" : null,
      "版本 " + task.meta.version
    ].filter(Boolean).forEach(function (value) {
      var chip = document.createElement("span");
      chip.className = "meta-chip";
      chip.textContent = value;
      meta.appendChild(chip);
    });
    var elapsed = document.createElement("span");
    elapsed.className = "meta-chip elapsed-chip";
    elapsed.textContent = "用时 " + formatElapsed(taskState.elapsedSeconds || 0);
    meta.appendChild(elapsed);
    section.appendChild(meta);
    elements.dialogBody.appendChild(section);

    if (task.learning) {
      renderLearning(task.learning, task, taskState);
    } else if (task.sections.length) {
      var list = document.createElement("ol");
      list.className = "section-list";
      task.sections.forEach(function (node) {
        var item = document.createElement("li");
        item.className = "section-card";
        var title = document.createElement("strong");
        title.textContent = (node.subject ? node.subject + " · " : "") + node.title;
        item.appendChild(title);
        if (node.description) {
          var description = document.createElement("p");
          description.textContent = node.description;
          item.appendChild(description);
        }
        list.appendChild(item);
      });
      section.appendChild(list);
    }
    if (task.meta.kind !== "rest") {
      renderSourceAssignments(task, taskState);
      renderChoiceQuestions(task, taskState);
      renderApplicationQuestions(task, taskState);
      renderNotes(task, taskState);
      renderEvaluation(task, taskState);
      renderTaskActions(task, taskState);
    }
  }

  function renderLearning(learning, task, taskState) {
    var overview = document.createElement("section");
    overview.className = "detail-section";
    overview.innerHTML = "<h3>当日知识点简述</h3>";
    learning.overview.forEach(function (item) {
      var card = document.createElement("div");
      card.className = "lesson-card";
      var title = document.createElement("h4");
      title.textContent = item.title;
      var body = document.createElement("p");
      body.textContent = item.text;
      card.append(title, body);
      overview.appendChild(card);
    });
    elements.dialogBody.appendChild(overview);

    var references = document.createElement("p");
    references.className = "lesson-references";
    references.appendChild(document.createTextNode("原始资料："));
    learning.references.forEach(function (item, index) {
      if (index) references.appendChild(document.createTextNode(" · "));
      var link = document.createElement("a");
      link.href = encodeURI(item.path);
      link.textContent = item.title;
      link.target = "_blank";
      link.rel = "noopener";
      references.appendChild(link);
    });
    var details = document.createElement("section");
    details.className = "detail-section";
    details.innerHTML = "<h3>按导图顺序逐点讲解与独立思维导图</h3>";
    details.appendChild(references);
    if (learning.nodes) {
      var sourceNote = document.createElement("p");
      sourceNote.className = "lesson-basis";
      sourceNote.textContent = "三色笔记原文与导图节点分别标注；未在三色笔记找到对应原文的节点明确说明。右侧为该知识点速览，点击可在原版整页导图中查看位置及相邻知识点。";
      details.appendChild(sourceNote);
    }
    (learning.nodes || learning.details).forEach(function (item, index) {
      var card = document.createElement("article");
      card.className = "lesson-card lesson-node";
      var title = document.createElement("h4");
      title.textContent = item.title;
      card.appendChild(title);
      if (item.map) {
        var layout = document.createElement("div");
        layout.className = "lesson-node-layout";
        var prose = document.createElement("div");
        prose.className = "lesson-node-prose";
        renderTricolor(prose, item, learning.references);
        addLessonBlock(prose, "导图原文摘录", item.quote, "lesson-quote");
        addLessonBlock(prose, "白话讲解（零基础）", item.explain, "");
        addLessonBlock(prose, "举个例子", item.example, "");
        addLessonBlock(prose, "应试判定", item.exam, "lesson-focus");
        var basis = document.createElement("p");
        basis.className = "lesson-basis";
        basis.textContent = "依据｜" + item.basis;
        prose.appendChild(basis);
        var mapButton = document.createElement("button");
        mapButton.type = "button";
        mapButton.className = "node-map-button";
        mapButton.setAttribute("aria-label", "查看原版整页思维导图中此知识点的位置：" + item.title);
        mapButton.appendChild(buildNodeMap(item.map, false));
        var hint = document.createElement("span");
        hint.className = "node-map-hint";
        hint.textContent = "查看原版全页位置 · 第 " + (index + 1) + " 个知识点";
        mapButton.appendChild(hint);
        mapButton.addEventListener("click", function () { openNodeMap(item, mapButton, learning.mapPages); });
        var sidebar = document.createElement("div");
        sidebar.className = "lesson-node-sidebar";
        sidebar.appendChild(mapButton);
        if (learning.nodeQuestionIds) {
          var questionId = learning.nodeQuestionIds[item.title.slice(0, 5)];
          var question = task.choiceQuestions.find(function (entry) { return entry.id === questionId; });
          if (question) sidebar.appendChild(renderInlineQuestion(task, taskState, question));
        }
        layout.append(prose, sidebar);
        card.appendChild(layout);
      } else {
        item.paragraphs.forEach(function (value) { addLessonBlock(card, "", value, ""); });
      }
      details.appendChild(card);
    });
    elements.dialogBody.appendChild(details);
  }

  function renderTricolor(parent, item, references) {
    if (!item.tricolor) return;
    var block = document.createElement("section");
    block.className = "tricolor-block";
    var heading = document.createElement("h5");
    heading.textContent = "三色笔记原文" + (item.tricolor.status === "partial" ? "（部分对应）" : "");
    block.appendChild(heading);
    if (item.tricolor.status === "missing") {
      var missing = document.createElement("p");
      missing.className = "source-missing";
      missing.textContent = "三色笔记未单列此知识点的对应原文；下方保留导图原文与讲解，不将其他资料冒充三色笔记。";
      block.appendChild(missing);
    } else {
      var subject = item.title.slice(0, 2);
      var source = references.find(function (entry) { return entry.title.indexOf(subject + "2026三色笔记") === 0; });
      item.tricolor.excerpts.forEach(function (excerpt) {
        var quote = document.createElement("blockquote");
        quote.textContent = excerpt.text;
        block.appendChild(quote);
        if (source) {
          var link = document.createElement("a");
          link.href = encodeURI(source.path) + "#page=" + excerpt.page;
          link.target = "_blank";
          link.rel = "noopener";
          link.textContent = "核对三色笔记 PDF 物理第 " + excerpt.page + " 页";
          block.appendChild(link);
        }
      });
      if (item.tricolor.note) {
        var note = document.createElement("p");
        note.textContent = item.tricolor.note;
        block.appendChild(note);
      }
    }
    parent.appendChild(block);
  }

  function addLessonBlock(parent, label, value, className) {
    if (!value) return;
    var block = document.createElement("p");
    if (className) block.className = className;
    if (label) {
      var strong = document.createElement("strong");
      strong.textContent = label + "｜";
      block.appendChild(strong);
    }
    block.appendChild(document.createTextNode(value));
    parent.appendChild(block);
  }

  function buildNodeMap(map, enlarged) {
    var tree = document.createElement("div");
    tree.className = "node-map" + (enlarged ? " enlarged" : "");
    var center = document.createElement("div");
    center.className = "node-map-center";
    center.textContent = map.center;
    tree.appendChild(center);
    var branches = document.createElement("ul");
    branches.className = "node-map-branches";
    map.branches.forEach(function (branch) {
      var line = document.createElement("li");
      var label = document.createElement("span");
      label.textContent = branch;
      line.appendChild(label);
      branches.appendChild(line);
    });
    tree.appendChild(branches);
    return tree;
  }

  function openNodeMap(item, trigger, allPages) {
    var pages = allPages.filter(function (page) { return page.subject === item.mapRef.subject; });
    if (!pages.length) return;
    mapViewer = {
      item: item, pages: pages,
      pageIndex: pages.findIndex(function (page) { return page.page === item.mapRef.page; }),
      scale: 1, fit: 1, x: 0, y: 0, imageWidth: 0, imageHeight: 0,
      canvas: null, focusBox: null, pointer: null
    };
    elements.mapDialogTitle.textContent = item.title + "｜原版整页位置";
    elements.mapDialog.showModal();
    showMapPage();
    elements.closeMapDialog.focus();
    elements.mapDialog.addEventListener("close", function restoreFocus() {
      elements.mapDialog.removeEventListener("close", restoreFocus);
      trigger.focus();
    });
  }

  function showMapPage() {
    if (!mapViewer) return;
    var viewer = mapViewer;
    var page = viewer.pages[viewer.pageIndex];
    var current = page.page === viewer.item.mapRef.page;
    elements.mapPageLabel.textContent = (page.subject === "tax1" ? "税法一" : "税法二") +
      " · " + (viewer.pageIndex + 1) + "/" + viewer.pages.length + "页";
    elements.mapPageLabel.title = page.title;
    elements.previousMapPage.disabled = viewer.pageIndex === 0;
    elements.nextMapPage.disabled = viewer.pageIndex === viewer.pages.length - 1;
    elements.locateMap.disabled = !current;
    elements.mapDialogBody.setAttribute("aria-label", page.title + "原版整页导图画布，" +
      (current ? "蓝色框标记" + viewer.item.title + "。" : "当前知识点在其他页。") +
      "可拖动；聚焦后用方向键移动、加减号缩放");
    var canvas = document.createElement("div");
    canvas.className = "map-canvas";
    var image = document.createElement("img");
    image.alt = page.title + "原版整页思维导图";
    image.draggable = false;
    canvas.appendChild(image);
    var focusBox = null;
    if (current) {
      focusBox = document.createElement("div");
      focusBox.className = "map-focus";
      var label = document.createElement("span");
      label.className = "map-focus-label";
      label.textContent = "当前知识点";
      focusBox.appendChild(label);
    }
    elements.mapDialogBody.replaceChildren(canvas);
    if (focusBox) elements.mapDialogBody.appendChild(focusBox);
    viewer.canvas = canvas;
    viewer.focusBox = focusBox;
    viewer.imageWidth = 0;
    viewer.imageHeight = 0;
    image.onload = function () {
      if (mapViewer !== viewer || viewer.canvas !== canvas) return;
      viewer.imageWidth = image.naturalWidth;
      viewer.imageHeight = image.naturalHeight;
      canvas.style.width = viewer.imageWidth + "px";
      canvas.style.height = viewer.imageHeight + "px";
      fitMapPage();
    };
    image.onerror = function () {
      if (mapViewer !== viewer || viewer.canvas !== canvas) return;
      elements.mapDialogBody.textContent = "原版导图图片读取失败，请通过日课中的原版 PDF 链接查看。";
    };
    image.src = encodeURI(page.image);
  }

  function changeMapPage(delta) {
    if (!mapViewer) return;
    var next = mapViewer.pageIndex + delta;
    if (next < 0 || next >= mapViewer.pages.length) return;
    mapViewer.pageIndex = next;
    showMapPage();
  }

  function fitMapPage() {
    if (!mapViewer || !mapViewer.imageWidth) return;
    var viewer = mapViewer;
    var width = elements.mapDialogBody.clientWidth;
    var height = elements.mapDialogBody.clientHeight;
    viewer.fit = Math.min(width / viewer.imageWidth, height / viewer.imageHeight) * 0.96;
    viewer.scale = viewer.fit;
    viewer.x = (width - viewer.imageWidth * viewer.scale) / 2;
    viewer.y = (height - viewer.imageHeight * viewer.scale) / 2;
    applyMapTransform();
  }

  function locateMapFocus() {
    if (!mapViewer || !mapViewer.imageWidth || !mapViewer.focusBox) return;
    var viewer = mapViewer;
    var focus = viewer.item.mapRef.focus;
    var width = elements.mapDialogBody.clientWidth;
    var height = elements.mapDialogBody.clientHeight;
    viewer.scale = Math.min(viewer.fit * 2.2, 2);
    viewer.x = width / 2 - viewer.imageWidth * (focus.x + focus.width / 2) / 100 * viewer.scale;
    viewer.y = height / 2 - viewer.imageHeight * (focus.y + focus.height / 2) / 100 * viewer.scale;
    clampMapPosition();
    applyMapTransform();
    elements.mapDialogBody.focus();
  }

  function zoomMap(factor, anchorX, anchorY) {
    if (!mapViewer || !mapViewer.imageWidth) return;
    var viewer = mapViewer;
    var width = elements.mapDialogBody.clientWidth;
    var height = elements.mapDialogBody.clientHeight;
    var px = typeof anchorX === "number" ? anchorX : width / 2;
    var py = typeof anchorY === "number" ? anchorY : height / 2;
    var next = Math.min(Math.max(viewer.scale * factor, viewer.fit * 0.55), Math.max(viewer.fit * 8, 2));
    viewer.x = px - (px - viewer.x) * next / viewer.scale;
    viewer.y = py - (py - viewer.y) * next / viewer.scale;
    viewer.scale = next;
    clampMapPosition();
    applyMapTransform();
  }

  function clampMapPosition() {
    var viewer = mapViewer;
    if (!viewer || !viewer.imageWidth) return;
    var width = elements.mapDialogBody.clientWidth;
    var height = elements.mapDialogBody.clientHeight;
    var scaledWidth = viewer.imageWidth * viewer.scale;
    var scaledHeight = viewer.imageHeight * viewer.scale;
    viewer.x = scaledWidth <= width ? (width - scaledWidth) / 2 : Math.min(0, Math.max(width - scaledWidth, viewer.x));
    viewer.y = scaledHeight <= height ? (height - scaledHeight) / 2 : Math.min(0, Math.max(height - scaledHeight, viewer.y));
  }

  function applyMapTransform() {
    var viewer = mapViewer;
    if (!viewer || !viewer.canvas) return;
    viewer.canvas.style.transform = "translate(" + viewer.x + "px," + viewer.y + "px) scale(" + viewer.scale + ")";
    elements.mapZoomLabel.textContent = Math.round(viewer.scale / viewer.fit * 100) + "%";
    if (viewer.focusBox) {
      var focus = viewer.item.mapRef.focus;
      viewer.focusBox.style.left = viewer.x + viewer.imageWidth * focus.x / 100 * viewer.scale + "px";
      viewer.focusBox.style.top = viewer.y + viewer.imageHeight * focus.y / 100 * viewer.scale + "px";
      viewer.focusBox.style.width = viewer.imageWidth * focus.width / 100 * viewer.scale + "px";
      viewer.focusBox.style.height = viewer.imageHeight * focus.height / 100 * viewer.scale + "px";
    }
  }

  function onMapWheel(event) {
    if (!mapViewer) return;
    event.preventDefault();
    var rect = elements.mapDialogBody.getBoundingClientRect();
    zoomMap(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - rect.left, event.clientY - rect.top);
  }

  function onMapPointerDown(event) {
    if (!mapViewer || (event.pointerType === "mouse" && event.button !== 0)) return;
    mapViewer.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    elements.mapDialogBody.setPointerCapture(event.pointerId);
    elements.mapDialogBody.classList.add("dragging");
  }

  function onMapPointerMove(event) {
    if (!mapViewer || !mapViewer.pointer || mapViewer.pointer.id !== event.pointerId) return;
    mapViewer.x += event.clientX - mapViewer.pointer.x;
    mapViewer.y += event.clientY - mapViewer.pointer.y;
    mapViewer.pointer.x = event.clientX;
    mapViewer.pointer.y = event.clientY;
    clampMapPosition();
    applyMapTransform();
  }

  function onMapPointerUp(event) {
    if (!mapViewer || !mapViewer.pointer || mapViewer.pointer.id !== event.pointerId) return;
    mapViewer.pointer = null;
    elements.mapDialogBody.classList.remove("dragging");
    if (elements.mapDialogBody.hasPointerCapture(event.pointerId)) elements.mapDialogBody.releasePointerCapture(event.pointerId);
  }

  function onMapKeyDown(event) {
    if (!mapViewer || !mapViewer.imageWidth) return;
    var movement = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] }[event.key];
    if (movement) {
      event.preventDefault();
      mapViewer.x += movement[0];
      mapViewer.y += movement[1];
      clampMapPosition();
      applyMapTransform();
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault(); zoomMap(1.25);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault(); zoomMap(1 / 1.25);
    } else if (event.key === "0") {
      event.preventDefault(); fitMapPage();
    }
  }

  function renderSourceAssignments(task, taskState) {
    if (!task.sourceAssignments.length) return;
    var section = document.createElement("section");
    section.className = "detail-section";
    var heading = document.createElement("h3");
    heading.textContent = "原卷作答";
    section.appendChild(heading);
    task.sourceAssignments.forEach(function (assignment, index) {
      var card = document.createElement("div");
      card.className = "question-card";
      var title = document.createElement("strong");
      title.textContent = (index + 1) + ". " + assignment.title;
      var instruction = document.createElement("p");
      instruction.textContent = assignment.instruction;
      var link = document.createElement("a");
      link.className = "source-link";
      link.href = encodeURI(assignment.source.path);
      link.textContent = "打开原始 PDF（" + sourceText(assignment.source) + "）";
      var label = document.createElement("label");
      label.className = "field-label assignment-label";
      label.htmlFor = "assignment-" + assignment.id;
      label.textContent = assignment.responseLabel || "记录逐题答案、计算过程和待评测内容";
      var textarea = document.createElement("textarea");
      textarea.id = "assignment-" + assignment.id;
      textarea.className = "response-field";
      textarea.value = taskState.assignmentAnswers[assignment.id] || "";
      textarea.placeholder = assignment.placeholder || "按题号记录答案与计算过程；保存后导出给 GPT 评测。";
      textarea.addEventListener("input", function () {
        taskState.assignmentAnswers[assignment.id] = textarea.value;
        touchTaskState(taskState);
      });
      card.append(title, instruction, link, label, textarea);
      section.appendChild(card);
    });
    elements.dialogBody.appendChild(section);
  }

  function renderInlineQuestion(task, taskState, question) {
    var section = document.createElement("section");
    section.className = "inline-quiz";
    var kicker = document.createElement("p");
    kicker.className = "inline-quiz-kicker";
    kicker.textContent = "边学边考 · 1题";
    section.appendChild(kicker);
    var fieldset = document.createElement("fieldset");
    fieldset.dataset.questionId = question.id;
    var legend = document.createElement("legend");
    legend.textContent = (question.type === "multiple" ? "【多选】" : "【单选】") + question.prompt;
    fieldset.appendChild(legend);
    var selected = taskState.choiceAnswers[question.id] || [];
    var submitted = !!taskState.choiceSubmittedIds[question.id];
    var optionList = document.createElement("div");
    optionList.className = "option-list";
    question.options.forEach(function (option) {
      var label = document.createElement("label");
      label.className = "option";
      var input = document.createElement("input");
      input.type = question.type === "multiple" ? "checkbox" : "radio";
      input.name = "choice-" + task.meta.date + "-" + question.id;
      input.value = option.id;
      input.checked = selected.indexOf(option.id) !== -1;
      input.disabled = submitted;
      input.addEventListener("change", function () { updateChoiceAnswer(task, taskState, question, input); });
      var text = document.createElement("span");
      text.textContent = option.id + ". " + option.text;
      label.append(input, text);
      if (submitted && question.answer.indexOf(option.id) !== -1) label.classList.add("correct-option");
      if (submitted && input.checked && question.answer.indexOf(option.id) === -1) label.classList.add("wrong-option");
      optionList.appendChild(label);
    });
    fieldset.appendChild(optionList);
    if (submitted) {
      var correct = sameSet(selected, question.answer);
      var feedback = document.createElement("div");
      feedback.className = "answer-feedback" + (correct ? "" : " wrong");
      feedback.tabIndex = -1;
      feedback.setAttribute("role", "status");
      var answer = document.createElement("strong");
      answer.textContent = (correct ? "回答正确。" : "回答错误。") + "正确答案：" + question.answer.join("、");
      feedback.appendChild(answer);
      if (!correct) {
        var explanation = document.createElement("p");
        explanation.className = "explanation";
        explanation.textContent = question.explanation;
        feedback.appendChild(explanation);
      }
      fieldset.append(feedback, sourceLabel(question.source));
    } else {
      var submit = document.createElement("button");
      submit.type = "button";
      submit.className = "primary-button inline-quiz-submit";
      submit.textContent = "提交本题";
      submit.addEventListener("click", function () {
        if (!(taskState.choiceAnswers[question.id] || []).length) {
          var error = section.querySelector(".inline-quiz-error");
          if (!error) {
            error = document.createElement("p");
            error.className = "inline-quiz-error";
            error.setAttribute("role", "alert");
            fieldset.appendChild(error);
          }
          error.textContent = "请先选择答案。";
          return;
        }
        taskState.choiceSubmittedIds[question.id] = true;
        taskState.choiceSubmitted = task.choiceQuestions.every(function (entry) { return !!taskState.choiceSubmittedIds[entry.id]; });
        touchTaskState(taskState);
        var updated = renderInlineQuestion(task, taskState, question);
        section.replaceWith(updated);
        updated.querySelector(".answer-feedback").focus();
        renderCalendar();
      });
      fieldset.appendChild(submit);
    }
    section.appendChild(fieldset);
    return section;
  }

  function renderChoiceQuestions(task, taskState) {
    if (task.learning && task.learning.nodeQuestionIds) return;
    if (!task.choiceQuestions.length) return;
    var section = document.createElement("section");
    section.className = "detail-section";
    var heading = document.createElement("h3");
    heading.textContent = "选择题";
    section.appendChild(heading);

    var questions = task.meta.shuffleQuestions
      ? taskState.questionOrder.map(function (id) { return task.choiceQuestions.find(function (question) { return question.id === id; }); })
      : task.choiceQuestions;
    questions.forEach(function (question, index) {
      var fieldset = document.createElement("fieldset");
      fieldset.className = "question-card";
      fieldset.dataset.questionId = question.id;
      var legend = document.createElement("legend");
      legend.textContent = (index + 1) + ". " + (question.type === "multiple" ? "【多选题】" : "【单选题】") + question.prompt;
      fieldset.appendChild(legend);

      var selected = taskState.choiceAnswers[question.id] || [];
      var optionList = document.createElement("div");
      optionList.className = "option-list";
      question.options.forEach(function (option) {
        var label = document.createElement("label");
        label.className = "option";
        var input = document.createElement("input");
        input.type = question.type === "multiple" ? "checkbox" : "radio";
        input.name = "choice-" + task.meta.date + "-" + question.id;
        input.value = option.id;
        input.checked = selected.indexOf(option.id) !== -1;
        input.disabled = taskState.choiceSubmitted;
        input.addEventListener("change", function () {
          updateChoiceAnswer(task, taskState, question, input);
        });
        var text = document.createElement("span");
        text.textContent = option.id + ". " + option.text;
        label.append(input, text);
        if (taskState.choiceSubmitted && question.answer.indexOf(option.id) !== -1) label.classList.add("correct-option");
        if (taskState.choiceSubmitted && input.checked && question.answer.indexOf(option.id) === -1) label.classList.add("wrong-option");
        optionList.appendChild(label);
      });
      fieldset.appendChild(optionList);
      if (!task.meta.hideQuestionSourcesUntilSubmit || taskState.choiceSubmitted) fieldset.appendChild(sourceLabel(question.source));

      if (taskState.choiceSubmitted) {
        var correct = sameSet(selected, question.answer);
        var feedback = document.createElement("div");
        feedback.className = "answer-feedback" + (correct ? "" : " wrong");
        var answer = document.createElement("strong");
        answer.textContent = (correct ? "回答正确。" : "回答错误。") + "正确答案：" + question.answer.join("、");
        feedback.appendChild(answer);
        if (!correct) {
          var explanation = document.createElement("p");
          explanation.className = "explanation";
          explanation.textContent = question.explanation;
          feedback.appendChild(explanation);
        }
        fieldset.appendChild(feedback);
      }
      section.appendChild(fieldset);
    });

    if (!taskState.choiceSubmitted) {
      var submit = document.createElement("button");
      submit.className = "primary-button";
      submit.type = "button";
      submit.textContent = "提交选择题";
      submit.addEventListener("click", function () { submitChoices(task, taskState); });
      section.appendChild(submit);
    } else if (task.learning && task.learning.coverage) {
      var coverage = document.createElement("div");
      coverage.className = "lesson-card";
      var coverageTitle = document.createElement("h4");
      coverageTitle.textContent = "真题配额核验（提交后显示）";
      coverage.appendChild(coverageTitle);
      var coverageText = document.createElement("p");
      coverageText.textContent = "按高频手册的12个考点每点至少4题、另列导图司法与债权保护至少2题。仅计已核对原卷的题目；同题可关联多点，未达配额不以模拟题填充。";
      coverage.appendChild(coverageText);
      var coverageList = document.createElement("ul");
      coverageList.className = "section-list";
      task.learning.coverage.forEach(function (item) {
        var row = document.createElement("li");
        row.textContent = item.title + "：已核验 " + item.ids.length + "／目标 " + item.target + " 题" + (item.ids.length < item.target ? "（缺 " + (item.target - item.ids.length) + " 题）" : "（达标）");
        coverageList.appendChild(row);
      });
      coverage.appendChild(coverageList);
      section.appendChild(coverage);
    }
    elements.dialogBody.appendChild(section);
  }

  function updateChoiceAnswer(task, taskState, question, input) {
    if (question.type === "multiple") {
      var checked = Array.from(elements.dialogBody.querySelectorAll('[name="' + cssEscape(input.name) + '"]:checked')).map(function (item) { return item.value; });
      taskState.choiceAnswers[question.id] = checked;
    } else {
      taskState.choiceAnswers[question.id] = [input.value];
    }
    touchTaskState(taskState);
  }

  function submitChoices(task, taskState) {
    var missing = task.choiceQuestions.filter(function (question) {
      return !(taskState.choiceAnswers[question.id] || []).length;
    });
    var oldError = elements.dialogBody.querySelector(".error-summary");
    if (oldError) oldError.remove();
    if (missing.length) {
      var error = document.createElement("div");
      error.className = "error-summary";
      error.tabIndex = -1;
      error.textContent = "还有 " + missing.length + " 道选择题未作答，请完成后再提交。";
      var choiceSection = elements.dialogBody.querySelector(".question-card").parentElement;
      choiceSection.insertBefore(error, choiceSection.children[1]);
      error.focus();
      return;
    }
    taskState.choiceSubmitted = true;
    touchTaskState(taskState);
    reopenActiveDay();
    notify("选择题已提交。页面仅对错题显示解析。", false);
  }

  function renderApplicationQuestions(task, taskState) {
    if (!task.applicationQuestions.length) return;
    var section = document.createElement("section");
    section.className = "detail-section";
    var heading = document.createElement("h3");
    heading.textContent = "应用题";
    section.appendChild(heading);

    task.applicationQuestions.forEach(function (question, index) {
      var card = document.createElement("div");
      card.className = "question-card";
      var label = document.createElement("label");
      label.className = "field-label";
      label.htmlFor = "application-" + question.id;
      label.textContent = (index + 1) + ". " + question.prompt;
      var textarea = document.createElement("textarea");
      textarea.id = "application-" + question.id;
      textarea.className = "response-field";
      textarea.value = taskState.applicationAnswers[question.id] || "";
      textarea.placeholder = question.responseLabel || "在此作答。应用题由外部GPT评测。";
      textarea.addEventListener("input", function () {
        taskState.applicationAnswers[question.id] = textarea.value;
        touchTaskState(taskState);
      });
      card.append(label, textarea, sourceLabel(question.source));
      section.appendChild(card);
    });
    var note = document.createElement("p");
    note.className = "inline-status";
    note.textContent = "应用题不会在网页内显示答案、评分标准或解析。";
    section.appendChild(note);
    elements.dialogBody.appendChild(section);
  }

  function renderNotes(task, taskState) {
    var section = document.createElement("section");
    section.className = "detail-section";
    var label = document.createElement("label");
    label.className = "field-label";
    label.htmlFor = "study-notes";
    label.textContent = "当日笔记";
    var textarea = document.createElement("textarea");
    textarea.id = "study-notes";
    textarea.className = "notes-field";
    textarea.value = taskState.notes || "";
    textarea.placeholder = "记录计算过程、疑问或需要交给GPT评测的上下文。";
    textarea.addEventListener("input", function () {
      taskState.notes = textarea.value;
      touchTaskState(taskState);
    });
    section.append(label, textarea);
    elements.dialogBody.appendChild(section);
  }

  function renderEvaluation(task, taskState) {
    if (!taskState.evaluation) return;
    var section = document.createElement("section");
    section.className = "detail-section";
    var heading = document.createElement("h3");
    heading.textContent = "GPT评测记录";
    section.appendChild(heading);
    var card = document.createElement("div");
    card.className = "evaluation-card";
    var evaluation = taskState.evaluation.json;
    var grid = document.createElement("div");
    grid.className = "evaluation-grid";
    [
      ["导入时间", formatDateTime(taskState.evaluation.importedAt)],
      ["评测状态", evaluation.overall && evaluation.overall.status ? evaluation.overall.status : "已导入"],
      ["评测得分", evaluation.overall && evaluation.overall.score != null ? evaluation.overall.score + (evaluation.overall.maxScore != null ? " / " + evaluation.overall.maxScore : "") : "未提供"]
    ].forEach(function (item) {
      var box = document.createElement("div");
      var label = document.createElement("span");
      label.textContent = item[0];
      var value = document.createElement("strong");
      value.textContent = item[1];
      box.append(label, value);
      grid.appendChild(box);
    });
    card.appendChild(grid);
    if (evaluation.report && evaluation.report.summary) {
      var summary = document.createElement("p");
      summary.textContent = evaluation.report.summary;
      card.appendChild(summary);
    }
    if (taskState.evaluation.markdown) {
      var details = document.createElement("details");
      var summaryLabel = document.createElement("summary");
      summaryLabel.textContent = "查看GPT评测Markdown";
      var pre = document.createElement("pre");
      pre.textContent = taskState.evaluation.markdown;
      details.append(summaryLabel, pre);
      card.appendChild(details);
    }
    section.appendChild(card);
    elements.dialogBody.appendChild(section);
  }

  function renderTaskActions(task, taskState) {
    var section = document.createElement("section");
    section.className = "detail-section";
    var heading = document.createElement("h3");
    heading.textContent = "文件交换";
    section.appendChild(heading);
    var actions = document.createElement("div");
    actions.className = "task-actions";
    actions.append(
      actionButton("导出作答 JSON", "secondary-button", function () { exportSubmission(task, taskState, "json"); }),
      actionButton("导出作答 Markdown", "secondary-button", function () { exportSubmission(task, taskState, "md"); }),
      actionButton("导入 GPT 评测", "primary-button", function () { openEvaluationPicker(task, taskState); })
    );
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,text/markdown,.json,.md";
    input.multiple = true;
    input.hidden = true;
    input.addEventListener("change", function () { importEvaluation(task, taskState, input.files); });
    actions.appendChild(input);
    section.appendChild(actions);
    var status = document.createElement("p");
    status.className = "inline-status";
    status.textContent = taskState.exportedAt ? "最近导出：" + formatDateTime(taskState.exportedAt) : "作答草稿已保存在本机浏览器。";
    section.appendChild(status);
    elements.dialogBody.appendChild(section);

    function openEvaluationPicker() { input.click(); }
  }

  function actionButton(label, className, handler) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function exportSubmission(task, taskState, type) {
    var payload = buildSubmission(task, taskState);
    var base = task.exportMeta.filenameBase || (task.meta.date + "-CTA学习作答");
    if (type === "json") {
      download(base + ".json", JSON.stringify(payload, null, 2), "application/json");
    } else {
      download(base + ".md", submissionMarkdown(payload), "text/markdown");
    }
    taskState.exportedAt = new Date().toISOString();
    touchTaskState(taskState);
    renderCalendar();
    notify("已导出作答 " + type.toUpperCase() + " 文件。", false);
  }

  function buildSubmission(task, taskState) {
    return {
      schemaVersion: "cta-submission.v1",
      date: task.meta.date,
      dayNumber: task.meta.dayNumber || null,
      taskVersion: task.meta.version,
      exportedAt: new Date().toISOString(),
      elapsedSeconds: currentElapsedSeconds(taskState),
      choiceSubmitted: taskState.choiceSubmitted,
      choiceResponses: task.choiceQuestions.map(function (question) {
        var selected = taskState.choiceAnswers[question.id] || [];
        var submitted = task.learning && task.learning.nodeQuestionIds
          ? !!taskState.choiceSubmittedIds[question.id]
          : taskState.choiceSubmitted;
        return {
          id: question.id,
          prompt: question.prompt,
          selected: selected,
          submitted: submitted,
          correctAnswer: submitted ? question.answer : null,
          isCorrect: submitted ? sameSet(selected, question.answer) : null,
          source: question.source
        };
      }),
      applicationResponses: task.applicationQuestions.map(function (question) {
        return { id: question.id, prompt: question.prompt, response: taskState.applicationAnswers[question.id] || "", source: question.source };
      }),
      sourceAssignmentResponses: task.sourceAssignments.map(function (assignment) {
        return { id: assignment.id, title: assignment.title, instruction: assignment.instruction, response: taskState.assignmentAnswers[assignment.id] || "", source: assignment.source };
      }),
      notes: taskState.notes || ""
    };
  }

  function submissionMarkdown(payload) {
    var lines = [
      "# CTA 当日学习作答",
      "",
      "- 日期：" + payload.date,
      "- Day：" + (payload.dayNumber || "未指定"),
      "- 任务版本：" + payload.taskVersion,
      "- 导出时间：" + payload.exportedAt,
      "- 记录用时：" + formatElapsed(payload.elapsedSeconds),
      "",
      "## 选择题作答",
      ""
    ];
    payload.choiceResponses.forEach(function (item, index) {
      lines.push((index + 1) + ". " + item.prompt);
      lines.push("   - 作答：" + (item.selected.length ? item.selected.join("、") : "未作答"));
      if (item.isCorrect != null) lines.push("   - 网页即时判定：" + (item.isCorrect ? "正确" : "错误"));
      lines.push("   - 来源：" + sourceText(item.source));
    });
    lines.push("", "## 应用题作答", "");
    payload.applicationResponses.forEach(function (item, index) {
      lines.push("### " + (index + 1) + ". " + item.prompt, "", item.response || "未作答", "", "来源：" + sourceText(item.source), "");
    });
    lines.push("## 原卷作答", "");
    payload.sourceAssignmentResponses.forEach(function (item, index) {
      lines.push("### " + (index + 1) + ". " + item.title, "", item.response || "未作答", "", "来源：" + sourceText(item.source), "");
    });
    lines.push("## 当日笔记", "", payload.notes || "无", "", "> 本文件为原始作答记录，不是正式学习总结。");
    return lines.join("\n");
  }

  function importEvaluation(task, taskState, files) {
    if (!files || !files.length) return;
    var jsonFile = Array.from(files).find(function (file) { return file.name.toLowerCase().endsWith(".json"); });
    var markdownFile = Array.from(files).find(function (file) { return file.name.toLowerCase().endsWith(".md"); });
    if (!jsonFile) {
      notify("请选择包含结构化评测结果的 JSON 文件。", true);
      return;
    }
    Promise.all([
      jsonFile.text().then(JSON.parse),
      markdownFile ? markdownFile.text() : Promise.resolve("")
    ]).then(function (values) {
      var evaluation = values[0];
      validateEvaluation(evaluation, task);
      taskState.evaluation = { json: evaluation, markdown: values[1], importedAt: new Date().toISOString() };
      touchTaskState(taskState);
      reopenActiveDay();
      renderCalendar();
      notify("GPT评测已导入并保存在本机。", false);
    }).catch(function (error) {
      notify("评测导入失败：" + error.message, true);
    });
  }

  function validateEvaluation(evaluation, task) {
    if (!evaluation || evaluation.schemaVersion !== EVALUATION_SCHEMA) throw new Error("schemaVersion 必须为 " + EVALUATION_SCHEMA);
    if (evaluation.date !== task.meta.date) throw new Error("评测日期与当前日课不一致");
    if (evaluation.taskVersion !== task.meta.version) throw new Error("评测任务版本与当前日课不一致");
    if (!Array.isArray(evaluation.questionEvaluations)) throw new Error("缺少 questionEvaluations 数组");
    if (!evaluation.overall || typeof evaluation.overall !== "object") throw new Error("缺少 overall 评测结果");
  }

  function exportBackup() {
    var payload = { schemaVersion: BACKUP_SCHEMA, exportedAt: new Date().toISOString(), state: state };
    download("CTA学习日历完整备份-" + today + ".json", JSON.stringify(payload, null, 2), "application/json");
    notify("完整备份已导出。", false);
  }

  function importBackup(event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    file.text().then(JSON.parse).then(function (payload) {
      if (!payload || payload.schemaVersion !== BACKUP_SCHEMA || !payload.state || payload.state.schemaVersion !== 1) {
        throw new Error("备份格式或版本不受支持");
      }
      if (!window.confirm("导入将覆盖本机当前学习日历状态。确定继续吗？")) return;
      state = payload.state;
      state.ui = state.ui || { lastMonth: formatMonth(viewDate) };
      saveState();
      renderCalendar();
      notify("完整备份已恢复。", false);
    }).catch(function (error) {
      notify("备份导入失败：" + error.message, true);
    });
  }

  function validateTask(task) {
    var errors = [];
    if (!task || !task.meta) return ["缺少 meta"];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(task.meta.date || "")) errors.push("meta.date 必须为 YYYY-MM-DD");
    if (!task.meta.version) errors.push("缺少 meta.version");
    ["sections", "choiceQuestions", "applicationQuestions"].forEach(function (key) {
      if (!Array.isArray(task[key])) errors.push(key + " 必须为数组");
    });
    if (task.sourceAssignments == null) task.sourceAssignments = [];
    if (!Array.isArray(task.sourceAssignments)) errors.push("sourceAssignments 必须为数组");
    if (!task.exportMeta || !task.exportMeta.filenameBase) errors.push("缺少 exportMeta.filenameBase");
    (task.choiceQuestions || []).forEach(function (question) {
      if (!question.id || !["single", "multiple"].includes(question.type) || !Array.isArray(question.options) || !Array.isArray(question.answer) || !question.explanation) {
        errors.push("选择题字段不完整");
      }
      if (!question.source || !question.source.file || !question.source.page || question.source.verified !== true) errors.push("选择题必须提供已核验题源");
    });
    if (task.learning && task.learning.nodeQuestionIds) {
      var mapped = Object.keys(task.learning.nodeQuestionIds);
      var assigned = mapped.map(function (key) { return task.learning.nodeQuestionIds[key]; });
      var nodeKeys = (task.learning.nodes || []).map(function (node) { return node.title.slice(0, 5); });
      if (mapped.length !== nodeKeys.length || mapped.some(function (key) { return nodeKeys.indexOf(key) === -1; })) errors.push("知识点与随学题映射不完整");
      if (new Set(assigned).size !== assigned.length || assigned.length !== (task.choiceQuestions || []).length) errors.push("每个知识点须对应一题且不可重复");
      if (assigned.some(function (id) { return !(task.choiceQuestions || []).some(function (question) { return question.id === id; }); })) errors.push("随学题编号未找到对应题目");
    }
    (task.applicationQuestions || []).forEach(function (question) {
      if (!question.id || !question.prompt || !question.source) errors.push("应用题字段不完整");
      ["answer", "explanation", "rubric", "standardAnswer"].forEach(function (forbidden) {
        if (Object.prototype.hasOwnProperty.call(question, forbidden)) errors.push("应用题不得包含 " + forbidden);
      });
    });
    (task.sourceAssignments || []).forEach(function (assignment) {
      if (!assignment.id || !assignment.title || !assignment.instruction || !assignment.source || !assignment.source.file || !assignment.source.path || !assignment.source.pages || assignment.source.verified !== true) {
        errors.push("原卷任务必须提供完整且已核验的题源");
      }
    });
    return Array.from(new Set(errors));
  }

  function sourceLabel(source) {
    var element = document.createElement("small");
    element.className = "question-source";
    element.textContent = "来源：" + sourceText(source);
    return element;
  }

  function sourceText(source) {
    if (!source) return "未提供";
    return source.file + (source.pages ? "，PDF第" + source.pages + "页" : source.page ? "，PDF第" + source.page + "页" : "") + (source.answerPage && source.answerPage !== source.page ? "；答案/解析第" + source.answerPage + "页" : "");
  }

  function createSection(title, body) {
    var section = document.createElement("section");
    section.className = "detail-section";
    var heading = document.createElement("h3");
    heading.textContent = title;
    var paragraph = document.createElement("p");
    paragraph.textContent = body;
    section.append(heading, paragraph);
    return section;
  }

  function touchTaskState(taskState) {
    taskState.updatedAt = new Date().toISOString();
    saveState();
  }

  function startTimer(taskState) {
    stopTimer();
    activeTimerState = taskState;
    activeTimerStartedAt = Date.now();
    updateElapsedDisplay();
    timerInterval = window.setInterval(updateElapsedDisplay, 1000);
  }

  function stopTimer() {
    if (!activeTimerState) return;
    activeTimerState.elapsedSeconds = currentElapsedSeconds(activeTimerState);
    activeTimerState.updatedAt = new Date().toISOString();
    activeTimerState = null;
    activeTimerStartedAt = 0;
    window.clearInterval(timerInterval);
    timerInterval = null;
    saveState();
  }

  function currentElapsedSeconds(taskState) {
    var saved = Number(taskState.elapsedSeconds) || 0;
    if (taskState === activeTimerState && activeTimerStartedAt) {
      return saved + Math.max(0, Math.floor((Date.now() - activeTimerStartedAt) / 1000));
    }
    return saved;
  }

  function updateElapsedDisplay() {
    if (!activeTimerState) return;
    var chip = elements.dialogBody.querySelector(".elapsed-chip");
    if (chip) chip.textContent = "用时 " + formatElapsed(currentElapsedSeconds(activeTimerState));
  }

  function formatElapsed(seconds) {
    var total = Math.max(0, Number(seconds) || 0);
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var rest = Math.floor(total % 60);
    return (hours ? String(hours).padStart(2, "0") + ":" : "") + String(minutes).padStart(2, "0") + ":" + String(rest).padStart(2, "0");
  }

  function reopenActiveDay() {
    var date = activeDate;
    elements.dialogBody.replaceChildren();
    var records = history.filter(function (item) { return item.date === date; });
    if (records.length) renderHistory(records);
    if (TASKS[date]) renderTask(TASKS[date]);
  }

  function sameSet(left, right) {
    return left.slice().sort().join("|") === right.slice().sort().join("|");
  }

  function cssEscape(value) {
    return window.CSS && window.CSS.escape ? window.CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function parseMonth(value) {
    var parts = value.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, 1);
  }

  function formatMonth(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
  }

  function formatDate(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }

  function humanDate(dateKey) {
    var parts = dateKey.split("-").map(Number);
    return parts[0] + "年" + parts[1] + "月" + parts[2] + "日";
  }

  function torontoToday() {
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    var map = {};
    parts.forEach(function (part) { map[part.type] = part.value; });
    return map.year + "-" + map.month + "-" + map.day;
  }

  function updateCountdown() {
    var current = Date.parse(today + "T00:00:00Z");
    var exam = Date.parse(EXAM_DATE + "T00:00:00Z");
    var days = Math.round((exam - current) / 86400000);
    elements.countdown.textContent = days > 0 ? "剩 " + days + " 天" : days === 0 ? "今天考试" : "考试已结束";
  }

  function formatDateTime(value) {
    if (!value) return "未记录";
    return new Intl.DateTimeFormat("zh-CN", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  function download(filename, content, type) {
    var blob = new Blob([content], { type: type + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function notify(message, isError) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("error", Boolean(isError));
    elements.toast.hidden = false;
    toastTimer = setTimeout(function () { elements.toast.hidden = true; }, 4200);
  }
}());
