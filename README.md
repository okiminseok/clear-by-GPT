# CLEAR

미루는 일을 10초-1분짜리 작은 행동으로 쪼개서 한 번에 하나씩 보여주는 웹 앱입니다.

## Vercel 환경변수

OpenAI API 키를 Vercel 프로젝트 환경변수에 추가하세요.

- 권장 이름: `CLEAR_API_KEY`
- 대체 가능 이름: `OPENAI_API_KEY`
- 선택 모델명: `OPENAI_MODEL` 기본값은 `gpt-5-mini`

Vercel에서는 `CLEAR_API_KEY`에 OpenAI API 키를 넣으면 됩니다. 이미 `OPENAI_API_KEY`로 넣어둔 경우도 앱이 읽을 수 있습니다. 기본 모델은 `gpt-5-mini`입니다.

환경변수를 새로 추가하거나 이름을 바꾼 뒤에는 Vercel에서 지금 테스트하는 환경을 다시 배포해야 적용됩니다. Production URL이면 Production에, Preview URL이면 Preview에도 환경변수를 켜고 재배포하세요.

## 로컬 테스트

정적 화면만 확인하려면 `index.html`을 열면 됩니다. `/api/split`까지 함께 테스트하려면 Vercel CLI 또는 Node 서버리스 환경에서 실행하세요.

```bash
vercel dev
```
