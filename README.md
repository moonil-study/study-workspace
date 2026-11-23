# 스터디 워크스페이스 — GitHub Pages용 프로젝트

저장소의 `code_artifact.tsx`를 React 앱으로 실행하도록 Vite, TypeScript, Tailwind CSS 구성을 더했습니다. 저장소 이름 `study-workspace`에 맞춰 Pages 경로(`/study-workspace/`)를 지정했으며, `main`에 변경을 올리면 GitHub Actions가 빌드·게시합니다.

## 업로드와 배포
1. ZIP을 다운로드하고 컴퓨터에서 압축을 풉니다.
2. GitHub 저장소의 **Code → Add file → Upload files**에서 압축 해제한 프로젝트 내용 전체를 저장소 최상위에 올립니다. `package.json`, `index.html`, `src`, `.github` 등이 최상위에 와야 하며 프로젝트 폴더 안에 한 겹 더 넣지 마세요.
3. **Commit changes**를 누릅니다.
4. **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다.
5. **Actions** 탭에서 `Deploy study workspace to GitHub Pages` 작업이 초록색 완료가 될 때까지 기다립니다.
6. 사이트 주소: https://moonil-study.github.io/study-workspace/

저장소 이름을 바꾸면 `vite.config.ts`의 `base` 경로도 수정하세요. 로컬 실행은 Node.js 22 이상에서 `npm install`, `npm run dev`; 빌드 확인은 `npm run build`입니다.

## 공개 전 보안 주의
원본 TSX에는 초기 관리자 코드 `2026` 및 예시 계정 `kimdanu / 1213`이 포함되어 있습니다. 공개 소스에서는 이 값들을 누구나 확인할 수 있습니다. 실제 비밀번호로 재사용하지 마세요. 계정 및 학습 데이터는 브라우저의 `localStorage`에만 저장되어 사용자 간 공유되지 않으며, 이것은 서버 기반 인증이나 공동 데이터베이스가 아닙니다. 실제 사용자 데이터로 운영하려면 공개 전에 서버 인증과 데이터베이스를 별도로 적용해야 합니다.
