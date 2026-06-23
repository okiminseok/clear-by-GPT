"use strict";

const STORAGE_KEYS = {
  active: "clear.activeTask.v1",
  completed: "clear.completedTasks.v1",
  theme: "clear.theme.v1",
};

const MAX_STEPS = 25;
const app = document.querySelector("#app");

const finishMessages = [
  ["{{task}}, 해냈어!", "별거 아니었지? 이미 잘 하고 있어 😊"],
  ["역시!", "시작했으니 이미 이긴 거야 💪"],
  ["최고야!", "오늘 하루 이 순간을 기억해 🌟"],
  ["잘했어!", "작은 것들이 쌓여서 큰 게 돼 🏆"],
  ["됐다.", "복잡하게 생각할 거 없었네 🙂"],
  ["이게 너야.", "결심한 걸 해내는 사람 💪"],
  ["또 했네.", "이게 쌓이면 습관이 되는 거야 🌱", { minTodayCount: 2 }],
  ["끄으읏!", "미루던 게 드디어 끝, 속이 시원하지 🫠"],
  ["오, 진짜 했다.", "너도 좀 놀랐지? 😏"],
  ["수고했어.", "오늘 너 자신한테 잘해준 거야 🤍"],
  ["잘 해냈어.", "이런 날들이 모여서 좋은 하루가 돼 🌤️"],
  ["끝.", "다음 일도 이렇게 가볍게 ✦"],
  ["정리됐다.", "머릿속도 같이 가벼워졌을 거야"],
  ["1승 추가.", "이런 1승들이 결국 인생을 바꿔 ⚔️"],
  ["방금 그거 봤어?", "망설이다가 결국 해낸 거 멋있었어 👀"],
  ["미루고 싶었을 텐데 안 미뤘네.", "그게 진짜 어려운 거였어 🎖️"],
  ["굿.", "그냥 굿이야 👍"],
  ["방금 너 좀 멋있었어.", "너도 알아챘는지 모르겠지만 😎"],
  ["이거 했으니 다음 것도 쉬울 거야.", "탄력 받았어 🛹"],
  ["흐름 탔다.", "이 기세로 하나만 더 가볼까? 😏"],
  ["고요해졌다.", "할 일이 사라지니까 마음도 조용해져 🌙"],
  ["미루기 1패 추가.", "오늘은 네가 이겼다 🥊"],
  ["잘했어, 진짜로.", "더 꾸밀 말 없어 🤍"],
  ["이제 좀 쉬어.", "그럴 자격 충분히 있어 🛋️"],
  ["오늘의 퍼즐 한 조각 맞췄다.", "그림이 조금씩 완성되고 있어 🧩"],
];

const encouragements = [
  "좋아, 하나 줄었다.",
  "방금 꽤 가볍게 넘겼어.",
  "이 속도면 금방이다.",
  "한 조각만 보면 몸이 먼저 움직여.",
  "괜찮아. 다음 한 조각만.",
  "이미 시작한 사람이 제일 세다.",
  "깔끔하게 한 칸 전진.",
  "머릿속보다 현실이 쉽다.",
  "좋아. 지금 흐름 괜찮다.",
  "끝이 보이기 시작했어.",
];

const finishIcons = ["🎉", "✨", "🌟", "🔥", "💎", "🚀", "🏆", "⚡"];

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
  menuOpen: false,
  previousProgress: 0,
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

function pickFinishMessage(todayCount) {
  const candidates = finishMessages.filter((message) => {
    const option = message[2];
    return !option?.minTodayCount || todayCount >= option.minTodayCount;
  });
  return pick(candidates);
}

function resolveFinishMessage(message, taskTitle) {
  return [
    String(message[0]).replace("{{task}}", taskTitle),
    String(message[1]).replace("{{task}}", taskTitle),
  ];
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
    if (!response.ok) throw new Error(formatAPIError(payload));

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
    state.previousProgress = 0;
    persistActive();
    if (state.handsfree) startRecognition();
  } catch (error) {
    setToast(error.message || "잠깐 삐끗했어요. 다시 눌러봐.");
  } finally {
    state.isLoading = false;
    render();
  }
}

function formatAPIError(payload) {
  const message = payload?.error || "할 일을 쪼개지 못했어요.";
  if (!payload?.debug?.checked) return message;

  const detected = Object.entries(payload.debug.checked)
    .filter(([, exists]) => exists)
    .map(([name]) => name);
  const env = payload.debug.vercelEnv || "unknown";
  const keyStatus = detected.length ? `감지된 키: ${detected.join(", ")}` : "감지된 키: 없음";
  return `${message} (${keyStatus}, 환경: ${env})`;
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
  state.menuOpen = false;
  render();
}

function moveStep(delta) {
  const task = state.activeTask;
  if (!task) return;
  state.previousProgress = taskProgress(task);
  task.currentIndex = clamp(task.currentIndex + delta, 0, task.steps.length - 1);
  task.updatedAt = new Date().toISOString();
  persistActive();
  render();
  if (state.handsfree) startRecognition();
}

function completeCurrentStep() {
  const task = state.activeTask;
  if (!task) return;

  const index = task.currentIndex;
  if (!task.done.includes(index)) {
    state.previousProgress = taskProgress(task);
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
  if (state.handsfree) startRecognition();
}

function completeTask() {
  const task = state.activeTask;
  if (!task) return;
  state.previousProgress = taskProgress(task);

  const finishedTask = {
    id: task.id,
    title: task.title,
    steps: task.steps,
    completedAt: new Date().toISOString(),
    dateKey: todayKey(),
  };

  state.completedTasks = [finishedTask, ...state.completedTasks].slice(0, 400);
  const todayDoneCount = state.completedTasks.filter((completed) => completed.dateKey === todayKey()).length;
  state.activeTask = null;
  state.route = "finish";
  state.finishMessage = resolveFinishMessage(pickFinishMessage(todayDoneCount), task.title);
  state.finishIcon = pick(finishIcons);
  persistCompleted();
  persistActive();
  stopHandsfree();
  render();
}

function restartHome() {
  state.route = "home";
  state.menuOpen = false;
  render();
}

function openHistory(date = todayKey()) {
  state.route = "history";
  state.menuOpen = false;
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

  app.innerHTML = `${view}${state.menuOpen ? renderMenu() : ""}${state.isLoading ? renderLoading() : ""}${state.toast ? renderToast() : ""}`;
  bindEvents();
  animateProgressBars();
}

function animateProgressBars() {
  const fills = app.querySelectorAll(".progress-fill[data-progress]");
  fills.forEach((fill) => {
    const next = fill.dataset.progress;
    const from = fill.dataset.fromProgress || next;
    fill.style.setProperty("--progress", `${from}%`);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fill.style.setProperty("--progress", `${next}%`);
      });
    });
  });
}

function renderTopbar({ back = false } = {}) {
  const themeLabel = state.theme === "dark" ? "라이트 모드" : "다크 모드";
  return `
    <div class="topbar">
      <div class="topbar-left">
        <button class="menu-button ${state.menuOpen ? "active" : ""}" data-action="toggle-menu" aria-label="목록 메뉴" aria-expanded="${state.menuOpen}">
          <span class="menu-line"></span>
          <span class="menu-line"></span>
          <span class="menu-line"></span>
        </button>
        ${back ? `<button class="icon-button" data-action="home" aria-label="홈으로">←</button>` : ""}
      </div>
      <div class="topbar-actions">
        ${
          state.route === "runner"
            ? `<button class="handsfree-button ${state.handsfree ? "active" : ""}" data-action="handsfree" aria-label="핸즈프리"><span class="mic-icon"></span></button>`
            : ""
        }
        <button class="theme-button" data-action="theme" aria-label="${themeLabel}">
          <span class="theme-icon" aria-hidden="true"></span>
        </button>
      </div>
    </div>
  `;
}

function renderMenu() {
  const active = state.activeTask;
  return `
    <div class="menu-backdrop" data-action="close-menu" aria-hidden="true"></div>
    <aside class="side-menu ${state.route === "home" ? "side-menu-home" : ""}" aria-label="목록 메뉴">
      <button class="menu-item" data-action="ongoing-task" ${active ? "" : "disabled"}>
        <span>진행중인 일</span>
        <strong>${active ? "1" : "0"}</strong>
      </button>
    </aside>
  `;
}

function renderHome() {
  const counts = countByDate();
  const todayCount = counts[todayKey()] || 0;
  const active = state.activeTask;

  return `
    <section class="home">
      <div class="ad-slot ad-slot-top" aria-label="광고 영역">
        <span>AD</span>
      </div>
      ${renderTopbar()}
      <div class="hero">
        <h1>Clear</h1>
        <p>미루고 있는 일을 적어줘!</p>
      </div>

      ${
        active
          ? `
            <div class="resume-card">
              <button class="resume-main" data-action="resume" aria-label="${escapeHTML(active.title)} 이어하기">
                <span class="eyebrow">최근에 하던 일</span>
                <h2 class="resume-title">${escapeHTML(active.title)}</h2>
                <div class="resume-meta">
                  <span>${active.currentIndex + 1}/${active.steps.length}번째 조각</span>
                  <strong>${taskProgress(active)}%</strong>
                </div>
                <div class="progress-track"><div class="progress-fill" style="--progress:${taskProgress(active)}%"></div></div>
              </button>
              <button class="resume-dismiss" data-action="dismiss-active" aria-label="최근에 하던 일 지우기">×</button>
            </div>
          `
          : ""
      }

      <form class="task-form" data-action="new-task-form">
        <textarea class="task-input" name="task" placeholder="예: 설거지, 방 정리, 컴활책 공부..."></textarea>
        <button class="submit-arrow" type="submit" aria-label="쪼개기">쪼개기 →</button>
      </form>

      <div class="reward-card" data-action="history" role="button" tabindex="0" aria-label="끝낸 일 보기">
        <div class="reward-head">
          <span>오늘 <strong>${todayCount}</strong>개 완료</span>
          <span>${formatMonthLabel(new Date())}</span>
        </div>
        ${renderCalendar({ mini: true, selectedDate: todayKey(), month: new Date(), counts, showHeader: false })}
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
      <div class="progress-track"><div class="progress-fill" data-from-progress="${state.previousProgress}" data-progress="${progress}" style="--progress:${progress}%"></div></div>
      <div class="step-stage">
        <p class="step-text">${escapeHTML(task.steps[index])}</p>
        <div class="motivation">${escapeHTML(state.lastMotivation || pick(encouragements))}</div>
      </div>
      <div class="runner-actions">
        <button class="secondary-button" data-action="prev" ${index === 0 ? "disabled" : ""}>이전</button>
        <button class="secondary-button" data-action="next" ${index === task.steps.length - 1 ? "disabled" : ""}>다음</button>
        <button class="done-button ${isDone ? "completed" : ""}" data-action="done">${isDone ? "완료됨" : "했어"}</button>
      </div>
    </section>
  `;
}

function renderFinish() {
  const message = state.finishMessage || finishMessages[0];
  return `
    <section class="finish-screen">
      <div class="finish-progress-area">
        <div class="runner-meta">
          <span>완료</span>
          <strong>100%</strong>
        </div>
        <div class="progress-track"><div class="progress-fill" data-from-progress="${state.previousProgress}" data-progress="100" style="--progress:100%"></div></div>
      </div>
      <div class="finish-copy">
        <div class="finish-icon" aria-hidden="true">${escapeHTML(state.finishIcon || pick(finishIcons))}</div>
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
  const selectedLabel = formatDotDate(state.selectedDate);

  return `
    <section class="history-page">
      ${renderTopbar({ back: true })}
      <h1 class="history-title">끝낸 일</h1>
      <div class="calendar-panel">
        ${renderCalendar({ mini: false, selectedDate: state.selectedDate, month: state.calendarMonth, counts })}
      </div>
      <div class="history-list">
        <h2>${selectedLabel}</h2>
        ${
          selectedItems.length
            ? selectedItems
                .map(
                  (task) => `
                    <div class="history-item">
                      <div class="history-item-copy">
                        <strong>${escapeHTML(task.title)}</strong>
                        <span>${task.steps.length}개 조각 완료 · ${formatTime(task.completedAt)}</span>
                      </div>
                      <button class="history-delete" data-action="delete-completed" data-id="${escapeHTML(task.id)}" aria-label="${escapeHTML(task.title)} 삭제">×</button>
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

function renderCalendar({ mini, selectedDate, month, counts, showHeader = true }) {
  const first = startOfMonth(month);
  const monthLabel = formatMonthLabel(first);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, offset) => {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const key = dateKey(date);
    const count = counts[key] || 0;
    const outside = date.getMonth() !== first.getMonth();
    const weekday = date.getDay();
    const weekendClass = weekday === 0 ? "sunday" : weekday === 6 ? "saturday" : "";
    const tag = mini ? "div" : "button";
    const attrs = mini ? "" : `data-action="select-date" data-date="${key}" aria-label="${key}, 완료 ${count}개"`;
    return `
      <${tag} class="day-cell ${weekendClass} ${outside ? "outside" : ""} ${count ? "has-count" : ""} ${key === selectedDate ? "selected" : ""}"
        ${attrs}>
        <span class="day-number">${date.getDate()}</span>
        ${count ? `<span class="count">${count}</span>` : ""}
      </${tag}>
    `;
  }).join("");

  return `
    <div class="${mini ? "mini-calendar" : "calendar"}">
      ${
        showHeader
          ? `
            <div class="calendar-header">
              ${
                mini
                  ? "<span></span>"
                  : `<button class="triangle-button" data-action="prev-month" aria-label="이전 달"><span class="triangle left"></span></button>`
              }
              <div class="month-label">${monthLabel}</div>
              ${
                mini
                  ? "<span></span>"
                  : `<button class="triangle-button" data-action="next-month" aria-label="다음 달"><span class="triangle right"></span></button>`
              }
            </div>
          `
          : ""
      }
      <div class="weekdays">
        <span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
      </div>
      <div class="days-grid">${cells}</div>
    </div>
  `;
}

function formatMonthLabel(date) {
  return `${date.getFullYear()}.${date.getMonth() + 1}`;
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
  if (action === "toggle-menu") toggleMenu();
  if (action === "close-menu") closeMenu();
  if (action === "ongoing-task") openOngoingTask();
  if (action === "dismiss-active") dismissActiveTask();
  if (action === "delete-completed") deleteCompletedTask(element.dataset.id);

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

function toggleMenu() {
  state.menuOpen = !state.menuOpen;
  render();
}

function closeMenu() {
  state.menuOpen = false;
  render();
}

function openOngoingTask() {
  if (!state.activeTask) return;
  state.route = "runner";
  state.menuOpen = false;
  render();
}

function dismissActiveTask() {
  if (!state.activeTask) return;
  const confirmed = window.confirm("진행중인 일을 지울까요?");
  if (!confirmed) return;
  state.activeTask = null;
  state.menuOpen = false;
  persistActive();
  setToast("최근 작업을 지웠어.");
}

function deleteCompletedTask(id) {
  if (!id) return;
  const exists = state.completedTasks.some((task) => task.id === id);
  if (!exists) return;
  const confirmed = window.confirm("끝낸 일을 지울까요?");
  if (!confirmed) return;
  state.completedTasks = state.completedTasks.filter((task) => task.id !== id);
  persistCompleted();
  setToast("끝낸 일을 지웠어.");
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

function formatDotDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return `${year}.${month}.${day}`;
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
  startRecognition();
}

function stopHandsfree() {
  state.handsfree = false;
  if (state.recognition) {
    state.recognition.onend = null;
    state.recognition.stop();
    state.recognition = null;
  }
}

function startRecognition() {
  if (state.recognition) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setToast("이 브라우저는 음성 명령을 지원하지 않아. 버튼은 계속 쓸 수 있어.");
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
  if (text.includes("완료") || text.includes("했어") || text.includes("했다고") || text.includes("그래") || text.includes("응") || text.includes("오케이") || text.includes("ok")) {
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
