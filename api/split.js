const MAX_STEPS = 25;
const API_KEY_NAMES = ["ANTHROPIC_API_KEY"];
const FALLBACK_EMOJIS = ["✨", "✦", "💫", "🌟", "⚡", "🎯"];
const SYSTEM_PROMPT =
  ' CLEAR_SYSTEM_PROMPT_V3

You help procrastinated tasks continue like a game,
without turning them into a game.

Your goal is not to divide the task fairly.

Your goal is to make the user start immediately,
feel small wins,
and naturally continue to the next action.

Break the user’s task into micro-actions.

Use up to 25 steps.

Rules:

1. Make each step small and concrete.
    * Good: “Pick up one visible piece of trash”
    * Bad: “Clean up trash”
2. Prefer actions that feel like:
    “I can do this one thing.”
3. Most steps should feel doable in about 10–30 seconds.
    Be flexible when a natural action needs slightly more time.
4. Do not assume tools, rooms, objects, locations, or procedures
    the user did not mention.
5. Do not mechanically split the task into equal categories.
6. Do not try to cover every possible area.
7. Prioritize the path that creates the most useful progress
    with the least resistance.
8. Consider:
    * proximity
    * visible impact
    * ease of starting
    * low movement cost
    * likelihood of completion
    * trustworthiness
9. For broad tasks like cleaning,
    start with what is nearby, visible, or immediately actionable.
10. Stay in one small cluster
    until the user creates visible progress
    or a small sense of completion.
11. Do not move the user to another room or area
    just to cover more categories.
12. The sequence should feel like:
    * early steps: extremely easy to start
    * middle steps: simple repeated patterns that build momentum
    * final steps: a small sense of closure
13. Prefer visible real-world change over app rewards.
14. Make the user want to swipe to the next step.
15. Avoid vague or abstract actions:
    * organize things
    * tidy the area
    * clean properly
    * sort everything
    * arrange items
16. Prefer concrete visible actions:
    * pick up one visible item
    * throw away one obvious piece of trash
    * move one object out of the way
    * clear one small surface
    * put one item where it belongs
17. For long-term tasks,
    first choose a realistic portion for today,
    then break down only that portion.
18. The user needs to keep using this app,
    so never generate actions that prevent app use.
    Forbidden:
    * put the phone away
    * move the phone far away
    * turn off the screen
    * close the app
    * close the browser
    * disable notifications

Return JSON only.

Exactly one emoji per step.

Format:

{
“steps”: [
{
“text”: “action”,
“emoji”: “🗑️”
}
]
}

Output natural Korean only.

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
        "API 키가 연결되지 않았어요. Vercel 환경변수에 ANTHROPIC_API_KEY를 추가하고, 지금 테스트하는 배포 환경(Production 또는 Preview)을 다시 배포해주세요.",
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
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: task,
          },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Anthropic API 요청에 실패했어요.",
      });
    }

    const steps = parseOutputSteps(data);

    if (!steps.length) {
      return res.status(502).json({ error: "쪼갠 결과를 읽지 못했어요. 다시 시도해주세요." });
    }

    return res.status(200).json({ steps });
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

function parseOutputSteps(data) {
  const text = parseOutputText(data);

  if (!text) throw new Error("Anthropic 응답이 비어 있어요.");

  const parsedSteps = parseJSONSteps(text);
  if (parsedSteps.length) return parsedSteps;

  return cleanSteps(
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
}

function parseJSONSteps(text) {
  const candidates = [
    text,
    stripCodeFence(text),
    extractJSONBlock(stripCodeFence(text)),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const source = Array.isArray(parsed) ? parsed : parsed.steps;
      if (Array.isArray(source)) return cleanSteps(source);
    } catch {
      // Try the next candidate.
    }
  }

  return parseLooseJSONSteps(stripCodeFence(text));
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
  if (pairSteps.length) return cleanSteps(pairSteps);

  return [];
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
    .slice(0, MAX_STEPS);
}

function formatStep(step, lastFallback = "") {
  const parsedStringStep = parseStepObjectString(step);
  if (parsedStringStep) return formatStep(parsedStringStep, lastFallback);

  if (step && typeof step === "object") {
    const text = String(step.text || step.action || step.step || "").trim();
    if (!text || isJSONFragment(text) || blocksAppUse(text)) return emptyStep();
    const picked = normalizeEmoji(step.emoji || step.icon, lastFallback);
    return {
      value: [picked.emoji, text].filter(Boolean).join(" ").trim(),
      emoji: picked.emoji,
      fallbackUsed: picked.fallbackUsed,
    };
  }

  const value = String(step || "").trim();
  if (!value || isJSONFragment(value) || blocksAppUse(value)) return emptyStep();

  const match = value.match(/^(\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*)\s*(.+)$/u);
  if (!match) {
    const picked = pickFallbackEmoji(lastFallback);
    return {
      value: `${picked} ${value}`.trim(),
      emoji: picked,
      fallbackUsed: true,
    };
  }

  const picked = normalizeEmoji(match[1], lastFallback);
  return {
    value: [picked.emoji, match[2].trim()].filter(Boolean).join(" ").trim(),
    emoji: picked.emoji,
    fallbackUsed: picked.fallbackUsed,
  };
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
  const match = emoji.match(/^(\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*)$/u);
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
  if (/^"?(text|emoji|icon|action|step)"?\s*[:：]/i.test(text)) return true;
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
