# eDEX-UI — 프로젝트 종합 분석

> 이 문서는 저장소 전체 코드베이스를 분석해서 구조, 아키텍처, 코드 컨벤션, 기능, 디자인/테마 시스템, 빌드/배포 파이프라인을 정리한 참고 자료임. `2026-08` 기준 (`security-and-fixes` 브랜치가 `master`에 머지된 시점)의 소스를 기준으로 작성함.

---

## 1. 프로젝트 개요

**eDEX-UI**는 SF 영화(특히 TRON: Legacy)에서 영감을 받은 풀스크린 크로스플랫폼 터미널 에뮬레이터 겸 시스템 모니터임. [`Electron`](https://www.electronjs.org/) 기반 데스크톱 앱으로, 실제 쉘(bash/zsh/PowerShell 등)을 백엔드로 구동하면서 그 위에 SF스러운 GUI(온스크린 키보드, 파일 브라우저, 시스템/네트워크 모니터링 패널, 지구본 위젯 등)를 얹은 구조.

- **원 저장소**: [GitSquared/edex-ui](https://github.com/GitSquared/edex-ui) — 2021년 10월 18일 Public Archive 처리됨
- **라이선스**: GPL-3.0
- **런타임**: Electron 12 (Chromium + Node.js 임베디드)
- **최종 배포 버전**: 2.2.8

### 1.1 상위 디렉토리 구조

```
edex-ui/
├── LICENSE, README.md, SECURITY.md
├── package.json              # 빌드 툴체인 전용 (electron-builder, electron 등)
├── prebuild-minify.js        # 빌드 전 JS/CSS/JSON 압축 스크립트
├── file-icons-generator.js   # 파일 아이콘 매처 생성 스크립트
├── file-icons/                # git submodule (아이콘 폰트 모음)
├── media/                     # 로고, 스크린샷, 앱 아이콘(.icns/.ico)
├── docs/                      # (본 문서가 위치한 곳)
└── src/                       # 실제 애플리케이션 소스 (Electron main + renderer)
    ├── package.json           # 앱 런타임 전용 의존성
    ├── _boot.js                # Electron main 프로세스 엔트리포인트
    ├── _multithread.js         # systeminformation 호출 전용 워커 클러스터
    ├── _renderer.js            # renderer 프로세스 부트스트랩 (~1200줄)
    ├── ui.html                 # 렌더러 HTML 셸 (CSS/JS 로딩 순서 정의)
    ├── classes/                 # 18개 UI 모듈 클래스 (터미널, 키보드, 파일시스템 등)
    └── assets/                  # CSS, 폰트, 오디오, 테마, 키보드 레이아웃, 아이콘, 서드파티 벤더 스크립트
```

`src/`가 사실상 **별도의 npm 패키지**로 분리되어 있음 (`src/package.json`이 root와 독립). 이는 electron-builder가 실제로 패키징하는 앱 번들 범위를 `src/`(→ 빌드시 `prebuild-src/`로 복사됨)로 한정하고, root의 빌드 툴체인 의존성(electron-builder 자체 등)이 최종 배포물에 섞여 들어가지 않도록 분리한 설계임.

---

## 2. 아키텍처

### 2.1 Electron Main / Renderer 이원 구조

Electron 앱답게 두 프로세스로 나뉨.

| 프로세스 | 진입점 | 역할 |
|---|---|---|
| **Main** | `src/_boot.js` | 윈도우 생성, 설정 파일(`settings.json`) 로드/기본값 생성, TTY(쉘) 백엔드 프로세스 스폰, IPC 라우팅, 앱 생명주기 관리 |
| **Renderer** | `src/_renderer.js` → `src/ui.html` | 실제 UI 렌더링, 테마 적용, 각 `classes/*.class.js` 모듈 인스턴스화, 부팅 애니메이션 |
| **Multithread Worker** | `src/_multithread.js` | `systeminformation` 라이브러리 호출을 별도 `cluster` 워커들로 분산 (렌더러 프로세스가 무거운 시스템 조회로 인해 버벅이지 않도록) |

`nodeIntegration: true`, `contextIsolation: false`로 설정되어 있어 renderer가 Node.js API(`require` 등)를 직접 사용할 수 있는, Electron 초기~중기 세대 특유의 아키텍처임 (최신 Electron 보안 권장 사항인 contextBridge/preload 방식이 아님).

### 2.2 터미널 백엔드 — 자체 프로토콜 websocket

가장 핵심적인 아키텍처 특징: **쉘(TTY)과 UI가 진짜로 분리된 서버-클라이언트 구조**임.

- `Terminal` 클래스(`classes/terminal.class.js`)가 `role: "server"` 또는 `role: "client"` 두 모드로 동작하는 동형(isomorphic) 클래스.
- **서버 역할** (Main 프로세스, `_boot.js`에서 인스턴스화): `node-pty`로 실제 OS 프로세스(bash/zsh/PowerShell)를 스폰하고, 로컬 `ws`(websocket) 서버를 띄워 그 pty의 stdin/stdout을 중계.
- **클라이언트 역할** (Renderer, `ui.html`에서 로드): `xterm.js`로 터미널 UI를 그리고, 위 websocket 서버에 접속해서 데이터를 주고받음.
- 탭(멀티 터미널)은 각각 별도 포트에 독립된 websocket 서버를 추가로 띄우는 방식으로 구현됨 (`extraTtys`, 최대 4개 추가 탭).
- 이 구조 때문에 **CSWSH(Cross-Site WebSocket Hijacking)** 취약점이 존재했었고(`GHSA-q8xc-f2wf-ffh9`), 이번 세션에서 `verifyClient`에 Origin 검증을 추가해 패치함.

### 2.3 IPC 패턴

Main ↔ Renderer 통신은 Electron 표준 `ipcMain`/`ipcRenderer` 채널로 이루어짐. 컨벤션:

- **단발성 요청-응답**: `ipc.send("ttyspawn", requestId)` → `ipc.once("ttyspawn-reply-"+requestId, ...)`처럼, 요청마다 고유 id(nanoid)를 채널명에 붙여 응답을 구분함. (레이스 컨디션 방지를 위해 이번 세션에서 도입된 패턴 — 원래는 공유 채널이라 동시 요청 시 응답이 뒤섞이는 버그가 있었음.)
- **설정 오버라이드(테마/키보드 핫스위치)**: `getThemeOverride`/`setThemeOverride`, `getKbOverride`/`setKbOverride` — 클로저 변수로 Main 프로세스 메모리에 상태를 저장해 두고 조회.
- **로깅**: renderer에서 `ipc.send("log", type, content)`를 보내면 main이 `signale`로 콘솔에 출력 — renderer의 에러가 main 프로세스 콘솔(터미널)에도 보이게 하기 위함.
- **동기 IPC**: `ipc.sendSync("closeExtraTtys")` — reload 직전에 백엔드 TTY 정리를 **동기적으로** 기다려야 하는 유일한 경우 (비동기면 정리가 끝나기 전에 페이지가 이미 unload됨).

### 2.4 `systeminformation` 프록시

`_renderer.js`의 `initSystemInformationProxy()`는 `window.si`라는 JS `Proxy` 객체를 만들어서, 어떤 `si.xxx(...)` 호출이든 자동으로 IPC를 거쳐 `_multithread.js`의 워커 풀로 라우팅되게 함. 호출부(각 모듈 클래스)는 마치 로컬 함수를 부르듯 `window.si.cpu().then(...)`을 쓰면 되고, 실제로는 백그라운드에서 멀티코어로 분산 실행됨 — 일종의 투명한 RPC 레이어.

### 2.5 모듈(클래스) 시스템

빌드 도구 없이 **plain `<script>` 태그**로 `ui.html`에 순서대로 로드되는 구식(2019년 당시 기준으로도 다소 구식) 방식. Webpack/Vite 같은 번들러가 없음. 각 클래스는:

```js
class Foo {
    constructor(parentId, opts) { ... }
    someMethod() { ... }
}
module.exports = { Foo };
```

형태로 CommonJS `module.exports`도 같이 해줘서, Node 컨텍스트(nodeIntegration)에서는 `require()`로도 로드 가능하고 브라우저 전역에서는 `<script>` 로드만으로 전역 `class Foo`가 잡히는 이중 접근 방식을 취함.

18개 클래스 모두 `src/classes/*.class.js`에 위치:

| 클래스 | 파일 크기 | 역할 |
|---|---|---|
| `Terminal` | ~24K | 터미널 서버/클라이언트 (핵심) |
| `Keyboard` | ~48K (최대) | 온스크린 키보드, 레이아웃 렌더링 |
| `FileSystem` | ~40K | 파일 브라우저, CWD 추적, 아이콘 매칭 |
| `Netstat` | ~12K | 네트워크 연결 감시, GeoIP 조회 |
| `LocationGlobe` | ~12K | 3D 지구본 (encom-globe 기반) |
| `Toplist` | ~12K | 프로세스 목록(`top` 유사) |
| `CpuInfo` | ~8K | CPU 사용률 그래프 |
| `MediaPlayer`, `Modal`, `FuzzyFinder` | ~8K | 미디어 재생기, 모달 다이얼로그, Ctrl+Shift+F 퍼지 서치 |
| `Clock`, `ConnInfo`, `RamWatcher`, `SysInfo`, `HardwareInspector`, `DocReader`, `AudioFx`, `UpdateChecker` | 4~8K | 각 기능별 소형 모듈 |

---

## 3. 코드 컨벤션

### 3.1 JavaScript 스타일

- **ES6 class 문법** 전반 사용 (프로토타입 체이닝 직접 조작 없음)
- **4-space 들여쓰기** 일관
- **세미콜론 사용** (ASI에 의존하지 않음)
- **템플릿 리터럴** 적극 사용 — DOM 문자열 조립, 로그 메시지 등 대부분 백틱 사용
- **화살표 함수**를 콜백/이벤트 핸들러에 광범위하게 사용, 일반 메서드는 `methodName() {}` 축약 문법
- **`var`는 거의 안 씀** — `let`/`const` 위주지만, `_boot.js`의 모듈 스코프 최상단 변수 일부(`var win, tty, extraTtys`)처럼 "이 파일 전역에서 나중에 재할당될 것"을 명시적으로 표시하려는 의도로 드물게 `var` 사용
- **문자열 리터럴**: 큰따옴표(`"`)가 기본, 문자열 안에 `"`가 필요할 때만 작은따옴표 — 일관된 prettier/eslint 강제 없이 원저자 스타일을 따른 자연발생적 컨벤션
- **주석 스타일**: `//` 라인 주석 위주, 이슈 번호를 참조하는 습관이 뚜렷함 (`// See #366`, `// see #904`, `// Support for custom color filters on the terminal - see #483`) — 버그 수정/특수 처리 코드에 GitHub 이슈 링크를 남겨서 "왜 이렇게 짜여있는지" 추적 가능하게 함
- **에러 처리**: 구식 `throw "문자열"` (Error 객체가 아닌 raw string throw)이 종종 보임 (`if (!opts.parentId) throw "Missing parameters";`) — 최신 Node 관례는 아니지만 프로젝트 전역에서 일관되게 이런 스타일
- **린터 설정 없음**: `.eslintrc`, `.prettierrc` 등 어떤 정적 스타일 강제 도구도 저장소에 없음. 스타일 일관성은 순전히 관습적으로 유지됨

### 3.2 네이밍 컨벤션

- **클래스명**: PascalCase (`Terminal`, `FileSystem`, `LocationGlobe`)
- **파일명**: `camelCase.class.js` 패턴 (`docReader.class.js`, `hardwareInspector.class.js`)
- **CSS 파일명**: 기능별 접두사 `mod_` (모듈 단위 스타일시트 — `mod_clock.css`, `mod_netstat.css` 등), 메인 레이아웃은 `main.css`/`main_shell.css`
- **CSS 커스텀 프로퍼티**: `--color_r`, `--color_light_black`, `--font_main` 처럼 스네이크식 접두사 + 언더스코어
- **DOM id/class**: `mod_이름` 패턴 (`mod_clock`, `mod_cpuinfo`) — 클래스가 곧 DOM 모듈 id와 대응되는 1:1 관계
- **IPC 채널명**: 목적을 그대로 서술 (`ttyspawn`, `closeExtraTtys`, `getThemeOverride`) — 케밥/스네이크 없이 camelCase 그대로

### 3.3 비동기 패턴

- `Promise` 기반이 대부분이나 `async/await`도 혼용됨 (`_boot.js`의 `app.on('ready', async () => {...})`)
- 콜백 스타일 이벤트 핸들러 프로퍼티 패턴이 자주 보임: `term.onclosed = ...`, `term.onopened = ...`, `term.ondisconnected = ...` — Node `EventEmitter`를 상속하는 대신, 인스턴스에 직접 콜백 프로퍼티를 얹는 경량 옵저버 패턴을 자체 구현해서 사용 (외부 라이브러리 의존 최소화 철학으로 보임)

### 3.4 CSS 컨벤션

- **단위는 `vh`/`vw` 기반**이 압도적 (px 거의 안 씀) — 풀스크린 SF 인터페이스 컨셉상 해상도/화면비에 비례해서 스케일되어야 하기 때문. 이 설계 때문에 21:9, 32:9 같은 극단적 화면비에서 레이아웃이 깨지는 문제가 있었고(#832, #776, #747), 이번 세션에서 `extra_ratios.css`에 미디어쿼리로 보정함
- **CSS 변수(`--color_*`, `--font_*`)를 통한 테마 시스템** — 컴포넌트 CSS는 하드코딩된 색상을 쓰지 않고 전부 `rgb(var(--color_r), var(--color_g), var(--color_b))` 형태로 참조
- `<h3 class="title">` + `::before`/`::after` 의사요소로 만드는 "모서리 브라켓" 장식이 여러 모듈 CSS에 반복되는 패턴 (SF UI 특유의 패널 테두리 표현)
- `augmented-ui` 서드파티 라이브러리(클리핑된 다각형 패널 모양)를 부분적으로 사용

---

## 4. 기능 목록 (상세)

### 4.1 터미널
- 실제 쉘 프로세스(사용자 지정 가능: bash/zsh/fish/PowerShell 등) 완전 에뮬레이션, `xterm.js` 기반
- 색상, 마우스 이벤트, `curses` 기반 TUI 앱(vim, htop, ranger 등) 완전 지원
- 다중 탭 (기본 1개 + 최대 4개 추가, 탭마다 독립된 pty 프로세스/websocket)
- CWD(현재 작업 디렉토리) 추적 → 파일 브라우저 패널과 실시간 연동 (Windows는 기술적 한계로 미지원, "detached mode"로 폴백)
- 커스텀 컬러 필터 (테마의 `colorFilter` 배열 — negate/grayscale/lighten/darken/saturate 등 체이닝 가능)
- 폰트 리거처 지원 (`xterm-addon-ligatures`)
- WebGL 렌더링 가속 (`xterm-addon-webgl`)

### 4.2 시스템 모니터링
- CPU 사용률 실시간 그래프 (`smoothie.js` 기반 스파크라인)
- RAM/스왑 사용량
- 하드웨어 인스펙터 (온도 센서 등, macOS는 `osx-temperature-sensor` optional dependency)
- 프로세스 목록(toplist) — `top`/`htop` 유사, 정렬/스레드 제외 옵션

### 4.3 네트워크 모니터링
- 활성 연결 목록, 송수신 속도
- GeoIP 조회 (`geolite2-redist` + `maxmind` — MaxMind GeoLite2-City DB를 최초 실행 시 자동 다운로드)
- 외부 IP 조회 (`myexternalip.com` API 호출)
- 3D 지구본 위젯에 연결 위치를 실시간 마커로 시각화 (`encom-globe.js`, ~980K 서드파티 벤더 스크립트)

### 4.4 파일 브라우저
- 터미널의 CWD를 따라가며 실시간으로 디렉토리 내용 표시
- 파일 타입별 아이콘 (`file-icons` git submodule 기반, 3.1MB짜리 `file-icons.json` 매칭 테이블)
- 리스트 뷰/그리드 뷰 토글, 숨김파일(dotfile) 토글
- 파일 클릭 시 터미널에 경로 입력 (Windows detached 모드에서 특히 유용)

### 4.5 온스크린 키보드
- 19개 레이아웃 내장: US/GB/DE/FR(+BEPO)/ES(+LAT)/IT/PT-BR/NL/SV/DA/HU/TR(Q/F) + 영어 대체 배열(DVORAK/COLEMAK/NORMAN/WORKMAN)
- 터치스크린 대응 (터치 이벤트 핸들링)
- Passmode(비밀번호 입력 시 시각적 피드백 숨김) 단축키 지원

### 4.6 미디어/문서 뷰어
- 내장 미디어 플레이어 (`howler.js` 기반 오디오 재생)
- PDF 리더 (`pdfjs-dist` — Mozilla PDF.js)

### 4.7 커스터마이징
- **테마**: 21개 내장 테마 (JSON, 색상/폰트/터미널/지구본 색상 정의) — tron, matrix, blade, cyborg, nord, red, apollo, interstellar, chalkboard, navy 등 계열별 변형 다수 (`-notype`, `-disrupted`, `-ligatures`, `-focus` 등 수식어 붙은 배리에이션)
- **키보드 오버라이드**: 런타임 핫스위치
- **CSS 인젝션**: 테마 JSON의 `injectCSS` 필드로 임의 CSS 주입 가능
- **단축키 커스터마이징**: `shortcuts.json` — app 액션과 shell 커맨드 실행 두 타입 지원
- **사운드팩**: 효과음 on/off, 볼륨 조절 (13개 wav 파일 — 부팅, 키입력, 접근 허용/거부, 알람, 패널 전환 등)
- **프록시 지원** (`#1050`, 이번 세션에서 추가): `settings.proxy` 또는 표준 `HTTP(S)_PROXY` 환경변수를 통한 제한된 네트워크 대응

### 4.8 기타
- 퍼지 파인더 (Ctrl+Shift+F) — 파일/커맨드 빠른 검색
- 업데이트 체커 (GitHub Releases 폴링)
- 부팅 인트로 애니메이션 (스킵 가능, `--nointro` 플래그)
- 멀티 모니터 지원 (`settings.monitor` 인덱스 지정)
- 강제 풀스크린 또는 창모드(`allowWindowed`) 전환 가능

---

## 5. 디자인 테마 시스템

### 5.1 테마 JSON 스키마

```json
{
  "colors": {
    "r": 170, "g": 207, "b": 209,
    "black": "#000000",
    "light_black": "#05080d",
    "grey": "#262828",
    "red": "...", "yellow": "..."
  },
  "cssvars": {
    "font_main": "United Sans Medium",
    "font_main_light": "United Sans Light"
  },
  "terminal": {
    "fontFamily": "Fira Mono",
    "cursorStyle": "block",
    "foreground": "#aacfd1",
    "background": "#05080d",
    "cursor": "#aacfd1",
    "cursorAccent": "#aacfd1",
    "selection": "rgba(170,207,209,0.3)",
    "colorFilter": ["negate()", "..."]
  },
  "globe": {
    "base": "#000000", "marker": "#aacfd1",
    "pin": "#aacfd1", "satellite": "#aacfd1"
  },
  "injectCSS": "/* 임의 CSS 문자열 */"
}
```

- `colors.r/g/b`는 앱 전체 강조색(accent color)의 RGB — CSS에서 `rgb(var(--color_r), var(--color_g), var(--color_b))`로 재조합되어 투명도 조절이 자유로움
- `_renderer.js`의 `window._loadTheme()`가 이 JSON을 읽어 `<style class="theming">` 태그를 동적으로 `<head>`에 주입하는 방식 — CSS-in-JS 라이브러리 없이 순수 문자열 템플릿 조립
- 폰트는 `FontFace` Web API로 런타임 로드 (커스텀 폰트를 테마마다 다르게 지정 가능하지만, 실제로는 내장 폰트 4종 — Fira Code/Mono, United Sans Light/Medium 중에서 조합)
- `window._purifyCSS()` 헬퍼로 값 삽입 전 이스케이프 처리 (CSS injection 방지 목적으로 보임)

### 5.2 시각 디자인 언어

- **다크 배경 + 단일 강조색(accent) + 기하학적 브라켓 테두리**가 핵심 룩앤필. 대부분의 테마가 어두운 배경에 시안/앰버/그린 계열의 단색 강조색을 쓰는 "레트로퓨처 HUD" 스타일
- **그리드 배경** (`main.css`의 `body` — `linear-gradient`로 만든 격자 무늬 배경, "회로기판/블루프린트" 느낌)
- 패널 제목(`h3.title`)마다 좌우로 짧은 브라켓 선(`::before`/`::after`)이 튀어나오는 디테일이 전 모듈 공통 스타일로 반복
- 스크롤바까지 테마 색상에 맞춰 커스터마이징 (`::-webkit-scrollbar-*`)
- 테마 배리에이션 네이밍 규칙: `-notype`(터미널 타이핑 이펙트 없음), `-disrupted`(노이즈/글리치 연출), `-ligatures`(폰트 리거처 활성), `-focus`(특정 UI 강조), `-colorfilter`(컬러 필터 데모)

---

## 6. 빌드 · 배포 파이프라인

### 6.1 이중 `package.json` 구조와 그 이유

| | root `package.json` | `src/package.json` |
|---|---|---|
| 목적 | **빌드 툴체인** | **런타임 의존성** (실제 앱 코드가 `require()`하는 것들) |
| 대표 의존성 | `electron`, `electron-builder`, `terser`, `clean-css` | `xterm`, `node-pty`, `systeminformation`, `ws`, `nan` 등 |
| electron-builder의 `directories.app` | `prebuild-src` (빌드시 생성) | — |

빌드 시 `src/`를 `prebuild-src/`로 복사(rsync/xcopy) → `prebuild-minify.js`로 JS/CSS/JSON 압축 → `prebuild-src`에서 **별도로** `npm install` 실행(이 install이 실제 앱 번들에 들어갈 `node_modules`를 만듦) → `electron-builder`가 `prebuild-src`를 패키징. root의 `node_modules`(electron-builder 등 툴)는 최종 배포물에 포함되지 않음.

### 6.2 네이티브 모듈

- **`node-pty`**: pty(pseudo-terminal) 바인딩, C++ 네이티브 애드온 → `node-gyp` 빌드 필요, Electron의 V8/Node ABI에 맞춰 재빌드되어야 함(`npmRebuild: true`)
- **`osx-temperature-sensor`**: macOS 전용 optional dependency, 온도 센서 읽기
- 두 네이티브 모듈 모두 `nan`(Native Abstractions for Node)에 의존 — 이번 세션에서 Node 18의 V8 API(`GetBackingStore`) 호환을 위해 `^2.20.0`으로 상향 고정함 (`node-pty`가 원래 고정한 `nan@2.14.0`은 구식 `GetContents()` API를 써서 Node 18+에서 컴파일 실패)

### 6.3 플랫폼별 빌드 타겟

| 플랫폼 | 아키텍처 | 산출물 | 비고 |
|---|---|---|---|
| Linux | x64, ia32, arm64, armv7l | `.AppImage` | arm 빌드는 QEMU 에뮬레이션 + 전용 Docker 컨테이너에서 별도 빌드 |
| macOS | x64, **arm64**(이번 세션에서 추가) | `.dmg` | 코드사이닝 없음(unsigned) — Apple Developer 인증서 미보유로 의도적 |
| Windows | x64, ia32 | NSIS `.exe` 인스톨러 | 설치 경로 변경 허용, 언인스톨시 데이터 삭제 |

### 6.4 CI (GitHub Actions) — `build-binaries.yaml`

5개 병렬 job: `build-linux`, `build-linux-arm32`, `build-linux-arm64`, `build-windows`, `build-darwin`. 각 job이 여러 겹의 레거시 툴체인 이슈를 안고 있었음(이번 세션에서 전부 해결):

- Node 14/18 고정 + 각 OS별 네이티브 빌드 도구(node-gyp) 버전 불일치
- Windows: `windows-2022` 러너 고정 + node-gyp를 통째로 최신 버전(9.x)으로 교체(VS2022 인식 문제)
- macOS: Python 3.12+/3.14의 `distutils` 제거 대응(`setuptools` 설치), `openssl_fips` gyp 변수 누락 대응, `electron-builder` 22→23 업그레이드(구 macOS 러너에 없는 `/usr/bin/python` 하드코딩 호출 문제)
- 공통: deprecated GitHub Actions(`actions/cache@v2`, `actions/upload-artifact@v2` 등) 최신 메이저로 전면 교체

---

## 7. 보안 관련 참고사항

- **CSWSH 취약점 (패치 완료)**: 터미널 websocket 서버가 원래 Origin 헤더를 검증하지 않아, 악성 웹사이트가 브라우저를 경유해 로컬 쉘에 임의 명령을 주입할 수 있었음(`GHSA-q8xc-f2wf-ffh9`). `verifyClient`에서 Origin이 없거나 `file://`인 경우만 허용하도록 패치.
- **`nodeIntegration: true` + `contextIsolation: false`**: 렌더러가 Node API에 직접 접근 가능한 구조라, 렌더러에서 임의 원격 콘텐츠를 로드하면 RCE로 직결되는 공격 표면이 원래도 넓음. `will-navigate`/`new-window` 핸들러로 외부 URL 로드를 막고 있으나, 근본적으로는 최신 Electron 보안 가이드(contextBridge 기반 격리)와는 거리가 있는 구조.
- **`SECURITY.md`** 존재 — 취약점 제보 절차 명시.

---

## 8. 알려진 구조적 한계 (참고용)

- **빌드 시스템 부재**: 프론트엔드 코드에 Webpack/Rollup/Vite 등이 없어 `<script>` 태그 순서에 의존 — 순서를 잘못 바꾸면 클래스 참조 오류가 남. `prebuild-minify.js`가 하는 일은 압축뿐, 번들링이 아님.
- **vh/vw 전면 사용의 트레이드오프**: 표준 16:9~4:3 범위에선 잘 작동하지만 극단적 화면비(21:9, 32:9)에서 별도 미디어쿼리 보정이 필요함 (`extra_ratios.css`).
- **레거시 네이티브 빌드 체인**: `node-gyp`/Python 빌드 도구 체인에 강하게 의존하는 구조라, OS/Python/Node 버전이 조금만 올라가도 native addon(node-pty 등) 컴파일이 깨지기 쉬움 — 이번 세션에서 다룬 CI 이슈 대부분이 이 카테고리.
- **테스트 코드 부재**: 저장소에 유닛/통합 테스트가 없음. `package.json`의 `test` 스크립트는 `snyk test`(의존성 취약점 스캔)를 실행하는 것으로, 실제 코드 동작을 검증하는 테스트는 아님.
- **프로젝트 아카이브 상태**: 원 저장소는 유지보수 종료 상태(Public Archive). 이 포크(`dldvk9999/edex-ui`)가 패치/유지보수를 이어가는 용도.

---

## 9. 의존성 요약

<details>
<summary>root package.json — 빌드 툴체인 (펼치기)</summary>

- `electron` `^12.1.0`
- `electron-builder` `^23.6.0`
- `terser` `^5.9.0` (JS 압축)
- `clean-css` `5.2.1` (CSS 압축)
- `node-json-minify` `1.0.0`
- `mime-types` `^2.1.33`
- `node-abi` `2.30.1`
- (optional) `cson-parser` `4.0.9`

</details>

<details>
<summary>src/package.json — 런타임 의존성 (펼치기)</summary>

- **터미널**: `xterm`, `xterm-addon-attach`, `xterm-addon-fit`, `xterm-addon-ligatures`, `xterm-addon-webgl`, `node-pty`, `nan`
- **Electron 통합**: `@electron/remote`
- **네트워크**: `ws`, `https-proxy-agent`, `geolite2-redist`, `maxmind`
- **시스템 정보**: `systeminformation`, `which`, `username`, `shell-env`
- **UI/디자인**: `augmented-ui`
- **미디어**: `howler`, `pdfjs-dist`
- **유틸리티**: `color`, `nanoid`, `pretty-bytes`, `signale`, `smoothie`, `tail`
- (optional, macOS) `osx-temperature-sensor`

</details>

---

## 10. 요약 카탈로그

| 카테고리 | 요약 |
|---|---|
| **언어** | JavaScript (ES6 class), HTML, CSS — TypeScript 미사용 |
| **런타임** | Electron 12 (Chromium + Node.js) |
| **아키텍처 패턴** | Main/Renderer 이원 구조, 자체 websocket 프로토콜(터미널), IPC 요청-응답, Proxy 기반 투명 RPC(`systeminformation`) |
| **빌드 도구** | 없음(번들러 미사용), `electron-builder`로 패키징, `terser`/`clean-css`로 단순 압축만 수행 |
| **스타일 시스템** | Vanilla CSS + CSS 커스텀 프로퍼티 기반 테마 엔진, vh/vw 단위 |
| **네이티브 의존성** | `node-pty`(필수), `osx-temperature-sensor`(macOS 옵션) |
| **정적 분석/린팅** | 없음 (컨벤션은 관습적으로만 유지) |
| **테스트** | 없음 (`snyk test`만 존재, 취약점 스캔용) |
| **국제화(i18n)** | 없음 — UI 텍스트는 영어 하드코딩, 다만 키보드 레이아웃은 19개 언어권 지원 |
| **플랫폼 지원** | Linux(x64/ia32/arm64/armv7l), macOS(x64/arm64), Windows(x64/ia32) |
