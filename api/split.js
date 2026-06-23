const MAX_STEPS = 25;
const API_KEY_NAMES = ["ANTHROPIC_API_KEY"];
const SYSTEM_PROMPT =
  `미루는 일을 시작·완주하게 돕는다.

할일을 5~25개의 마이크로 행동으로 쪼개라.

규칙:
1. 작고 구체적으로 ("쓰레기 한 개 줍기" O, "쓰레기 정리하기" X)
2. 말하지 않은 도구·환경·절차는 가정하지 마
3. 각 단계는 10~30초 목표, 어려우면 유연하게
4. 장기 작업은 "오늘 분량"부터 정하고 쪼개기
5. 순서: 초반 3~5개는 극도로 쉽게, 중간은 반복 패턴, 끝은 마무리감
6. 각 단계에 이모지 1개

JSON만:
{"steps":[{"text":"행동","emoji":"🗑️"}]}`;

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

  try {
    const parsed = JSON.parse(text);
    const source = Array.isArray(parsed) ? parsed : parsed.steps;
    if (Array.isArray(source)) return cleanSteps(source);
  } catch {
    // Playground-style text output is expected here.
  }

  return cleanSteps(
    text
      .split(/\r?\n/)
      .map((line) =>
        line
          .trim()
          .replace(/^```(?:json|text)?/i, "")
          .replace(/^```$/, "")
          .replace(/^[-*•]\s+/, "")
          .replace(/^\d+[.)]\s+/, "")
          .replace(/^\[[ xX]\]\s+/, "")
          .replace(/^["'“”‘’]+|["'“”‘’]+$/g, ""),
      )
      .filter((line) => line && !/^steps?\s*[:：]?$/i.test(line)),
  );
}

function cleanSteps(values) {
  return values
    .map(formatStep)
    .filter(Boolean)
    .slice(0, MAX_STEPS);
}

function formatStep(step) {
  if (step && typeof step === "object") {
    const text = String(step.text || step.action || step.step || "").trim();
    const emoji = String(step.emoji || step.icon || "").trim();
    return [emoji, text].filter(Boolean).join(" ").trim();
  }

  return String(step || "").trim();
}
