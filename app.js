"use strict";

const STORAGE_KEYS = {
  active: "clear.activeTask.v1",
  completed: "clear.completedTasks.v1",
  theme: "clear.theme.v1",
};

const MAX_STEPS = 25;
const app = document.querySelector("#app");

const finishMessages = [
  ["다 했다", "생각보다 별거 아니었지?"],
  ["끝났다", "시작하니까 길이 생겼지?"],
  ["CLEAR", "오늘의 너, 꽤 멋있다."],
  ["해냈다", "마음보다 일이 작았네."],
  ["정리 완료", "이제 머리가 조금 조용해졌을 거야."],
  ["클리어", "한 칸 넘겼다. 충분히 잘했다."],
];

const encouragements = [
  "좋아, 하나 줄었다.",
  "방금 꽤 가볍게 넘겼어.",
  "이 속도면 금방이다.",
  "작게 쪼개면 몸이 먼저 움직여.",
  "괜찮아. 다음 한 조각만.",
  "이미 시작한 사람이 제일 세다.",
  "깔끔하게 한 칸 전진.",
  "머릿속보다 현실이 쉽다.",
  "좋아. 지금 흐름 괜찮다.",
  "끝이 보이기 시작했어.",
];

const voiceHints = [
  "완료라고 말하면 지금 일을 끝낸 것으로 표시해요.",
  "다음, 이전, 중지라고 말할 수 있어요.",
  "핸즈프리 켜짐. 지금 할 일을 읽어줄게요.",
];

const state = {
  route: "home",
  activeTask: loadJSON(STORAGE_KEYS.active, null),
  completedTasks: loadJSON(STORAGE_KEYS.completed, []),
  selectedDate: todayKey(),
  calendarMonth: startOfMonth(new Date()),
  isLoading: false,
  toast: "",
  handsfree: false,
  recognition: null,
  lastMotivation: "",
  theme: loadJSON(STORAGE_KEYS.theme, "light"),
};

document.documentElement.dataset.theme = state.theme;

function loadJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function todayKey() {
  return dateKey(new Date());
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function setToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(setToast.timer);
  setToast.timer = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 2600);
}

function taskProgress(task) {
  if (!task || !task.steps.length) return 0;
  return Math.round((task.done.length / task.steps.length) * 100);
}

function persistActive() {
  if (state.activeTask) saveJSON(STORAGE_KEYS.active, state.activeTask);
  else localStorage.removeItem(STORAGE_KEYS.active);
}

function persistCompleted() {
  saveJSON(STORAGE_KEYS.completed, state.completedTasks);
}

async function createTask(rawTitle) {
  const title = rawTitle.trim();
  if (!title) {
    setToast("할 일을 한 줄만 적어줘.");
    return;
  }

  state.isLoading = true;
  render();

  try {
    const response = await fetch("/api/split", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: title }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "할 일을 쪼개지 못했어요.");

    const steps = sanitizeSteps(payload.steps, title);
    state.activeTask = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      title,
      steps,
      done: [],
      currentIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.route = "runner";
    state.lastMotivation = pick(encouragements);
    persistActive();
    if (state.handsfree) speakCurrentStep();
  } catch (error) {
    setToast(error.message || "잠깐 삐끗했어요. 다시 눌러봐.");
  } finally {
    state.isLoading = false;
    render();
  }
}

function sanitizeSteps(steps, fallbackTitle) {
  const clean = Array.isArray(steps)
    ? steps
        .map((step) => String(step || "").trim())
        .filter(Boolean)
        .slice(0, MAX_STEPS)
    : [];

  if (clean.length) return clean;

  return [
    `${fallbackTitle}에 필요한 물건 하나만 꺼내기`,
    "바로 보이는 첫 부분 30초만 처리하기",
    "다음 작은 부분 하나만 끝내기",
    "마지막으로 자리만 가볍게 정리하기",
  ];
}

function setRoute(route) {
  state.route = route;
  render();
}

function moveStep(delta) {
  const task = state.activeTask;
  if (!task) return;
  task.currentIndex = clamp(task.currentIndex + delta, 0, task.steps.length - 1);
  task.updatedAt = new Date().toISOString();
  persistActive();
  render();
  if (state.handsfree) speakCurrentStep();
}

function completeCurrentStep() {
  const task = state.activeTask;
  if (!task) return;

  const index = task.currentIndex;
  if (!task.done.includes(index)) {
    task.done.push(index);
    task.done.sort((a, b) => a - b);
    state.lastMotivation = pick(encouragements);
  }

  if (task.done.length >= task.steps.length) {
    completeTask();
    return;
  }

  const nextIndex = task.steps.findIndex((_, stepIndex) => !task.done.includes(stepIndex));
  task.currentIndex = nextIndex === -1 ? task.currentIndex : nextIndex;
  task.updatedAt = new Date().toISOString();
  persistActive();
  render();
  if (state.handsfree) speakCurrentStep();
}

function completeTask() {
  const task = state.activeTask;
  if (!task) return;

  const finishedTask = {
    id: task.id,
    title: task.title,
    steps: task.steps,
    completedAt: new Date().toISOString(),
    dateKey: todayKey(),
  };

  state.completedTasks = [finishedTask, ...state.completedTasks].slice(0, 400);
  state.activeTask = null;
  state.route = "finish";
  state.finishMessage = pick(finishMessages);
  persistCompleted();
  persistActive();
  stopHandsfree();
  render();
}

function restartHome() {
  state.route = "home";
  render();
}

function openHistory(date = todayKey()) {
  state.route = "history";
  state.selectedDate = date;
  const [year, month] = date.split("-").map(Number);
  state.calendarMonth = new Date(year, month - 1, 1);
  render();
}

function countByDate() {
  return state.completedTasks.reduce((acc, task) => {
    acc[task.dateKey] = (acc[task.dateKey] || 0) + 1;
    return acc;
  }, {});
}

function render() {
  if (state.route === "runner" && !state.activeTask) state.route = "home";

  const view =
    state.route === "runner"
      ? renderRunner()
      : state.route === "finish"
        ? renderFinish()
        : state.route === "history"
          ? renderHistory()
          : renderHome();

  app.innerHTML = `${view}${state.isLoading ? renderLoading() : ""}${state.toast ? renderToast() : ""}`;
  bindEvents();
}

function renderTopbar({ back = false } = {}) {
  const themeLabel = state.theme === "dark" ? "라이트 모드" : "다크 모드";
  return `
    <div class="topbar">
      ${
        back
          ? `<button class="icon-button" data-action="home" aria-label="홈으로">←</button>`
          : `<span class="topbar-spacer" aria-hidden="true"></span>`
      }
      <div class="topbar-actions">
        ${
          state.route === "runner"
            ? `<button class="handsfree-button ${state.handsfree ? "active" : ""}" data-action="handsfree" aria-label="핸즈프리"><span class="mic-icon"></span></button>`
            : ""
        }
        <button class="theme-button" data-action="theme" aria-label="${themeLabel}">
          <span class="theme-icon"></span>
        </button>
      </div>
    </div>
  `;
}

function renderHome() {
  const counts = countByDate();
  const todayCount = counts[todayKey()] || 0;
  const active = state.activeTask;

  return `
    <section class="home">
      ${renderTopbar()}
      <div class="hero">
        <h1>CLEAR</h1>
        <p>미루고 있는 일을 적어줘!</p>
      </div>

      ${
        active
          ? `
            <button class="resume-card" data-action="resume">
              <span class="eyebrow">최근에 하던 일</span>
              <h2 class="resume-title">${escapeHTML(active.title)}</h2>
              <div class="progress-track"><div class="progress-fill" style="--progress:${taskProgress(active)}%"></div></div>
              <div class="resume-meta">
                <span>${active.currentIndex + 1}/${active.steps.length}번째 조각</span>
                <strong>${taskProgress(active)}%</strong>
              </div>
            </button>
          `
          : ""
      }

      <form class="task-form" data-action="new-task-form">
        <textarea class="task-input" name="task" placeholder="예: 설거지, 방 정리, 컴활책 공부..."></textarea>
        <button class="primary-button" type="submit">가볍게 시작하기</button>
      </form>

      <div class="stat-strip" data-action="history" role="button" tabindex="0" aria-label="끝낸 일 보기">
        <span class="today-count"><strong>${todayCount}</strong><span>오늘 한 일</span></span>
        ${renderCalendar({ mini: true, selectedDate: todayKey(), month: new Date(), counts })}
      </div>
    </section>
  `;
}

function renderRunner() {
  const task = state.activeTask;
  const index = task.currentIndex;
  const isDone = task.done.includes(index);
  const progress = taskProgress(task);

  return `
    <section class="task-runner">
      ${renderTopbar({ back: true })}
      <div class="runner-meta">
        <span>${escapeHTML(task.title)}</span>
        <strong>${progress}%</strong>
      </div>
      <div class="progress-track"><div class="progress-fill" style="--progress:${progress}%"></div></div>
      <div class="step-stage">
        <p class="step-text">${escapeHTML(task.steps[index])}</p>
        <div class="motivation">${escapeHTML(state.lastMotivation || pick(encouragements))}</div>
      </div>
      <div class="runner-actions">
        <button class="secondary-button" data-action="prev" ${index === 0 ? "disabled" : ""}>이전</button>
        <button class="done-button ${isDone ? "completed" : ""}" data-action="done">${isDone ? "완료됨" : "했어"}</button>
        <button class="secondary-button" data-action="next" ${index === task.steps.length - 1 ? "disabled" : ""}>다음</button>
      </div>
    </section>
  `;
}

function renderFinish() {
  const message = state.finishMessage || finishMessages[0];
  return `
    <section class="finish-screen">
      <div>
        <h1 class="finish-title">${escapeHTML(message[0])}</h1>
        <p class="finish-subtitle">${escapeHTML(message[1])}</p>
      </div>
      <div class="finish-actions">
        <button class="primary-button" data-action="home">다른 할일도 하기</button>
        <button class="secondary-button" data-action="history">끝낸 일들 보기</button>
      </div>
    </section>
  `;
}

function renderHistory() {
  const counts = countByDate();
  const selectedItems = state.completedTasks.filter((task) => task.dateKey === state.selectedDate);
  const selectedLabel = formatKoreanDate(state.selectedDate);

  return `
    <section class="history-page">
      ${renderTopbar({ back: true })}
      <div class="calendar-panel">
        ${renderCalendar({ mini: false, selectedDate: state.selectedDate, month: state.calendarMonth, counts })}
      </div>
      <div class="history-list">
        <h2>${selectedLabel} 끝낸 일</h2>
        ${
          selectedItems.length
            ? selectedItems
                .map(
                  (task) => `
                    <div class="history-item">
                      <strong>${escapeHTML(task.title)}</strong>
                      <span>${task.steps.length}개 조각 완료 · ${formatTime(task.completedAt)}</span>
                    </div>
                  `,
                )
                .join("")
            : `<div class="empty">이 날은 아직 비어 있어.</div>`
        }
      </div>
    </section>
  `;
}

function renderCalendar({ mini, selectedDate, month, counts }) {
  const first = startOfMonth(month);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, offset) => {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const key = dateKey(date);
    const count = counts[key] || 0;
    const outside = date.getMonth() !== first.getMonth();
    const tag = mini ? "div" : "button";
    const attrs = mini ? "" : `data-action="select-date" data-date="${key}" aria-label="${key}, 완료 ${count}개"`;
    return `
      <${tag} class="day-cell ${outside ? "outside" : ""} ${count ? "has-count" : ""} ${key === selectedDate ? "selected" : ""}"
        ${attrs}>
        <span>${date.getDate()}</span>
        ${count ? `<span class="count">${count}</span>` : ""}
      </${tag}>
    `;
  }).join("");

  return `
    <div class="${mini ? "mini-calendar" : "calendar"}">
      <div class="calendar-header">
        ${
          mini
            ? "<span></span>"
            : `<button class="triangle-button" data-action="prev-month" aria-label="이전 달"><span class="triangle left"></span></button>`
        }
        <div class="month-label">${first.getFullYear()}년 ${first.getMonth() + 1}월</div>
        ${
          mini
            ? "<span></span>"
            : `<button class="triangle-button" data-action="next-month" aria-label="다음 달"><span class="triangle right"></span></button>`
        }
      </div>
      <div class="weekdays">
        <span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
      </div>
      <div class="days-grid">${cells}</div>
    </div>
  `;
}

function renderLoading() {
  return `
    <div class="modal-backdrop" role="status" aria-live="polite">
      <div class="loading-modal">
        <div class="loader"></div>
        <strong>할일을 쪼개는 중 입니다</strong>
      </div>
    </div>
  `;
}

function renderToast() {
  return `<div class="toast">${escapeHTML(state.toast)}</div>`;
}

function bindEvents() {
  app.querySelectorAll("[data-action]").forEach((element) => {
    const action = element.dataset.action;
    if (action === "new-task-form") {
      element.addEventListener("submit", (event) => {
        event.preventDefault();
        createTask(new FormData(element).get("task") || "");
      });
      return;
    }

    element.addEventListener("click", () => handleAction(element));
    element.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && element.getAttribute("role") === "button") {
        event.preventDefault();
        handleAction(element);
      }
    });
  });
}

function handleAction(element) {
  const action = element.dataset.action;

  if (action === "home") restartHome();
  if (action === "resume") setRoute("runner");
  if (action === "history") openHistory();
  if (action === "prev") moveStep(-1);
  if (action === "next") moveStep(1);
  if (action === "done") completeCurrentStep();
  if (action === "handsfree") toggleHandsfree();
  if (action === "theme") toggleTheme();

  if (action === "select-date") {
    state.selectedDate = element.dataset.date;
    if (state.route !== "history") openHistory(state.selectedDate);
    else render();
  }

  if (action === "prev-month" || action === "next-month") {
    const delta = action === "prev-month" ? -1 : 1;
    state.calendarMonth = new Date(
      state.calendarMonth.getFullYear(),
      state.calendarMonth.getMonth() + delta,
      1,
    );
    render();
  }
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = state.theme;
  saveJSON(STORAGE_KEYS.theme, state.theme);
  render();
}

function formatKoreanDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function formatTime(iso) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function toggleHandsfree() {
  if (state.handsfree) {
    stopHandsfree();
    render();
    return;
  }
  startHandsfree();
}

function startHandsfree() {
  state.handsfree = true;
  render();
  speak(pick(voiceHints), () => speakCurrentStep());
  startRecognition();
}

function stopHandsfree() {
  state.handsfree = false;
  window.speechSynthesis?.cancel();
  if (state.recognition) {
    state.recognition.onend = null;
    state.recognition.stop();
    state.recognition = null;
  }
}

function speakCurrentStep() {
  const task = state.activeTask;
  if (!state.handsfree || !task) return;
  const text = `${task.currentIndex + 1}번째. ${task.steps[task.currentIndex]}`;
  speak(text);
}

function speak(text, onEnd) {
  if (!("speechSynthesis" in window)) {
    if (onEnd) onEnd();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  utterance.rate = 1;
  utterance.pitch = 1.04;
  utterance.onend = () => {
    if (onEnd) onEnd();
  };
  window.speechSynthesis.speak(utterance);
}

function startRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setToast("이 브라우저는 음성 명령을 지원하지 않아. 읽어주기는 계속할게.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "ko-KR";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    const transcript = result[0].transcript.replace(/\s/g, "");
    handleVoiceCommand(transcript);
  };
  recognition.onerror = () => {
    if (state.handsfree) setToast("음성 명령이 잠깐 끊겼어. 버튼은 계속 쓸 수 있어.");
  };
  recognition.onend = () => {
    if (state.handsfree) {
      try {
        recognition.start();
      } catch {
        /* Browser may already be restarting recognition. */
      }
    }
  };

  state.recognition = recognition;
  try {
    recognition.start();
  } catch {
    setToast("음성 인식을 시작하지 못했어. 마이크 권한을 확인해줘.");
  }
}

function handleVoiceCommand(text) {
  if (!state.activeTask) return;
  if (text.includes("완료") || text.includes("했어") || text.includes("끝")) {
    completeCurrentStep();
  } else if (text.includes("다음")) {
    moveStep(1);
  } else if (text.includes("이전") || text.includes("뒤로")) {
    moveStep(-1);
  } else if (text.includes("중지") || text.includes("꺼") || text.includes("그만")) {
    stopHandsfree();
    render();
  }
}

render();
