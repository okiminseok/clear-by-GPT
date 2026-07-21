const MAX_STEPS = 25;
const MIN_STEPS = 5;
const MAX_STEP_TEXT_LENGTH = 40;
const MAX_DISPLAY_TITLE_LENGTH = 20;
const MAX_OUTPUT_TOKENS = 2048;
const MAX_RETRY_COUNT = 1;

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

const CLEAR_RESPONSE_SCHEMA = {
  type: "OBJECT",
  required: ["displayTitle", "area", "steps"],
  propertyOrdering: ["displayTitle", "area", "steps"],
  properties: {
    displayTitle: {
      type: "STRING",
    },
    area: {
      type: "STRING",
      enum: ["body", "study_work", "life", "mind"],
    },
    steps: {
      type: "ARRAY",
      minItems: MIN_STEPS,
      maxItems: MAX_STEPS,
      items: {
        type: "OBJECT",
        required: ["text", "emoji"],
        propertyOrdering: ["text", "emoji"],
        properties: {
          text: {
            type: "STRING",
          },
          emoji: {
            type: "STRING",
          },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `clear_split_engine_pangea_v1.01

Goal
: 당신의 역할은 사용자가 입력한 크고 복잡한 할 일을 쉽고 작은 현실 행동으로 나누어, 사용자가 쉽게 시작하고 끝까지 자연스럽게 진행하도록 만드는 것이다.

Action
: 모든 Step은 하나의 명확한 현실 행동으로 작성하며, 사용자가 별도의 해석이나 판단 없이 즉시 실행하고 완료 여부를 확인할 수 있어야 한다.

Universality 
: 입력을 충실히 반영하되, 해당 과제를 수행할 때 보편적으로 성립하는 정보만 추론하며, 사용자나 환경에 따라 달라질 수 있는 정보는 추론하거나 추가하지 않는다.

Decomposition
: 과제를 사용자가 부담 없이 즉시 시작할 수 있는 최소 현실 행동까지 분해하며, 기본적으로 약 10초 내외 (일반적으로 30초 이하)에 완료 가능한 크기로 구성 한다.

Scale
: 전체 Step은 과제의 복잡도에 맞게 균형 있게 구성하며, 일반적으로 10~25개를 목표로 하고, 필요한 경우에만 이 범위를 벗어난다.

Workflow
: Step은 과제를 가장 자연스럽고 현실적으로 수행할 수 있는 전체 작업 흐름을 기준으로 설계하며, 선행관계와 순서를 고려하고 가능한 한 같은 대상과 장소의 작업을 묶어 이동과 컨텍스트 전환을 최소화한다.

Output
: 반드시 아래 JSON 형식과 출력 규칙을 따른다.

{
  "displayTitle": "할 일 제목",
  "area": "영역",
  "steps": [
    {
      "text": "Step 내용",
      "emoji": "😀"
    }
  ]
}

출력 규칙
- 반드시 유효한 JSON만 출력한다.
- JSON 바깥에는 어떠한 텍스트도 출력하지 않는다.
- displayTitle는 전체 과제를 가장 잘 나타내는 짧은 제목으로 작성한다.
- area는 해당 과제를 가장 적절하게 분류하는 하나의 영역으로 작성한다.
- 모든 Step은 text와 emoji를 반드시 포함한다.
- text에는 사용자가 바로 실행할 수 있는 하나의 현실 행동만 작성한다.
- emoji는 해당 Step을 가장 잘 나타내는 이모지 하나만 사용한다.
`;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST만 사용할 수 있어요." });
  }

  const apiKey = getApiKey();
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!apiKey) {
    return res.status(500).json({
      error:
        "API 키가 연결되지 않았어요. Vercel 환경변수에 CLEAR_API_GEMINI를 추가하고, 지금 테스트하는 배포 환경을 다시 배포해주세요.",
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
    const firstAttempt = await requestGeminiSteps({
      apiKey,
      model,
      task,
      retryReason: "",
    });

    let result = firstAttempt.result;
    let finalData = firstAttempt.data;
    let retryUsed = false;

    if (result.steps.length < MIN_STEPS && MAX_RETRY_COUNT > 0) {
      retryUsed = true;

      const retryAttempt = await requestGeminiSteps({
        apiKey,
        model,
        task,
        retryReason:
          `이전 응답은 steps가 ${result.steps.length}개라 실패입니다. ` +
          `반드시 ${MIN_STEPS}~${MAX_STEPS}개의 steps를 반환하세요. ` +
          `관찰만 하는 단계로 끝내지 말고, 실제 행동 흐름을 JSON만으로 다시 반환하세요.`,
      });

      result = retryAttempt.result;
      finalData = retryAttempt.data;
    }

    if (result.steps.length < MIN_STEPS) {
      return res.status(502).json({
        error: "쪼갠 단계가 너무 적어요. 다시 시도해주세요.",
        debug: {
          version: "GEMINI_V5.43_BALANCED_LOW_JUDGMENT",
          count: result.steps.length,
          retryUsed,
          raw: parseOutputText(finalData),
          finishReason: finalData.candidates?.[0]?.finishReason,
        },
      });
    }

    return res.status(200).json({
      ...result,
      debugVersion:
        process.env.CLEAR_DEBUG_VERSION === "true"
          ? "GEMINI_V5.43_BALANCED_LOW_JUDGMENT"
          : undefined,
      debugMeta:
        process.env.CLEAR_DEBUG_VERSION === "true"
          ? {
              count: result.steps.length,
              retryUsed,
              finishReason: finalData.candidates?.[0]?.finishReason,
            }
          : undefined,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || "서버에서 문제가 생겼어요.",
      debug: error.debug || undefined,
    });
  }
};

async function requestGeminiSteps({ apiKey, model, task, retryReason = "" }) {
  const userText = retryReason
    ? `${retryReason}\n\n원래 할 일:\n${task}`
    : task;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userText }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: "application/json",
          responseSchema: CLEAR_RESPONSE_SCHEMA,
        },
      }),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    const message =
      data.error?.message ||
      data.error?.status ||
      "Gemini API 요청에 실패했어요.";

    const error = new Error(message);
    error.statusCode = response.status;
    error.debug = data;
    throw error;
  }

  const result = parseOutputResult(data, task);

  return { data, result };
}

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
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  };
}

function parseOutputText(data) {
  if (data.output_text) return data.output_text;

  if (Array.isArray(data.candidates)) {
    return data.candidates
      .flatMap((candidate) => candidate.content?.parts || [])
      .map((part) => part.text || "")
      .join("");
  }

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
  if (!text) throw new Error("Gemini 응답이 비어 있어요.");

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
          .replace(/^\[[ xX]\]\s+/, "")
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
  const objectMatches = source.match(/\{[^{}]*"text"\s*:[^{}]*\}/g) || [];

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
    .replace(/^```(?:json|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
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
    .filter((step, index, array) => array.indexOf(step) === index)
    .slice(0, MAX_STEPS);
}

function formatStep(step, lastFallback = "") {
  const parsedStringStep = parseStepObjectString(step);
  if (parsedStringStep) return formatStep(parsedStringStep, lastFallback);

  if (step && typeof step === "object") {
    const text = normalizeActionText(
      limitText(String(step.text || step.action || step.step || "").trim()),
    );

    if (!text || isJSONFragment(text) || blocksAppUse(text) || isBadActionText(text)) {
      return emptyStep();
    }

    const picked = normalizeEmoji(step.emoji || step.icon, lastFallback);

    return {
      value: [picked.emoji, text].filter(Boolean).join(" ").trim(),
      emoji: picked.emoji,
      fallbackUsed: picked.fallbackUsed,
    };
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
  if (/^[\]{}[,]*$/.test(text)) return true;
  if (/^"?steps"?\s*[:：]?\s*\[?\s*,?$/i.test(text)) return true;
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

  if (/제자리에없는|제자리없는|제자리|원래자리에없는|원래자리|필요없는|정리할것|치울것|알맞은곳|적절한곳|정리할곳/.test(text)) {
    return true;
  }

  if (/적절한곳/.test(text)) return true;
  if (/제대로|깔끔하게|순서대로|빠르게/.test(text)) return true;
  if (/전체|모든/.test(text)) return true;
  if (/다른구석으로쓸/.test(text)) return true;
  if (/먼지.*다른.*쓸/.test(text)) return true;

  return false;
}
