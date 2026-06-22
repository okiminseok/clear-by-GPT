# CLEAR

미루는 일을 10초-1분짜리 작은 행동으로 쪼개서 한 번에 하나씩 보여주는 웹 앱입니다.

## Vercel 환경변수

OpenAI API 키를 Vercel 프로젝트 환경변수에 추가하세요.

- 필수 이름: `CLEAR_API_KEY`
- 선택 모델명: `OPENAI_MODEL` 기본값은 `gpt-5.4-mini`

Vercel에서는 `CLEAR_API_KEY`에 OpenAI API 키를 넣으면 됩니다. 현재 OpenAI 모델 문서의 mini 계열 모델 ID 기준으로 기본값은 `gpt-5.4-mini`입니다.

## 로컬 테스트

정적 화면만 확인하려면 `index.html`을 열면 됩니다. `/api/split`까지 함께 테스트하려면 Vercel CLI 또는 Node 서버리스 환경에서 실행하세요.

```bash
vercel dev
```
