#!/usr/bin/env python3
"""
parallel_label.py — Split EPD, run N Stockfish generators in parallel, merge .vdata files.

Usage:
    python3 parallel_label.py \
        --sf    <stockfish_bin>  \
        --gen   <generate_training_data_bin> \
        --epd   <input.epd>      \
        --out   <output.vdata>   \
        --depth 12               \
        --jobs  8
"""

import argparse
import os
import struct
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path


def split_epd(epd_path: str, n_jobs: int, tmp_dir: str) -> list[str]:
    """Split EPD file into n_jobs roughly equal chunks."""
    with open(epd_path) as f:
        lines = [l for l in f if l.strip()]

    total = len(lines)
    chunk = (total + n_jobs - 1) // n_jobs
    paths = []
    for i in range(n_jobs):
        chunk_lines = lines[i * chunk: (i + 1) * chunk]
        if not chunk_lines:
            break
        p = os.path.join(tmp_dir, f"chunk_{i:02d}.epd")
        with open(p, "w") as f:
            f.writelines(chunk_lines)
        paths.append(p)
        print(f"  Chunk {i}: {len(chunk_lines):,} positions → {p}")
    return paths


def run_generator(sf_bin: str, gen_bin: str, epd: str, vdata: str, depth: int, job_id: int,
                  progress: dict, lock: threading.Lock):
    """Run a single generate_training_data process and track progress."""
    cmd = [gen_bin, sf_bin, epd, vdata, str(depth)]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

    count = 0
    for line in proc.stdout:
        line = line.strip()
        if "Processed" in line:
            try:
                count = int(line.split()[1].replace(",", ""))
            except Exception:
                pass
            with lock:
                progress[job_id] = count
        elif "Done" in line or "Exported" in line:
            with lock:
                progress[job_id] = -1  # signal done

    proc.wait()
    with lock:
        progress[job_id] = -1


def merge_vdata(chunk_vdata: list[str], output_path: str):
    """
    Merge multiple .vdata v2 files into one.
    Header: b"VDAT" + version(1) + count(4)
    Records: variable length
    """
    total_count = 0
    HEADER = 9  # 4 magic + 1 version + 4 count

    with open(output_path, "wb") as out:
        # Write placeholder header
        out.write(b"VDAT")
        out.write(struct.pack("<B", 2))       # version
        out.write(struct.pack("<I", 0))        # count placeholder

        for path in chunk_vdata:
            if not os.path.exists(path) or os.path.getsize(path) < HEADER:
                print(f"  Warning: skipping empty/missing chunk: {path}")
                continue

            with open(path, "rb") as f:
                header = f.read(HEADER)
                magic   = header[:4]
                version = header[4]
                count   = struct.unpack_from("<I", header, 5)[0]

                if magic != b"VDAT":
                    print(f"  Warning: bad magic in {path}, skipping")
                    continue
                if version != 2:
                    print(f"  Warning: version {version} in {path}, expected 2, skipping")
                    continue

                # Copy all record data verbatim
                data = f.read()
                out.write(data)
                total_count += count
                print(f"  Merged {path}: {count:,} records")

        # Patch total count
        import io
        out.seek(5)
        out.write(struct.pack("<I", total_count))

    size = os.path.getsize(output_path)
    print(f"\nMerge complete: {total_count:,} total records → {output_path}")
    print(f"  File size: {size / 1024 / 1024:.1f} MB")
    return total_count


def progress_reporter(progress: dict, lock: threading.Lock, n_jobs: int, total_pos: int):
    """Background thread that prints overall progress every 30 seconds."""
    start = time.time()
    while True:
        time.sleep(30)
        with lock:
            done   = sum(1 for v in progress.values() if v == -1)
            counts = {k: v for k, v in progress.items() if v != -1}
            sofar  = sum(counts.values())

        elapsed = time.time() - start
        rate    = sofar / elapsed if elapsed > 0 else 0
        eta     = (total_pos - sofar) / rate if rate > 0 else 0

        print(f"  [{int(elapsed)}s] {sofar:,}/{total_pos:,} positions  "
              f"({done}/{n_jobs} workers done)  "
              f"rate={rate:.1f}/s  ETA={eta/60:.1f}min")

        if done == n_jobs:
            break


def main():
    parser = argparse.ArgumentParser(description="Parallel Stockfish EPD labeller")
    parser.add_argument("--sf",    required=True, help="Stockfish binary")
    parser.add_argument("--gen",   required=True, help="generate_training_data binary")
    parser.add_argument("--epd",   required=True, help="Input EPD file")
    parser.add_argument("--out",   required=True, help="Output .vdata file")
    parser.add_argument("--depth", type=int, default=12)
    parser.add_argument("--jobs",  type=int, default=8)
    args = parser.parse_args()

    print(f"Parallel Stockfish labeller")
    print(f"  EPD:   {args.epd}")
    print(f"  Out:   {args.out}")
    print(f"  Depth: {args.depth}")
    print(f"  Jobs:  {args.jobs}")

    total_pos = sum(1 for _ in open(args.epd) if _.strip())
    print(f"  Total positions: {total_pos:,}")

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="vortex_label_") as tmp:
        # 1. Split
        print(f"\nSplitting into {args.jobs} chunks ...")
        chunks = split_epd(args.epd, args.jobs, tmp)
        n      = len(chunks)

        # 2. Prepare output paths
        vdata_chunks = [os.path.join(tmp, f"chunk_{i:02d}.vdata") for i in range(n)]

        # 3. Launch workers
        print(f"\nLaunching {n} workers at depth {args.depth} ...")
        progress = {i: 0 for i in range(n)}
        lock     = threading.Lock()
        threads  = []

        for i, (epd_chunk, vdata_chunk) in enumerate(zip(chunks, vdata_chunks)):
            t = threading.Thread(
                target=run_generator,
                args=(args.sf, args.gen, epd_chunk, vdata_chunk, args.depth, i, progress, lock),
                daemon=True,
            )
            t.start()
            threads.append(t)

        # 4. Progress reporter
        rep = threading.Thread(
            target=progress_reporter,
            args=(progress, lock, n, total_pos),
            daemon=True,
        )
        rep.start()

        # 5. Wait for all workers
        start = time.time()
        for t in threads:
            t.join()
        elapsed = time.time() - start

        print(f"\nAll workers done in {elapsed/60:.1f} minutes")

        # 6. Merge
        print(f"\nMerging {n} .vdata files ...")
        total = merge_vdata(vdata_chunks, args.out)

    print(f"\n{'='*50}")
    print(f"Done! {total:,} positions labelled in {elapsed/60:.1f} min")
    print(f"Rate: {total/elapsed:.1f} pos/sec")
    print(f"Output: {args.out}")


if __name__ == "__main__":
    main()
