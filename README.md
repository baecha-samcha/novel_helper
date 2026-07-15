# NovelHelper — 소설 집필용 설정 관리 앱

Electron + better-sqlite3 기반의 **완전 오프라인** 데스크톱 앱입니다. 네트워크 없이
동작하며, 모든 데이터는 로컬 SQLite 파일(`novel.db`) 하나에 저장됩니다. DB 파일
경로를 지정할 수 있어 여러 작품을 각각 다른 파일로 관리할 수 있습니다. 추후에 [namulite](https://github.com/baecha-samcha/namulite)와 연동할 계획입니다.

## 기능

- **인물 관리** — 이름·나이·외모·성격·소속·비밀·이미지 첨부
- **인물 관계도** — vis-network 기반 드래그 가능한 노드 그래프. 관계선 라벨(연인/원수/가족 등)과 방향성 표시. 노드 위치는 자동 저장됨
- **배경/세계관** — 장소·조직·용어사전을 카테고리별로 정리
- **사건 타임라인** — 작중 시간순 배치, 관련 인물 태그
- **전체 텍스트 검색** — SQLite FTS5(trigram) 기반. 한글 부분 문자열 검색 지원
- **백업** — DB 파일 내보내기/가져오기, JSON 내보내기

## 데이터베이스 스키마

`characters`, `relationships`, `locations`, `organizations`, `glossary`,
`events`, `event_characters` 로 정규화. `relationships` 는 `characters` 를 두 개의
외래키(`from_character_id`, `to_character_id`)로 참조하며, 인물 삭제 시
관련 관계·태그가 `ON DELETE CASCADE` 로 함께 정리됩니다. 검색용 FTS5 가상 테이블
`search_fts` 는 각 엔티티 저장 시 앱에서 자동으로 재색인합니다.

## 설치 및 실행

### 일반 환경 (Node.js 18/20/22 LTS 권장)

```bash
npm install      # better-sqlite3 를 Electron 용으로 자동 리빌드 (postinstall)
npm start
```

### Node.js 26 등 최신 버전에서 (prebuilt 바이너리 미제공 시)

최신 Node 에서는 `better-sqlite3` 의 소스 빌드가 실패할 수 있어, 아래처럼
스크립트를 건너뛰고 **Electron 용으로만** 네이티브 모듈을 리빌드합니다.

```bash
npm install --ignore-scripts
npx electron-builder install-app-deps   # better-sqlite3 를 Electron ABI 로 리빌드
node node_modules/electron/install.js    # Electron 바이너리 내려받기
npm start
```

> Node 26 에서는 소스 컴파일에 Python 의 `distutils` 가 필요한데 Python 3.12+
> 에서 제거되어 일반 `npm install` 이 실패합니다. 위 절차는 이를 우회합니다.
> 가능하면 Node LTS 사용을 권장합니다.

## 빌드 (배포용 패키지)

electron-builder 로 Windows / Linux 양쪽 빌드를 지원합니다.

```bash
npm run dist:win     # Windows: NSIS 설치본 + portable
npm run dist:linux   # Linux: AppImage + deb
npm run dist         # 현재 플랫폼
```

산출물은 `dist/` 에 생성됩니다.

## 프로젝트 구조

```
main.js            Electron 메인 프로세스 (창, IPC 핸들러, 파일 다이얼로그)
preload.js         contextBridge 로 안전하게 노출하는 렌더러 API
db.js              better-sqlite3 데이터 계층 (스키마·CRUD·FTS5·내보내기)
src/
  index.html       앱 셸 (사이드바 + 뷰 컨테이너)
  styles.css       다크모드 테마
  app.js           네비게이션 / DB 툴바 부트스트랩
  ui.js            공통 헬퍼 (모달·토스트·폼)
  views/
    characters.js  인물
    graph.js       관계도 (vis-network)
    world.js       배경/세계관
    timeline.js    타임라인
    search.js      전체 검색
```

## 데이터 위치

- 기본 DB: `~/Documents/NovelHelper/novel.db` (최초 실행 시 자동 생성)
- 마지막으로 연 DB 경로는 앱 설정에 저장되어 다음 실행 때 자동으로 열립니다
- 사이드바 하단에서 다른 작품 DB 를 열거나 새로 만들 수 있습니다
