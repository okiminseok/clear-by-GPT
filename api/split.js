const MAX_STEPS = 25;
const API_KEY_NAMES = [
  "CLEAR_API_KEY",
  "OPENAI_API_KEY",
  "clear_api_key",
  "CLEAR API KEY",
  "clear api key",
];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST만 사용할 수 있어요." });
  }

  const apiKey = getApiKey();
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  if (!apiKey) {
    return res.status(500).json({
      error:
        "API 키가 연결되지 않았어요. Vercel 환경변수에 CLEAR_API_KEY를 추가하고, 지금 테스트하는 배포 환경(Production 또는 Preview)을 다시 배포해주세요.",
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
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "developer",
            content:
              "우리는 사람들이 부담스럽고 귀찮아서 미루는 일들을 10초-1분 사이에 할수있는 것들로 25개 이하로 쪼개서 쉽고 재밌게 보여서 접근하게 만들고 다음 것을 바로바로 하고싶게 만드는 앱이야. 유저가 할일을 입력하면 할일을 너가 이 사람의 행동을 유도하기 적합하게 쪼개줘. 대신 유저가 가독성이 좋을 수 있게 좀 더 간단명료하게 표현해줘.",
          },
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
        error: data.error?.message || "OpenAI API 요청에 실패했어요.",
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

  return data.output
    ?.flatMap((item) => item.content || [])
    ?.map((content) => content.text || "")
    ?.join("");
}

function parseOutputSteps(data) {
  const text = parseOutputText(data);

  if (!text) throw new Error("OpenAI 응답이 비어 있어요.");

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
    .map((step) => String(step || "").trim())
    .filter(Boolean)
    .slice(0, MAX_STEPS);
}
