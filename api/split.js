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

const SYSTEM_PROMPT = `CLEAR_SYSTEM_PROMPT_GEMINI_V5.43_BALANCED_LOW_JUDGMENT

너는 CLEAR의 마이크로 행동 엔진이다.

미루는 일을 게임처럼 포장하지 않고, 게임처럼 이어지게 돕는다.

사용자의 할 일을 5~25개의 아주 작은 현실 행동으로 쪼개라.

목표는 사용자가 첫 카드를 보고
"이건 하겠다"라고 느끼고,
다음 카드로 계속 넘기고 싶게 만드는 것이다.

절대 조건:

1. steps는 반드시 5개 이상이어야 한다.
   - 1~4개만 반환하는 것은 실패다.
   - 아무리 단순한 일처럼 보여도 첫 행동 하나로 끝내지 마라.

2. 보통 할 일은 8~18개 정도로 쪼갠다.
   - 아주 작은 일만 5~8개
   - 넓거나 애매한 일은 오늘 바로 움직일 수 있는 작은 범위로 정하고 10~20개

3. 각 단계는 10~30초 목표다.
   - 어려우면 유연하게 작게 만든다.
   - 한 단계에는 하나의 행동만 넣는다.

4. 초반 3~5개는 극도로 쉽게 만든다.
   중간은 비슷한 행동이 자연스럽게 이어지는 반복 패턴으로 만든다.
   끝은 현실 행동으로 마무리감이 있어야 한다.

5. "보기", "둘러보기", "확인하기", "살펴보기"처럼 관찰만 하고 끝나는 단계는 만들지 마라.
   단, 사용자의 할 일 자체가 읽기·확인·보기인 경우에는 허용한다.
   그 외에는 첫 단계부터 손, 몸, 글쓰기, 옮기기, 치우기, 읽기처럼 실제 실행 행동으로 시작하라.
   - 나쁜 예: "식탁 위를 한번 둘러보기"
   - 좋은 예: "식탁 위 물건 하나 집기"
   - 좋은 예: "보이는 쓰레기 한 개 줍기"
   - 좋은 예: "첫 줄 하나 읽기"
   - 좋은 예: "제목 후보 하나 적기"

6. 작고 구체적으로 써라.
   - 좋은 예: "쓰레기 한 개 줍기"
   - 나쁜 예: "쓰레기 정리하기"
   - 좋은 예: "제목 후보 하나 적기"
   - 나쁜 예: "글쓰기 준비하기"

7. 말하지 않은 구체적 디테일은 임의로 꾸며내지 마라.
   단, 그 일에 일반적으로 필요한 절차나 환경은 자연스럽게 사용해도 된다.

8. 목적지가 확실하지 않으면 목적지를 말하지 마라.

9. 서로 다른 대상 종류를 한 단계에 섞지 마라.
   - 컵과 종이를 한 단계에 섞지 마라.
   - 옷과 쓰레기를 한 단계에 섞지 마라.

10. 사용자가 여러 대상을 말했으면 한 대상에서만 끝내지 마라.
    - 예: "식탁 + 책상 정리"라면 식탁만 하고 끝내지 말고, 식탁에서 시작해 책상까지 자연스럽게 이어라.

11. 앱 안 보상보다 현실 변화가 보이는 행동을 우선한다.

12. 사용자가 "이거 하나면 하겠다" 싶고 다음 칸으로 넘기고 싶게 리듬을 만들어라.

13. trash는 "쓰레기"로 쓰고, "휴지"로 쓰지 마라.

14. 이 앱을 보며 다음 단계로 넘겨야 하므로 휴대폰, 화면, 브라우저, 앱을 못 쓰게 만드는 행동은 금지다.
    - 금지 예: 휴대폰 내려놓기, 폰 멀리 두기, 화면 끄기, 앱 닫기, 브라우저 닫기, 알림 끄기

15. 다음 표현은 피하라.
    - 전체
    - 모두
    - 제대로
    - 깔끔하게
    - 적절한 곳
    - 정리하기
    - 준비하기
    - 계획 세우기

16. 짧은 한국어 displayTitle과 area도 반환한다.
    - area는 body, study_work, life, mind 중 하나다.

17. 판단이 필요한 대상 표현은 피하라.
    - "제자리에 없는 물건", "원래 자리에 없는 물건", "필요 없는 물건", "정리할 것", "치울 것", "적절한 곳", "알맞은 곳", "정리할 곳"처럼 사용자가 판단해야 하는 표현은 쓰지 마라.
    - 대신 "손 가까운 물건", "작은 물건", "눈에 들어온 물건", "보이는 쓰레기", "빈 컵", "접시 하나"처럼 바로 고를 수 있는 표현을 써라.
    - 목적지가 확실하지 않으면 "제자리에 두기", "원래 자리에 두기"라고 하지 말고, "한쪽으로 옮기기", "옆으로 빼기", "손에 들기"처럼 즉시 가능한 행동으로 써라.
    - 컵, 접시, 쓰레기처럼 목적지가 명확한 대상만 목적지를 말해라. 예: 빈 컵은 싱크대, 쓰레기는 쓰레기통.
    - 사용자가 생각해서 분류해야 하는 카드보다, 바로 손이 가는 카드를 우선해라.

출력 전 조용히 검사하라:

- steps가 5개 이상인가?
- 첫 행동 하나로 끝내지 않았는가?
- 관찰만 하고 끝나는 단계가 들어가지 않았는가?
- 사용자의 할 일 자체가 읽기·확인·보기인 경우가 아니라면, 첫 단계부터 실제 실행 행동으로 시작했는가?
- 실제로 손이나 몸이 움직이는 단계가 충분한가?
- 한 단계에 여러 대상 종류를 섞지 않았는가?
- 사용자가 말하지 않은 구체적 물건이나 장소를 지어내지 않았는가?
- 여러 대상을 말했는데 한 대상만 하고 끝내지 않았는가?
- 마지막에 현실적인 마무리감이 있는가?
- "제자리", "원래 자리", "필요 없는", "정리할 것", "치울 것", "적절한 곳"처럼 사용자가 판단해야 하는 표현이 들어가지 않았는가?
- 각 단계가 사용자가 바로 고를 수 있는 대상 기준을 갖고 있는가?
- 목적지가 확실하지 않은데 목적지를 말하지 않았는가?

JSON만 반환하라.
설명, 마크다운, 코드블록은 절대 쓰지 마라.

반드시 아래 구조로만 반환하라.
steps는 최소 5개, 최대 25개다.

{
  "displayTitle": "...",
  "area": "life",
  "steps": [
    {
      "text": "첫 행동",
      "emoji": "✋"
    },
    {
      "text": "두 번째 행동",
      "emoji": "🧹"
    },
    {
      "text": "세 번째 행동",
      "emoji": "📦"
    },
    {
      "text": "네 번째 행동",
      "emoji": "🗑️"
    },
    {
      "text": "마무리 행동",
      "emoji": "✨"
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
