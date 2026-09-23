# 100일의 편지

100일 챌린지 카드 이미지를 업로드하면 미션 100개를 자동으로 인식하고, 매일 성찰 질문에 답하면서
1·7·21·66·100일 이정표마다 "2027년의 나"에게서 편지를 받는 자기성찰 웹앱입니다.

- 프론트엔드: 순수 HTML/CSS/JS (빌드 도구 없음) → **GitHub Pages** 배포
- 백엔드: **Google Apps Script** 웹앱 (Gemini API 호출 + 인증 처리)
- 데이터베이스: **Google Sheets**
- AI: **Gemini API** (이미지 인식, 질문 생성, 편지 생성)

```
gas/            Apps Script 백엔드 (Code.gs, appsscript.json)
web/            정적 프론트엔드 (index.html, app.js, styles.css) → GitHub Pages로 배포됨
```

## 1. Google Sheets + Apps Script 백엔드 만들기

1. 새 Google 스프레드시트를 만듭니다. (시트 탭은 배포 후 첫 실행 시 스크립트가 자동으로 만듭니다: 사용자 / 미션 / 답변 / 편지)
2. **확장 프로그램 → Apps Script** 로 이동합니다.
3. `gas/Code.gs` 내용을 그대로 붙여넣습니다. (기본 `Code.gs` 파일을 덮어쓰면 됩니다)
4. 왼쪽 **프로젝트 설정(톱니바퀴)** → **스크립트 속성** 에서 속성 하나를 추가합니다.
   - 키: `GEMINI_API_KEY`
   - 값: 발급받은 Gemini API 키 (아래 2번 참고)
5. `appsscript.json` 은 프로젝트 설정에서 "appsscript.json 매니페스트 파일을 편집기에 표시" 를 켜면 내용을 맞춰 넣을 수 있습니다. (이미 `webapp.access: ANYONE_ANONYMOUS` 로 되어 있어야 로그인 없이 호출 가능합니다)
6. 편집기 상단 **배포 → 새 배포**
   - 유형: **웹 앱**
   - 실행 계정: 나
   - 액세스 권한: **모든 사용자**
7. 배포 후 나오는 **웹 앱 URL**(`https://script.google.com/macros/s/xxxx/exec` 형태)을 복사해 둡니다.
8. 스프레드시트로 돌아가 함수 목록에서 `setup` 함수를 한 번 실행해 시트 4개(사용자/미션/답변/편지)를 미리 만들어도 됩니다. (첫 API 호출 때 자동 생성되므로 생략 가능)

> Apps Script 코드를 수정할 때마다 **배포 → 배포 관리 → 수정(연필 아이콘) → 새 버전** 으로 다시 배포해야 반영됩니다. URL은 그대로 유지됩니다.

## 2. Gemini API 키 발급

1. https://aistudio.google.com/apikey 에서 로그인 후 API 키를 발급받습니다. (무료 등급 제공)
2. 위 1-4단계의 스크립트 속성 `GEMINI_API_KEY` 에 붙여넣습니다. **키를 코드나 깃허브에는 절대 넣지 마세요** — 반드시 Apps Script 스크립트 속성에만 저장합니다.

## 3. 프론트엔드 연결

`web/app.js` 맨 위 `CONFIG.GAS_URL` 값을 1-7에서 복사한 웹 앱 URL로 바꿉니다.

```js
const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/xxxxxxxx/exec'
};
```

이 값이 비어 있거나 기본 플레이스홀더 그대로면, 앱은 자동으로 **목업 모드**로 동작합니다 (브라우저 localStorage에 가짜 데이터를 저장하며 화면 흐름만 확인 가능). 실제 이미지 인식·AI 질문/편지는 GAS_URL을 연결해야 동작합니다.

## 4. GitHub Pages로 배포

`.github/workflows/deploy.yml` 워크플로가 `web/` 폴더 변경 시 자동으로 GitHub Pages에 배포합니다. 저장소가 public이면 Settings → Pages → Source가 이미 "GitHub Actions"로 설정되어 있어야 하며, `main` 브랜치에 푸시할 때마다 자동 배포됩니다. (또는 Actions 탭에서 워크플로를 수동 실행)

배포 URL은 `https://<사용자명>.github.io/<저장소명>/` 형태로 발급됩니다.

## 알아두면 좋은 점

- **비용**: Gemini API는 무료 등급이 있지만 사용량이 많아지면 과금될 수 있습니다. 학생 수·사용 빈도에 맞게 Google AI Studio에서 한도를 확인하세요.
- **GAS 직접 호출 관련**: 같은 개발자의 다른 앱(예약 시스템)은 모바일 사파리에서 Apps Script 리다이렉트 응답의 CORS 헤더가 간헐적으로 누락되는 문제를 겪어 Vercel 서버리스 함수로 중계했습니다. 이 앱은 GitHub Pages(정적 호스팅)만 쓰기로 하여 GAS를 브라우저에서 직접 호출합니다 — 대부분 환경에서 정상 동작하지만, 만약 특정 모바일 브라우저에서 간헐적 실패가 보고되면 이후에 동일한 방식(서버리스 프록시)을 추가로 고려하세요.
- **인증**: 아이디/비밀번호는 Apps Script에서 SHA-256 해시로 저장됩니다(솔트 포함). 다만 이메일 인증이나 비밀번호 재설정 같은 기능은 없는 간단한 방식이니, 민감한 정보를 다루는 용도로는 적합하지 않습니다.
- **챌린지 시작일**: 사용자마다 온보딩을 완료한 날짜(직접 지정 가능)가 Day 1이 되며, 그 날짜 기준으로 오늘이 Day N인지 계산합니다.
- **AI 모델**: `gas/Code.gs` 상단의 `GEMINI_MODEL` 상수(`gemini-2.5-flash`)로 지정되어 있습니다. Google이 모델명을 변경/폐지하면 이 값을 최신 모델명으로 바꿔주세요.

## 로컬에서 화면만 미리보기

백엔드 연결 없이도 정적 파일을 로컬 서버로 열면 목업 모드로 전체 흐름(로그인→온보딩→홈→편지함→진행현황)을 확인할 수 있습니다.

```bash
npx http-server web -p 5174 -c-1
```
