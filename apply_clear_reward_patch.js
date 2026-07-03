#!/usr/bin/env node
"use strict";

/**
 * CLEAR reward-feedback patch
 *
 * Run from the repository root:
 *   node apply_clear_reward_patch.js
 *
 * It updates:
 *   - app.js: adds 0.5s "✓ 됐다" feedback before moving to next card
 *   - styles.css: appends small completion/progress animations
 *
 * It does not edit api/split.js. Replace api/split.js separately with the provided split.js file.
 */

const fs = require("fs");
const path = require("path");

const APP_PATH = path.join(process.cwd(), "app.js");
const CSS_PATH = path.join(process.cwd(), "styles.css");

if (!fs.existsSync(APP_PATH)) {
  console.error("app.js를 찾지 못했어요. 레포 루트에서 실행해주세요.");
  process.exit(1);
}

if (!fs.existsSync(CSS_PATH)) {
  console.error("styles.css를 찾지 못했어요. 레포 루트에서 실행해주세요.");
  process.exit(1);
}

let app = fs.readFileSync(APP_PATH, "utf8");
let css = fs.readFileSync(CSS_PATH, "utf8");

if (!app.includes("CLEAR_STEP_FEEDBACK_PATCH")) {
  app = patchState(app);
  app = patchCompleteCurrentStep(app);
  app = patchRenderRunner(app);
  app = patchRenderSegmentedProgress(app);
} else {
  console.log("app.js에는 이미 CLEAR_STEP_FEEDBACK_PATCH가 들어있어요. 건너뜁니다.");
}

if (!css.includes("CLEAR_STEP_FEEDBACK_PATCH")) {
  css += `\n\n${cssPatch()}\n`;
} else {
  console.log("styles.css에는 이미 CLEAR_STEP_FEEDBACK_PATCH가 들어있어요. 건너뜁니다.");
}

fs.writeFileSync(APP_PATH, app, "utf8");
fs.writeFileSync(CSS_PATH, css, "utf8");

console.log("완료: app.js / styles.css 보상 피드백 패치를 적용했어요.");
console.log("확인: node --check app.js");

function patchState(source) {
  const pattern = /speedTicker:\s*null,\s*};/;
  if (!pattern.test(source)) {
    throw new Error("state 객체의 speedTicker 위치를 찾지 못했어요.");
  }

  return source.replace(
    pattern,
    `speedTicker: null,
  // CLEAR_STEP_FEEDBACK_PATCH
  stepFeedback: { active: false, stepIndex: null, completedCount: 0 },
  feedbackTimer: null,
  progressPulseIndex: null,
};`,
  );
}

function patchCompleteCurrentStep(source) {
  const replacement = `function completeCurrentStep() {
  // CLEAR_STEP_FEEDBACK_PATCH
  const task = state.activeTask;
  if (!task || state.stepFeedback?.active) return;

  const index = task.currentIndex;
  const alreadyDone = task.done.includes(index);

  if (!alreadyDone) {
    state.previousProgress = taskProgress(task);
    markSpeedWin(task, index);
    task.done.push(index);
    task.done.sort((a, b) => a - b);
  }

  const completedCount = task.done.length;
  const isFinished = completedCount >= task.steps.length;

  task.updatedAt = new Date().toISOString();
  state.stepFeedback = {
    active: true,
    stepIndex: index,
    completedCount,
  };
  state.progressPulseIndex = index;

  persistActive();
  render();

  if (!alreadyDone && completedCount > 0 && completedCount % 5 === 0 && !isFinished) {
    setToast(
      completedCount >= 15
        ? "거의 흐름 탔어."
        : completedCount >= 10
          ? "여기까지 왔다."
          : "5개 움직였어.",
    );
  }

  window.clearTimeout(state.feedbackTimer);
  state.feedbackTimer = window.setTimeout(() => {
    state.feedbackTimer = null;

    const currentTask = state.activeTask;
    if (!currentTask) {
      clearStepFeedback();
      render();
      return;
    }

    if (isFinished || currentTask.done.length >= currentTask.steps.length) {
      clearStepFeedback();
      completeTask();
      return;
    }

    const nextIndex = currentTask.steps.findIndex((_, stepIndex) => !currentTask.done.includes(stepIndex));
    currentTask.currentIndex = nextIndex === -1 ? currentTask.currentIndex : nextIndex;
    resetSpeedTimer(currentTask);
    currentTask.updatedAt = new Date().toISOString();

    clearStepFeedback();
    persistActive();
    render();

    if (state.handsfree) startRecognition();
  }, 540);
}

function clearStepFeedback() {
  // CLEAR_STEP_FEEDBACK_PATCH
  state.stepFeedback = { active: false, stepIndex: null, completedCount: 0 };
  state.progressPulseIndex = null;
}

`;

  return replaceFunctionBlock(source, "completeCurrentStep", "completeTask", replacement);
}

function patchRenderRunner(source) {
  const replacement = `function renderRunner() {
  // CLEAR_STEP_FEEDBACK_PATCH
  const task = state.activeTask;

  if (task.speedMode && !task.speedStartedAt) {
    resetSpeedTimer(task);
    persistActive();
  }

  const index = task.currentIndex;
  const isDone = task.done.includes(index);
  const feedbackActive = Boolean(state.stepFeedback?.active && state.stepFeedback.stepIndex === index);
  const progress = taskProgress(task);

  assignStepMentions(task);
  persistActive();

  const step = splitStepVisual(task.steps[index]);

  return \`
  <section class="task-runner">
  \${renderTopbar({ back: true })}

  <div class="runner-meta">
  <span>\${escapeHTML(task.title)}</span>
  <strong>\${progressDetail(task)}</strong>
  </div>

  \${renderSegmentedProgress(task.steps.length, task.done, task.currentIndex, true)}

  <button class="map-open-button" data-action="map">전체 조각 보기</button>

  <div class="step-stage \${isDone ? "completed-step" : ""} \${feedbackActive ? "step-feedback-active" : ""}" aria-live="\${feedbackActive ? "polite" : "off"}">
  \${
    feedbackActive
      ? \`<div class="step-done-burst"><strong>✓ 됐다</strong><span>하나 움직였어</span></div>\`
      : \`
        <div class="step-emoji" aria-hidden="true">\${escapeHTML(step.icon)}</div>
        <p class="step-text">\${escapeHTML(step.text)}</p>
        \${task.speedMode ? \`<div class="clear-rule">\${escapeHTML(speedRuleText(task))}</div>\` : ""}
      \`
  }
  </div>

  <div class="runner-actions">
  <button class="secondary-button" data-action="prev" \${index === 0 || feedbackActive ? "disabled" : ""}>이전 칸</button>
  <button class="secondary-button" data-action="next" \${index === task.steps.length - 1 || feedbackActive ? "disabled" : ""}>다음 칸</button>
  <button class="done-button \${isDone ? "completed" : ""} \${feedbackActive ? "feedback-done" : ""}" data-action="done" \${feedbackActive ? "disabled" : ""}>\${feedbackActive ? "✓ 됐다" : isDone ? "다음 미완료" : "클리어"}</button>
  </div>

  </section>
  \`;
}

`;

  return replaceFunctionBlock(source, "renderRunner", "renderFinish", replacement);
}

function patchRenderSegmentedProgress(source) {
  const replacement = `function renderSegmentedProgress(total, doneIndexes = [], currentIndex = -1, interactive = false) {
  // CLEAR_STEP_FEEDBACK_PATCH
  const doneSet = new Set(doneIndexes);
  const count = clamp(Number(total) || 1, 1, MAX_STEPS);

  return \`
  <div class="segmented-progress" style="--segments:\${count}" aria-label="\${count}단계 진행률">
  \${Array.from({ length: count }, (_, index) => {
    const isDone = doneSet.has(index);
    const isCurrent = index === currentIndex;
    const justDone = state.progressPulseIndex === index && isDone;
    const className = \`progress-segment \${isDone ? "done" : ""} \${isCurrent ? "current" : ""} \${justDone ? "just-done" : ""}\`;
    const label = \`\${index + 1}번째 조각\${isDone ? ", 클리어됨" : ""}\${isCurrent ? ", 현재" : ""}\`;
    return interactive
      ? \`<button class="\${className}" data-action="select-step" data-index="\${index}" aria-label="\${label}"></button>\`
      : \`<span class="\${className}" aria-label="\${label}"></span>\`;
  }).join("")}
  </div>
  \`;
}

`;

  return replaceFunctionBlock(source, "renderSegmentedProgress", "renderTaskMap", replacement);
}

function replaceFunctionBlock(source, functionName, nextFunctionName, replacement) {
  const pattern = new RegExp(
    `function\\\\s+${functionName}\\\\s*\\\\([^)]*\\\\)\\\\s*\\\\{[\\\\s\\\\S]*?\\\\n\\\\}\\\\s*\\\\nfunction\\\\s+${nextFunctionName}\\\\s*\\\\(`,
  );

  if (!pattern.test(source)) {
    throw new Error(`${functionName} 함수 블록을 찾지 못했어요.`);
  }

  return source.replace(pattern, `${replacement}function ${nextFunctionName}(`);
}

function cssPatch() {
  return `/* CLEAR_STEP_FEEDBACK_PATCH */

.step-stage {
  position: relative;
}

.step-stage.step-feedback-active {
  animation: clearCardPop 540ms cubic-bezier(0.22, 1, 0.36, 1) both;
  border-color: color-mix(in srgb, var(--mint) 56%, var(--line));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--mint) 32%, transparent),
    0 18px 48px color-mix(in srgb, var(--mint) 13%, transparent);
}

.step-done-burst {
  display: grid;
  min-height: 100%;
  place-items: center;
  align-content: center;
  gap: 10px;
  text-align: center;
  animation: clearDoneIn 380ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.step-done-burst strong {
  color: var(--mint);
  font-size: clamp(48px, 15vw, 78px);
  font-weight: 1000;
  letter-spacing: -0.05em;
  line-height: 0.95;
}

.step-done-burst span {
  color: var(--muted);
  font-size: clamp(15px, 4vw, 20px);
  font-weight: 900;
  letter-spacing: -0.02em;
}

.done-button.feedback-done {
  color: var(--mint);
  border-color: var(--mint);
  background:
    radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--mint) 16%, transparent), transparent 64%),
    color-mix(in srgb, var(--mint) 8%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--mint) 34%, transparent);
  animation: clearButtonDone 540ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.progress-segment.just-done {
  animation: progressPop 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--mint) 22%, transparent);
}

@keyframes clearCardPop {
  0% {
    transform: scale(1);
    filter: brightness(1);
  }
  42% {
    transform: scale(1.012);
    filter: brightness(1.08);
  }
  100% {
    transform: scale(1);
    filter: brightness(1);
  }
}

@keyframes clearDoneIn {
  0% {
    opacity: 0;
    transform: translateY(8px) scale(0.96);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes clearButtonDone {
  0% {
    transform: scale(1);
  }
  42% {
    transform: scale(1.018);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes progressPop {
  0% {
    transform: scaleY(1);
    filter: brightness(1);
  }
  45% {
    transform: scaleY(1.85);
    filter: brightness(1.18);
  }
  100% {
    transform: scaleY(1);
    filter: brightness(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .step-stage.step-feedback-active,
  .step-done-burst,
  .done-button.feedback-done,
  .progress-segment.just-done {
    animation: none;
  }

  .step-stage.step-feedback-active {
    filter: brightness(1.06);
  }
}`;
}
