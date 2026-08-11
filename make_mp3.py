#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
진로전담교사 심층면접 · MP3 생성기
=====================================

qa_data.py 의 문항을 읽어 문항별 MP3 를 만들고, 묶음 파일까지 생성합니다.

필요한 것
    pip install edge-tts
    ffmpeg (PATH 에 있어야 합니다)

사용법
    python make_mp3.py                  # 전체 61문항
    python make_mp3.py --area 상담      # 특정 영역만
    python make_mp3.py --grade S        # S등급만
    python make_mp3.py --only 42-46     # 번호 범위
    python make_mp3.py --mode answer    # 답안만 (문항 낭독 생략)
    python make_mp3.py --think 40       # 문항 뒤 구상 시간 40초
    python make_mp3.py --list-voices    # 사용 가능한 한국어 음성 확인

만들어지는 것
    out/single/001_슬러그.mp3 …         문항별 파일
    out/group/G01_001-010.mp3 …         10문항 묶음 (--group 으로 조정)
    out/재생목록.m3u                     순서대로 재생하는 목록
"""

import argparse
import asyncio
import os
import re
import shutil
import subprocess
import sys

# ─────────────────────────────────────────────────────────────
# 기본 설정 — 이 값들만 바꾸면 전체 동작이 달라집니다
# ─────────────────────────────────────────────────────────────
VOICE_Q     = "ko-KR-InJoonNeural"   # 문항(제시문·하위질문) 목소리 — 남성
VOICE_A     = "ko-KR-SunHiNeural"    # 모범답안 목소리 — 여성
RATE_Q      = "+0%"                  # 문항 속도
RATE_A      = "+0%"                  # 답안 속도  (예: "+15%" 로 빠르게)

GAP_TITLE   = 0.8    # 번호 안내 뒤 (초)
GAP_PROMPT  = 0.7    # 제시문 뒤
GAP_SUB     = 0.5    # 하위질문 사이
GAP_THINK   = 0.0    # 하위질문 끝 → 답안 시작 (구상 시간). --think 로 변경
GAP_SEG     = 0.6    # 답안 구간(도입·전개·마무리) 사이
GAP_TAIL    = 1.2    # 문항 끝 (묶음 파일에서 문항 사이 간격)

GROUP_SIZE  = 10     # 묶음 파일 하나에 넣을 문항 수
BITRATE     = "64k"
SAMPLERATE  = 24000

OUT_DIR     = "out"
TMP_DIR     = os.path.join(OUT_DIR, "_tmp")


# ─────────────────────────────────────────────────────────────
def die(msg):
    print("\n[중단] " + msg + "\n", file=sys.stderr)
    sys.exit(1)


def check_env():
    if shutil.which("ffmpeg") is None:
        die("ffmpeg 를 찾을 수 없습니다.\n"
            "      Windows: winget install Gyan.FFmpeg  (설치 후 터미널을 새로 여십시오)\n"
            "      Mac:     brew install ffmpeg")
    try:
        import edge_tts  # noqa: F401
    except ImportError:
        die("edge-tts 가 설치되어 있지 않습니다.\n"
            "      pip install edge-tts")
    if not os.path.exists("qa_data.py"):
        die("qa_data.py 가 이 폴더에 없습니다.\n"
            "      make_mp3.py 와 qa_data.py 를 같은 폴더에 두고 실행하십시오.")


def run(cmd):
    r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if r.returncode != 0:
        die("ffmpeg 오류\n      " + " ".join(cmd) + "\n      "
            + r.stderr.decode("utf-8", "replace")[-500:])


def safe(name, limit=40):
    """파일명에 쓸 수 없는 문자 제거"""
    name = re.sub(r'[\\/:*?"<>|]', "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name[:limit]


def mmss(sec):
    return "%d:%02d" % (int(sec) // 60, int(sec) % 60)


# ─────────────────────────────────────────────────────────────
# 무음 파일 (같은 길이는 한 번만 만들어 재사용)
# ─────────────────────────────────────────────────────────────
_silence_cache = {}


def silence(sec):
    sec = round(float(sec), 2)
    if sec <= 0:
        return None
    if sec in _silence_cache:
        return _silence_cache[sec]
    path = os.path.join(TMP_DIR, "sil_%.2f.mp3" % sec)
    if not os.path.exists(path):
        run(["ffmpeg", "-y", "-f", "lavfi",
             "-i", "anullsrc=r=%d:cl=mono" % SAMPLERATE,
             "-t", str(sec), "-c:a", "libmp3lame", "-b:a", BITRATE, path])
    _silence_cache[sec] = path
    return path


# ─────────────────────────────────────────────────────────────
# 음성 합성
# ─────────────────────────────────────────────────────────────
async def synth(text, voice, rate, path):
    import edge_tts
    await edge_tts.Communicate(text, voice, rate=rate).save(path)


async def synth_all(jobs):
    """jobs: [(text, voice, rate, path)] — 동시 실행 수를 제한해 안정적으로"""
    sem = asyncio.Semaphore(4)
    done = [0]
    total = len(jobs)
    errors = []

    async def one(t, v, r, p):
        async with sem:
            if not os.path.exists(p) or os.path.getsize(p) < 512:
                for attempt in range(3):
                    try:
                        await synth(t, v, r, p)
                        break
                    except Exception as e:          # 재시도 후에도 실패하면 기록만
                        if attempt == 2:
                            errors.append((p, repr(e)))
                        else:
                            await asyncio.sleep(1.5 * (attempt + 1))
            done[0] += 1
            if done[0] % 10 == 0 or done[0] == total:
                print("    음성 %d/%d" % (done[0], total), end="\r", flush=True)

    await asyncio.gather(*[one(*j) for j in jobs])
    print()
    if errors:
        die("음성 합성에 실패했습니다 (%d건). 인터넷 연결과 방화벽을 확인하십시오.\n"
            "      edge-tts 는 마이크로소프트 서버에 접속해야 동작합니다.\n"
            "      첫 실패: %s\n      %s" % (len(errors), errors[0][0], errors[0][1]))


# ─────────────────────────────────────────────────────────────
# 문항 → 재생 조각 목록
# ─────────────────────────────────────────────────────────────
def pieces_for(item, mode, think):
    """[(kind, text_or_seconds)] 를 돌려줍니다. kind: 'q' | 'a' | 'gap'"""
    p = []
    if mode in ("full", "question"):
        p.append(("q", "%d번. %s." % (item["no"], item["slug"])))
        p.append(("gap", GAP_TITLE))
        p.append(("q", item["prompt"]))
        p.append(("gap", GAP_PROMPT))
        for i, s in enumerate(item["subs"]):
            p.append(("q", "%d번 질문. %s" % (i + 1, s)))
            p.append(("gap", GAP_SUB if i < len(item["subs"]) - 1 else 0))
        if think > 0:
            p.append(("gap", think))
    if mode in ("full", "answer"):
        if mode == "answer":
            p.append(("q", "%d번. %s." % (item["no"], item["slug"])))
            p.append(("gap", GAP_TITLE))
        elif think <= 0:
            p.append(("gap", GAP_PROMPT))
        for i, seg in enumerate(item["answer"]):
            p.append(("a", seg["text"]))
            if i < len(item["answer"]) - 1:
                p.append(("gap", GAP_SEG))
    return [x for x in p if not (x[0] == "gap" and x[1] <= 0)]


def concat(parts, out_path, meta):
    """parts: mp3 경로 목록 → 하나로 합치고 태그를 붙입니다"""
    lst = out_path + ".txt"
    with open(lst, "w", encoding="utf-8") as f:
        for p in parts:
            f.write("file '%s'\n" % os.path.abspath(p).replace("'", "'\\''"))
    cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst,
           "-c:a", "libmp3lame", "-b:a", BITRATE, "-ar", str(SAMPLERATE), "-ac", "1"]
    for k, v in meta.items():
        cmd += ["-metadata", "%s=%s" % (k, v)]
    cmd.append(out_path)
    run(cmd)
    os.remove(lst)


def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", path], stdout=subprocess.PIPE)
    try:
        return float(r.stdout.decode().strip())
    except ValueError:
        return 0.0


# ─────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="진로전담교사 심층면접 MP3 생성기")
    ap.add_argument("--area", help="영역만 (예: 상담, 교직관·이력)")
    ap.add_argument("--grade", help="등급만 (S 또는 A)")
    ap.add_argument("--only", help="번호 범위 (예: 42-46 또는 3,7,12)")
    ap.add_argument("--mode", choices=["full", "answer", "question"], default="full",
                    help="full=문항+답안(기본), answer=답안만, question=문항만")
    ap.add_argument("--think", type=float, default=GAP_THINK,
                    help="문항 낭독 뒤 구상 시간(초). 기본 %g" % GAP_THINK)
    ap.add_argument("--rate", help="답안 속도 (예: +15%%)")
    ap.add_argument("--group", type=int, default=GROUP_SIZE, help="묶음 파일당 문항 수. 0이면 묶음 안 만듦")
    ap.add_argument("--no-single", action="store_true", help="문항별 파일 생략, 묶음만")
    ap.add_argument("--keep-tmp", action="store_true", help="중간 파일 남기기")
    ap.add_argument("--list-voices", action="store_true", help="한국어 음성 목록 출력 후 종료")
    args = ap.parse_args()

    if args.list_voices:
        import edge_tts
        vs = asyncio.run(edge_tts.list_voices())
        for v in sorted(vs, key=lambda x: x["ShortName"]):
            if v["Locale"].startswith("ko"):
                print("  %-34s %s" % (v["ShortName"], v.get("Gender", "")))
        return

    check_env()
    sys.path.insert(0, os.getcwd())
    import qa_data

    rate_a = args.rate if args.rate else RATE_A

    items = list(qa_data.ITEMS)
    if args.area:
        items = [x for x in items if x["area"] == args.area]
    if args.grade:
        items = [x for x in items if x["grade"] == args.grade.upper()]
    if args.only:
        keep = set()
        for part in args.only.split(","):
            part = part.strip()
            if "-" in part:
                a, b = part.split("-")
                keep.update(range(int(a), int(b) + 1))
            elif part:
                keep.add(int(part))
        items = [x for x in items if x["no"] in keep]

    if not items:
        die("조건에 맞는 문항이 없습니다. --area / --grade / --only 를 확인하십시오.")

    print("\n  %s" % qa_data.ALBUM)
    print("  대상 %d문항 · 방식 %s · 구상 %g초" % (len(items), args.mode, args.think))
    print("  문항 음성 %s / 답안 음성 %s (%s)\n" % (VOICE_Q, VOICE_A, rate_a))

    os.makedirs(TMP_DIR, exist_ok=True)
    single_dir = os.path.join(OUT_DIR, "single")
    group_dir = os.path.join(OUT_DIR, "group")
    os.makedirs(single_dir, exist_ok=True)

    # 1) 필요한 음성 조각을 모두 모아 한 번에 합성
    print("  [1/3] 음성 합성")
    plans, jobs = [], []
    for it in items:
        seq = []
        for idx, (kind, val) in enumerate(pieces_for(it, args.mode, args.think)):
            if kind == "gap":
                seq.append(("gap", val))
            else:
                path = os.path.join(TMP_DIR, "%03d_%02d_%s.mp3" % (it["no"], idx, kind))
                voice = VOICE_Q if kind == "q" else VOICE_A
                rate = RATE_Q if kind == "q" else rate_a
                jobs.append((val, voice, rate, path))
                seq.append(("file", path))
        plans.append((it, seq))
    asyncio.run(synth_all(jobs))

    # 2) 문항별 파일
    print("  [2/3] 문항별 파일")
    made, total_sec = [], 0.0
    for it, seq in plans:
        parts = []
        for kind, val in seq:
            parts.append(silence(val) if kind == "gap" else val)
        parts = [p for p in parts if p]
        name = "%03d_%s.mp3" % (it["no"], safe(it["slug"]))
        out = os.path.join(single_dir, name)
        concat(parts, out, {
            "album": qa_data.ALBUM,
            "track": str(it["no"]),
            "title": "%03d %s" % (it["no"], it["slug"]),
            "artist": "%s · %s" % (it["area"], it["grade"]),
            "genre": "Speech",
            "comment": it["kind"],
        })
        d = duration(out)
        total_sec += d
        made.append((it, out, d))
        print("    %03d  %-42s %s" % (it["no"], safe(it["slug"], 42), mmss(d)))

    # 3) 묶음 파일 + 재생목록
    if args.group and args.group > 0:
        print("  [3/3] 묶음 파일 (%d문항씩)" % args.group)
        os.makedirs(group_dir, exist_ok=True)
        tail = silence(GAP_TAIL)
        for gi in range(0, len(made), args.group):
            chunk = made[gi:gi + args.group]
            parts = []
            for k, (it, path, d) in enumerate(chunk):
                parts.append(path)
                if k < len(chunk) - 1:
                    parts.append(tail)
            gname = "G%02d_%03d-%03d.mp3" % (gi // args.group + 1,
                                             chunk[0][0]["no"], chunk[-1][0]["no"])
            gout = os.path.join(group_dir, gname)
            concat(parts, gout, {
                "album": qa_data.ALBUM,
                "track": str(gi // args.group + 1),
                "title": "%d~%d번" % (chunk[0][0]["no"], chunk[-1][0]["no"]),
                "artist": qa_data.ALBUM,
                "genre": "Speech",
            })
            print("    %-30s %s" % (gname, mmss(duration(gout))))
    else:
        print("  [3/3] 묶음 파일 생략")

    # 재생목록 — 문항별 파일을 지운 경우에는 묶음 파일을 가리킵니다
    with open(os.path.join(OUT_DIR, "재생목록.m3u"), "w", encoding="utf-8") as f:
        f.write("#EXTM3U\n")
        if args.no_single:
            for gp in sorted(os.listdir(group_dir)) if os.path.isdir(group_dir) else []:
                gpath = os.path.join(group_dir, gp)
                f.write("#EXTINF:%d,%s\n" % (int(duration(gpath)), os.path.splitext(gp)[0]))
                f.write("group/" + gp + "\n")
        else:
            for it, path, d in made:
                f.write("#EXTINF:%d,%03d %s\n" % (int(d), it["no"], it["slug"]))
                f.write(os.path.relpath(path, OUT_DIR).replace("\\", "/") + "\n")

    if args.no_single:
        shutil.rmtree(single_dir, ignore_errors=True)
    if not args.keep_tmp:
        shutil.rmtree(TMP_DIR, ignore_errors=True)

    print("\n  완료 — %d문항 · 전체 %s" % (len(made), mmss(total_sec)))
    print("  저장 위치: %s\n" % os.path.abspath(OUT_DIR))


if __name__ == "__main__":
    main()
