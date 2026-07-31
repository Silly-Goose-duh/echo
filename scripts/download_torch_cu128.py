#!/usr/bin/env python3
"""Resumable exclusive download of torch cu128 wheel. Single-writer."""
from __future__ import annotations

import os
import sys
import time
import zipfile
from pathlib import Path

try:
    import urllib.request
except ImportError:
    import urllib.request  # type: ignore

URL = "https://download.pytorch.org/whl/cu128/torch-2.11.0%2Bcu128-cp311-cp311-win_amd64.whl"
OUT = Path(__file__).resolve().parents[1] / ".wheels" / "torch-2.11.0+cu128-cp311-cp311-win_amd64.whl"
LOCK = OUT.with_suffix(OUT.suffix + ".lock")
EXPECTED_MIN = 2_600_000_000  # ~2.6GB


def acquire_lock() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # exclusive create
    flags = os.O_CREAT | os.O_EXCL | os.O_RDWR
    try:
        fd = os.open(str(LOCK), flags)
        os.write(fd, f"pid={os.getpid()} t={time.time()}\n".encode())
        return fd
    except FileExistsError:
        # stale lock > 2h?
        age = time.time() - LOCK.stat().st_mtime
        if age > 7200:
            LOCK.unlink(missing_ok=True)
            return acquire_lock()
        print(f"LOCK_HELD age_s={age:.0f} path={LOCK}")
        sys.exit(3)


def release_lock(fd: int) -> None:
    try:
        os.close(fd)
    finally:
        LOCK.unlink(missing_ok=True)


def download() -> None:
    fd = acquire_lock()
    try:
        existing = OUT.stat().st_size if OUT.exists() else 0
        print(f"resume_from={existing}")
        req = urllib.request.Request(URL)
        if existing > 0:
            req.add_header("Range", f"bytes={existing}-")
        t0 = time.time()
        last = 0.0
        with urllib.request.urlopen(req, timeout=120) as resp:
            # 206 partial or 200 full
            code = getattr(resp, "status", None) or resp.getcode()
            print(f"http={code}")
            mode = "ab" if code == 206 else "wb"
            if code == 200 and existing > 0:
                print("server ignored range; restarting full download")
                existing = 0
            written = existing
            with open(OUT, mode) as f:
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    written += len(chunk)
                    now = time.time()
                    if now - last >= 5:
                        last = now
                        mb = written / 1024 / 1024
                        speed = (written - existing) / max(now - t0, 1) / 1024 / 1024
                        print(f"{mb:.1f} MB (+{speed:.2f} MB/s)", flush=True)
        size = OUT.stat().st_size
        print(f"DONE size={size}")
        if size < EXPECTED_MIN:
            print("FAIL too small")
            sys.exit(2)
        print("verifying zip...")
        z = zipfile.ZipFile(OUT)
        bad = z.testzip()
        print(f"zip_ok={bad is None} bad={bad} nfiles={len(z.namelist())}")
        if bad is not None:
            sys.exit(2)
        print("VERIFY_PASS")
    finally:
        release_lock(fd)


if __name__ == "__main__":
    download()
