# 코스피 50일 이격도 전략 트래커

코스피 외부 시세를 자동으로 받아 50일 이동평균과 이격도를 계산하고, 현재 이격도 구간에 맞는 전략을 화면에 보여주는 로컬 웹앱입니다.

## 지금 들어있는 것

- GitHub Pages용 정적 화면: `public`
- 코스피 데이터 자동 생성 스크립트: `scripts/update-kospi-data.js`
- GitHub Pages 자동 배포 설정: `.github/workflows/pages.yml`
- 로컬 미리보기 서버: `server.js`

## 로컬 실행

Codex 내장 Node.js를 사용할 수 있으면 아래처럼 실행합니다.

```powershell
& "$HOME\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\server.js
```

브라우저에서 `http://localhost:4173`을 열면 됩니다.

또는 PowerShell에서 아래 파일을 실행해도 됩니다.

```powershell
.\start.ps1
```

## GitHub Pages로 쓰기

1. GitHub에서 새 저장소를 만듭니다.
2. 이 폴더의 파일을 그 저장소에 올립니다.
3. 저장소의 기본 브랜치를 `main` 또는 `master`로 둡니다.
4. GitHub 저장소의 `Settings > Pages`에서 Source를 `GitHub Actions`로 선택합니다.
5. `Actions` 탭에서 `Deploy GitHub Pages`가 성공하면 아래 주소로 접속합니다.

```text
https://<깃허브아이디>.github.io/<저장소이름>/
```

데이터는 GitHub Actions가 평일 12:00, 15:40 KST에 자동으로 새로 받아 배포합니다. 수동 갱신이 필요하면 `Actions > Deploy GitHub Pages > Run workflow`를 누르면 됩니다.

## 깃허브에 올릴 파일

아래 폴더와 파일을 그대로 올리면 됩니다.

- `.github`
- `public`
- `scripts`
- `.gitignore`
- `package.json`
- `README.md`
- `server.js`
- `start.ps1`

`.server.log`, `.server.err` 파일은 로컬 미리보기 기록이므로 올리지 않아도 됩니다.

## 기능

- Yahoo Finance 공개 차트 데이터로 코스피 5년 데이터를 자동 수집
- 50일 이동평균과 이격도 자동 계산
- 105, 120, 130 기준으로 과열해소·정상·경계·과열 구간 표시
- 구간별 전략 입력, 수정, 저장
- 현재 이격도 구간에 맞는 전략 자동 표시

저장된 전략은 사용하는 브라우저의 로컬 저장소에 보관됩니다.
