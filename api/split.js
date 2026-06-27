const MAX_STEPS = 25;
const MAX_STEP_TEXT_LENGTH = 40;
const MAX_DISPLAY_TITLE_LENGTH = 20;
const MAX_OUTPUT_TOKENS = 2048;

const API_KEY_NAMES = ["CLEAR_API_GEMINI"];
const FALLBACK_EMOJIS = ["✨", "✦", "💫", "🌟", "⚡", "🎯"];

const AREA_LABELS = {
body: "몸",
study_work: "공부/일",
life: "생활",
mind: "마음",
};

const AREA_COLORS = {
body: {
label: "몸",
pebble: "#FBE3EA",
accent: "#F4AFC0",
text: "#7A3F50",
},
study_work: {
label: "공부/일",
pebble: "#E2F3FC",
accent: "#9FD2F1",
text: "#356B8A",
},
life: {
label: "생활",
pebble: "#E2F6F1",
accent: "#9DDCCE",
text: "#346F63",
},
mind: {
label: "마음",
pebble: "#F0E3FA",
accent: "#D3B1EC",
text: "#66447D",
},
};

const VALID_AREAS = Object.keys(AREA_LABELS);

const SYSTEM_PROMPT = `CLEAR_SYSTEM_PROMPT_V5.39

미루는 일을 게임처럼 포장하지 않고, 게임처럼 이어지게 돕는다.

할 일을 5~25개의 마이크로 행동으로 쪼개라.

목표는 사용자가 바로 하나를 하고,
다음 칸으로 넘기고 싶게 만드는 것이다.

규칙:

1. 작고 구체적으로 ("쓰레기 한 개 줍기" O, "쓰레기 정리하기" X)

2. 말하지 않은 구체적 디테일은 임의로 꾸며내지 마.
   단, 그 일에 일반적으로 필요한 절차나 환경은 자연스럽게 사용해도 된다.

3. 각 단계는 10~30초 목표, 어려우면 유연하게

4. 장기 작업은 오늘 바로 움직일 수 있는 작은 부분만 쪼개기

5. 순서: 초반 3~5개는 극도로 쉽게, 중간은 반복 패턴, 끝은 현실 행동으로 마무리감

6. 앱 안 보상보다 현실 변화가 보이는 행동을 우선해

7. 사용자가 "이거 하나면 하겠다" 싶고 다음 칸으로 넘기고 싶게 리듬을 만들어

8. 단계 안에서 선택한 대상·행동·목적지·표현은 현실적으로도, 문장적으로도 자연스럽게 맞아야 한다.

9. 목적지가 확실하지 않으면 목적지를 말하지 마

10. 서로 다른 대상 종류를 한 단계에 섞지 마

11. trash는 "쓰레기"로 쓰고, "휴지"로 쓰지 마

12. 각 단계에 이모지 1개

13. 이 앱을 보며 다음 단계로 넘겨야 하므로 휴대폰/화면/브라우저/앱을 못 쓰게 만드는 행동은 금지

* 금지 예: 휴대폰 내려놓기, 폰 멀리 두기, 화면 끄기, 앱 닫기, 브라우저 닫기, 알림 끄기

14. 짧은 한국어 displayTitle과 area도 반환

* area는 body, study_work, life, mind 중 하나

JSON만:
{
"displayTitle": "...",
"area": "life",
"steps": [
{
"text": "행동",
"emoji": "🗑️"
}
]
}
`;

module.exports = async function handler(req, res) {
if (req.method !== "POST") {
res.setHeader("Allow", "POST");
return res.status(405).json({ error: "POST만 사용할 수 있어요." });
}

const apiKey = getApiKey();
const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

if (!apiKey) {
return res.status(500).json({
error:
"API 키가 연결되지 않았어요. Vercel 환경변수에 ANTHROPIC_API_KEY를 추가하고, 지금 테스트하는 배포 환경을 다시 배포해주세요.",
debug: getEnvDebug(),
});
}

let body = req.body || {};
if (typeof body === "string") {
try {
body = JSON.parse(body || "{}");
} catch {
return res.status(400).json({ error: "요청 JSON을 읽지 못했어요." });
}
}

const task = String(body.task || "").trim();
if (!task) {
return res.status(400).json({ error: "쪼갤 할 일을 보내주세요." });
}

try {
const response = await fetch("https://api.anthropic.com/v1/messages", {
method: "POST",
headers: {
"x-api-key": apiKey,
"anthropic-version": "2023-06-01",
"Content-Type": "application/json",
},
body: JSON.stringify({
model,
max_tokens: MAX_OUTPUT_TOKENS,
system: SYSTEM_PROMPT,
messages: [{ role: "user", content: task }],
}),
});

```
const data = await response.json();

if (!response.ok) {
  return res.status(response.status).json({
    error: data.error?.message || "Anthropic API 요청에 실패했어요.",
  });
}

const result = parseOutputResult(data, task);

if (!result.steps.length) {
  return res.status(502).json({
    error: "쪼갠 결과를 읽지 못했어요. 다시 시도해주세요.",
    debug: { raw: parseOutputText(data) },
  });
}

return res.status(200).json(result);
```

} catch (error) {
return res.status(500).json({
error: error.message || "서버에서 문제가 생겼어요.",
});
}
};

function getApiKey() {
const foundName = API_KEY_NAMES.find((name) => process.env[name]);
return foundName ? process.env[foundName] : "";
}

function getEnvDebug() {
return {
vercelEnv: process.env.VERCEL_ENV || "unknown",
checked: API_KEY_NAMES.reduce((acc, name) => {
acc[name] = Boolean(process.env[name]);
return acc;
}, {}),
};
}

function parseOutputText(data) {
if (data.output_text) return data.output_text;

if (Array.isArray(data.content)) {
return data.content
.map((content) => (content.type === "text" ? content.text || "" : ""))
.join("");
}

return data.output
?.flatMap((item) => item.content || [])
?.map((content) => content.text || "")
?.join("");
}

function parseOutputResult(data, originalGoal = "") {
const text = parseOutputText(data);
if (!text) throw new Error("Anthropic 응답이 비어 있어요.");

const parsedResult = parseJSONResult(text, originalGoal);
if (parsedResult.steps.length) return parsedResult;

const steps = cleanSteps(
stripCodeFence(text)
.split(/\r?\n/)
.map((line) =>
line
.trim()
.replace(/^[-*•]\s+/, "")
.replace(/^\d+[.)]\s+/, "")
.replace(/^[[ xX]]\s+/, "")
.replace(/^["'“”‘’]+|["'“”‘’]+$/g, ""),
)
.filter((line) => line && !isJSONFragment(line)),
);

return buildResult({
originalGoal,
displayTitle: "",
area: "",
steps,
});
}

function parseOutputSteps(data) {
return parseOutputResult(data).steps;
}

function parseJSONResult(text, originalGoal = "") {
const candidates = [
text,
stripCodeFence(text),
extractJSONBlock(stripCodeFence(text)),
].filter(Boolean);

for (const candidate of candidates) {
try {
const parsed = JSON.parse(candidate);
const source = Array.isArray(parsed) ? parsed : parsed.steps;

```
  if (Array.isArray(source)) {
    return buildResult({
      originalGoal,
      displayTitle: parsed.displayTitle,
      area: parsed.area,
      steps: cleanSteps(source),
    });
  }
} catch {
  // Try next candidate.
}
```

}

return buildResult({
originalGoal,
displayTitle: "",
area: "",
steps: parseLooseJSONSteps(stripCodeFence(text)),
});
}

function parseLooseJSONSteps(text) {
const source = String(text || "");
const objectMatches = source.match(/{[^{}]*"text"\s*:[^{}]*}/g) || [];

const objectSteps = objectMatches
.map((item) => {
try {
return JSON.parse(item.replace(/,+$/, ""));
} catch {
return null;
}
})
.filter(Boolean);

if (objectSteps.length) return cleanSteps(objectSteps);

const pairSteps = [];
const pairPattern =
/"text"\s*:\s*"([^"]+)"[\s\S]{0,80}?"(?:emoji|icon)"\s*:\s*"([^"]*)"/g;

let match;
while ((match = pairPattern.exec(source))) {
pairSteps.push({ text: match[1], emoji: match[2] });
}

return pairSteps.length ? cleanSteps(pairSteps) : [];
}

function buildResult({ originalGoal = "", displayTitle = "", area = "", steps = [] }) {
const normalizedArea = normalizeArea(area);
const normalizedTitle = normalizeDisplayTitle(displayTitle, originalGoal);

return {
displayTitle: normalizedTitle,
area: normalizedArea,
areaLabel: AREA_LABELS[normalizedArea],
areaColor: AREA_COLORS[normalizedArea],
steps,
};
}

function normalizeArea(area) {
const value = String(area || "").trim();
return VALID_AREAS.includes(value) ? value : "life";
}

function normalizeDisplayTitle(displayTitle, originalGoal = "") {
const title = String(displayTitle || "")
.trim()
.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");

if (title && !isJSONFragment(title)) {
return limitText(title, MAX_DISPLAY_TITLE_LENGTH);
}

const fallback = String(originalGoal || "").trim();
return fallback ? limitText(fallback, MAX_DISPLAY_TITLE_LENGTH) : "할 일";
}

function stripCodeFence(text) {
return String(text || "")
.trim()
.replace(/^`(?:json|text)?\s*/i, "")
    .replace(/\s*`$/i, "")
.trim();
}

function extractJSONBlock(text) {
const value = String(text || "");
const start = value.indexOf("{");
const end = value.lastIndexOf("}");

if (start === -1 || end === -1 || end <= start) return "";

return value.slice(start, end + 1);
}

function cleanSteps(values) {
let lastFallback = "";

return values
.map((step) => {
const formatted = formatStep(step, lastFallback);
if (formatted.fallbackUsed) lastFallback = formatted.emoji;
return formatted.value;
})
.filter(Boolean)
.slice(0, MAX_STEPS);
}

function formatStep(step, lastFallback = "") {
const parsedStringStep = parseStepObjectString(step);
if (parsedStringStep) return formatStep(parsedStringStep, lastFallback);

if (step && typeof step === "object") {
const text = normalizeActionText(
limitText(String(step.text || step.action || step.step || "").trim()),
);

```
if (!text || isJSONFragment(text) || blocksAppUse(text) || isBadActionText(text)) {
  return emptyStep();
}

const picked = normalizeEmoji(step.emoji || step.icon, lastFallback);

return {
  value: [picked.emoji, text].filter(Boolean).join(" ").trim(),
  emoji: picked.emoji,
  fallbackUsed: picked.fallbackUsed,
};
```

}

const value = normalizeActionText(limitText(String(step || "").trim()));

if (!value || isJSONFragment(value) || blocksAppUse(value) || isBadActionText(value)) {
return emptyStep();
}

const match = value.match(
/^(\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*)\s*(.+)$/u,
);

if (!match) {
const picked = pickFallbackEmoji(lastFallback);
return {
value: `${picked} ${value}`.trim(),
emoji: picked,
fallbackUsed: true,
};
}

const picked = normalizeEmoji(match[1], lastFallback);
const text = normalizeActionText(limitText(match[2].trim()));

if (!text || isBadActionText(text)) return emptyStep();

return {
value: [picked.emoji, text].filter(Boolean).join(" ").trim(),
emoji: picked.emoji,
fallbackUsed: picked.fallbackUsed,
};
}

function normalizeActionText(text) {
return String(text || "")
.trim()
.replace(/명백한\s*/g, "보이는 ")
.replace(/\s+/g, " ");
}

function limitText(text, maxLength = MAX_STEP_TEXT_LENGTH) {
const value = String(text || "").trim();
if (value.length <= maxLength) return value;
return value.slice(0, maxLength).trim();
}

function emptyStep() {
return { value: "", emoji: "", fallbackUsed: false };
}

function parseStepObjectString(step) {
if (typeof step !== "string") return null;

const value = step.trim().replace(/,+$/, "");
if (!value.startsWith("{") || !value.endsWith("}")) return null;

try {
const parsed = JSON.parse(value);
return parsed && typeof parsed === "object" ? parsed : null;
} catch {
return null;
}
}

function normalizeEmoji(value, lastFallback = "") {
const emoji = String(value || "").trim();

const match = emoji.match(
/^(\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*)$/u,
);

if (match && [...emoji].length <= 4) {
return { emoji, fallbackUsed: false };
}

const fallback = pickFallbackEmoji(lastFallback);
return { emoji: fallback, fallbackUsed: true };
}

function pickFallbackEmoji(lastFallback = "") {
const candidates = FALLBACK_EMOJIS.filter((emoji) => emoji !== lastFallback);
return candidates[Math.floor(Math.random() * candidates.length)] || FALLBACK_EMOJIS[0];
}

function isJSONFragment(value) {
const text = String(value || "").trim();

if (!text) return true;
if (/^[]{}[,]*$/.test(text)) return true;
if (/^"?steps"?\s*[:：]?\s*[?\s*,?$/i.test(text)) return true;
if (/^"?(text|emoji|icon|action|step|displayTitle|area)"?\s*[:：]/i.test(text)) {
return true;
}
if (/^[{[]\s*"?steps"?\s*[:：]/i.test(text)) return true;
if (/^[{,]\s*"?text"?\s*[:：]/i.test(text)) return true;
if (/^}\s*,?$/.test(text)) return true;

return false;
}

function blocksAppUse(value) {
const text = String(value || "").replace(/\s/g, "");
const device = /(휴대폰|핸드폰|폰|스마트폰|화면|브라우저|앱)/.test(text);

if (!device) return false;

return /(놓|내려놓|멀리두|치워|끄|잠그|닫|종료|덮|뒤집|무음|알림끄|방해금지)/.test(text);
}

function isBadActionText(value) {
const text = String(value || "").replace(/\s/g, "");

if (!text) return true;

if (/옷.*(쓰레기통|쓰레기봉투|봉투에담|봉투에넣)/.test(text)) return true;
if (/(컵|그릇|접시|설거지).*(쓰레기통|쓰레기봉투|봉투에담|봉투에넣)/.test(text)) {
return true;
}

if (/적절한곳/.test(text)) return true;
if (/제대로|깔끔하게|순서대로|빠르게/.test(text)) return true;
if (/전체|모든/.test(text)) return true;
if (/다른구석으로쓸/.test(text)) return true;
if (/먼지.*다른.*쓸/.test(text)) return true;

return false;
}
