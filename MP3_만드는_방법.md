# 면접 MP3 만드는 방법

## 0. 폴더 준비

아무 곳이나 좋습니다. 예를 들어 `C:\면접MP3` 폴더를 만들고 **두 파일을 같은 폴더에** 넣으십시오.

```
C:\면접MP3\
    make_mp3.py      ← 실행할 스크립트
    qa_data.py       ← 61문항 데이터
```

`qa_data.py`는 `career61.zip` 안에 들어 있습니다.

---

## 1. 파이썬 설치 (이미 있으면 넘어가십시오)

터미널에서 `python --version`을 쳐서 `Python 3.x`가 나오면 설치되어 있는 것입니다.

없다면 https://www.python.org/downloads/ 에서 받으십시오.
**설치 화면 맨 아래 `Add python.exe to PATH` 체크를 반드시 켜야 합니다.**

---

## 2. edge-tts 설치

터미널(윈도우는 `Win + R` → `cmd` → 엔터)에서:

```
pip install edge-tts
```

마이크로소프트의 음성 합성 서비스를 쓰는 무료 라이브러리입니다. 별도 가입이나 API 키가 필요 없습니다.

---

## 3. ffmpeg 설치

음성 조각을 합치고 무음을 넣는 데 씁니다.

**윈도우**
```
winget install Gyan.FFmpeg
```
설치가 끝나면 **터미널 창을 닫고 새로 여십시오.** PATH가 새 창부터 적용됩니다.

`winget`이 없다면 https://www.gyan.dev/ffmpeg/builds/ 에서 `release essentials` zip을 받아 압축을 풀고, `bin` 폴더를 시스템 환경변수 PATH에 추가하십시오.

**맥**
```
brew install ffmpeg
```

**확인**
```
ffmpeg -version
```
버전 정보가 나오면 됩니다.

---

## 4. 실행

폴더로 이동해서 실행합니다.

```
cd C:\면접MP3
python make_mp3.py
```

61문항 전체를 만듭니다. 네트워크 속도에 따라 **10~20분쯤** 걸립니다.

### 만들어지는 것

```
out\
    single\                      문항별 파일 61개
        001_진로전담교사의 공통직무와 진로상담 시수 인정.mp3
        002_....mp3
        ...
    group\                       10문항 묶음 7개 (각 28~30분)
        G01_001-010.mp3
        ...
    재생목록.m3u
```

전체 분량은 **약 2시간 56분**입니다. 파일에 앨범·트랙 번호 태그가 붙어 있어 휴대폰 음악 앱에서 번호순으로 재생됩니다.

---

## 5. 자주 쓸 명령

| 하고 싶은 것 | 명령 |
|---|---|
| 전체 | `python make_mp3.py` |
| 상담 영역만 | `python make_mp3.py --area 상담` |
| 교직관·이력만 | `python make_mp3.py --area 교직관·이력` |
| S등급만 | `python make_mp3.py --grade S` |
| 42~46번만 | `python make_mp3.py --only 42-46` |
| 3번, 7번, 12번만 | `python make_mp3.py --only 3,7,12` |
| **답안만** (문항 낭독 생략) | `python make_mp3.py --mode answer` |
| **문항만** (구상 연습용) | `python make_mp3.py --mode question` |
| 문항 뒤 구상 40초 넣기 | `python make_mp3.py --think 40` |
| 답안을 1.15배속으로 | `python make_mp3.py --rate +15%` |
| 묶음을 5문항씩 | `python make_mp3.py --group 5` |
| 묶음 파일 안 만들기 | `python make_mp3.py --group 0` |
| 묶음만 만들기 | `python make_mp3.py --no-single` |

여러 개를 같이 쓸 수 있습니다.

```
python make_mp3.py --area 교직관·이력 --think 40 --rate +10%
```

### 쓰임새별 추천

- **출퇴근 중 통독** → `--mode answer --rate +15%`
  문항 낭독을 빼고 답안만 빠르게 흘려듣습니다.
- **실전 연습** → `--think 40`
  문항을 듣고 40초 구상한 뒤 모범답안이 나옵니다. 그 사이에 직접 말해 보십시오.
- **막판 취약 영역 집중** → `--area 검사·이론`

---

## 6. 목소리 바꾸기

`make_mp3.py` 파일 위쪽의 설정을 고치면 됩니다.

```python
VOICE_Q     = "ko-KR-InJoonNeural"   # 문항 — 남성
VOICE_A     = "ko-KR-SunHiNeural"    # 답안 — 여성
RATE_Q      = "+0%"
RATE_A      = "+0%"
```

문항과 답안의 목소리를 다르게 둔 것은 듣는 중에 지금이 질문인지 답인지 구분되게 하기 위해서입니다.

쓸 수 있는 목소리 목록은 이렇게 확인합니다.

```
python make_mp3.py --list-voices
```

무음 길이도 같은 자리에서 조정합니다.

```python
GAP_TITLE   = 0.8    # 번호 안내 뒤
GAP_PROMPT  = 0.7    # 제시문 뒤
GAP_SUB     = 0.5    # 하위질문 사이
GAP_THINK   = 0.0    # 구상 시간 (--think 로도 지정 가능)
GAP_SEG     = 0.6    # 답안 구간 사이
GAP_TAIL    = 1.2    # 묶음 파일에서 문항 사이
```

---

## 7. 문제가 생기면

| 증상 | 원인과 해결 |
|---|---|
| `ffmpeg 를 찾을 수 없습니다` | 3번을 다시 하십시오. 설치 후 **터미널을 새로 열어야** 합니다. |
| `edge-tts 가 설치되어 있지 않습니다` | `pip install edge-tts` |
| `qa_data.py 가 이 폴더에 없습니다` | 두 파일이 같은 폴더에 있는지, `cd`로 그 폴더에 들어갔는지 확인하십시오. |
| `음성 합성에 실패했습니다` | 인터넷 연결 문제입니다. 학교 방화벽이 막는 경우가 있으니 다른 망에서 시도해 보십시오. |
| `python`을 못 찾음 | `py make_mp3.py` 로 해 보십시오. 그래도 안 되면 파이썬 재설치 시 PATH 체크. |
| 한글이 깨짐 | 터미널에서 `chcp 65001` 을 먼저 실행하십시오. |
| 중간에 끊겼다 | 그냥 다시 실행하십시오. 이미 만든 음성 조각은 건너뛰고 이어서 진행합니다. |

---

## 8. 참고

- 중간 파일은 `out\_tmp`에 쌓였다가 끝나면 자동으로 지워집니다. 남기려면 `--keep-tmp`.
- 다시 실행하면 `out` 폴더의 기존 파일을 덮어씁니다. 이전 것을 남기려면 폴더 이름을 바꿔 두십시오.
- 전체 61문항 기준 약 160MB입니다.
