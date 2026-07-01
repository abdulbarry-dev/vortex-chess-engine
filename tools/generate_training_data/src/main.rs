use std::fs::File;
use std::io::{self, BufRead, BufReader, Write, BufWriter};
use std::process::{Command, Stdio};
use vortex_core::fen::parse_fen;
use vortex_core::nnue::features::encode_features;

// ---------------------------------------------------------------------------
// Game-phase bucket (must match forward.rs::game_phase exactly)
// ---------------------------------------------------------------------------
fn get_game_phase(state: &vortex_core::state::GameState) -> u8 {
    use vortex_core::types::{Color, PieceType};
    // Opening material total: 2×(Q900 + 2×R500 + 2×B330 + 2×N330) ≈ 7800
    // Simplified count that matches forward.rs:
    //   Knight/Bishop = 330, Rook = 500, Queen = 900 → opening = 7820
    let opening_material: u32 = 2 * (2 * 500 + 2 * 330 + 2 * 330 + 900);
    let mut material: u32 = 0;
    for c in [Color::White, Color::Black] {
        material += state.board.get_pieces(c, PieceType::Knight).count_ones() * 330;
        material += state.board.get_pieces(c, PieceType::Bishop).count_ones() * 330;
        material += state.board.get_pieces(c, PieceType::Rook).count_ones()   * 500;
        material += state.board.get_pieces(c, PieceType::Queen).count_ones()  * 900;
    }
    let phase_f = (material as f32 / opening_material as f32).min(1.0);
    ((phase_f * 15.0) as u8).min(15)
}

// ---------------------------------------------------------------------------
// .vdata binary record layout (plan §3.1)
//
// File header:
//   [0..4]   "VDAT"
//   [4]      version u8 = 2
//   [5..9]   record_count u32-LE  (patched at end)
//
// Per-record:
//   [0..8]   zobrist_hash     u64-LE
//   [8..10]  stockfish_score  i16-LE  (centipawns, clamped ±29000)
//   [10]     game_phase       u8      (0..15 matching NUM_PHASE_BUCKETS-1)
//   [11]     game_result      u8      (0=draw, 1=white wins, 2=black wins)
//   [12..14] side_to_move     u8      (0=white, 1=black)
//   [13..N]  feature_blob     (encode_features output — variable length)
//   [N..N+4] blob_len         u32-LE  (byte length of feature_blob, written BEFORE blob
//                                       so reader can skip unknown positions)
//
// Actual on-disk order per record:
//   hash(8) | score(2) | phase(1) | result(1) | stm(1) | blob_len(4) | blob(blob_len)
// ---------------------------------------------------------------------------

const HEADER_MAGIC: &[u8] = b"VDAT";
const FILE_VERSION: u8 = 2;
const SCORE_CLAMP: i16 = 29_000;

fn write_record(
    w: &mut impl Write,
    hash: u64,
    score: i16,
    phase: u8,
    result: u8,
    stm: u8,
    feature_blob: &[u8],
) -> io::Result<()> {
    w.write_all(&hash.to_le_bytes())?;
    w.write_all(&score.to_le_bytes())?;
    w.write_all(&[phase, result, stm])?;
    w.write_all(&(feature_blob.len() as u32).to_le_bytes())?;
    w.write_all(feature_blob)?;
    Ok(())
}

fn main() -> io::Result<()> {
    vortex_core::magic::init_magics();
    vortex_core::attacks::init_step_attacks();
    vortex_core::zobrist::init_zobrist();

    let args: Vec<String> = std::env::args().collect();
    if args.len() < 4 {
        eprintln!("Usage: {} <stockfish_path> <input.epd> <output.vdata> [depth=18]", args[0]);
        eprintln!();
        eprintln!("  input.epd  — one FEN per line, optionally followed by");
        eprintln!("               \" c9 \\\"<result>\\\"\" (Lichess EPD format).");
        std::process::exit(1);
    }

    let sf_path    = &args[1];
    let input_path = &args[2];
    let output_path = &args[3];
    let depth: u8 = args.get(4).and_then(|s| s.parse().ok()).unwrap_or(18);

    // ── Spawn Stockfish ──
    let mut sf_child = Command::new(sf_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("Failed to spawn Stockfish — check the path");

    let mut sf_stdin = sf_child.stdin.take().unwrap();
    let sf_stdout    = sf_child.stdout.take().unwrap();
    let mut sf_reader = BufReader::new(sf_stdout);

    writeln!(sf_stdin, "uci")?;
    writeln!(sf_stdin, "setoption name Threads value 1")?;
    writeln!(sf_stdin, "setoption name Hash value 16")?;
    writeln!(sf_stdin, "isready")?;

    // Wait for readyok
    let mut line = String::new();
    loop {
        line.clear();
        sf_reader.read_line(&mut line)?;
        if line.contains("readyok") { break; }
    }

    let in_file   = File::open(input_path)?;
    let reader    = BufReader::new(in_file);
    let out_file  = File::create(output_path)?;
    let mut writer = BufWriter::new(out_file);

    // ── File header ──
    writer.write_all(HEADER_MAGIC)?;
    writer.write_all(&[FILE_VERSION])?;
    let mut count: u32 = 0;
    writer.write_all(&count.to_le_bytes())?; // patched at end

    // Precompile score patterns without `regex` crate
    let parse_score = |line: &str| -> Option<i16> {
        if let Some(pos) = line.find("score cp ") {
            let rest = &line[pos + 9..];
            let end  = rest.find(' ').unwrap_or(rest.len());
            rest[..end].parse::<i16>().ok()
        } else if let Some(pos) = line.find("score mate ") {
            let rest = &line[pos + 11..];
            let end  = rest.find(' ').unwrap_or(rest.len());
            let m = rest[..end].parse::<i16>().ok()?;
            Some(if m > 0 { SCORE_CLAMP } else { -SCORE_CLAMP })
        } else {
            None
        }
    };

    // ── Process positions ──
    for epd_line in reader.lines() {
        let epd_line = epd_line?;
        let epd_line = epd_line.trim();
        if epd_line.is_empty() || epd_line.starts_with('#') { continue; }

        // Lichess EPD: "fen c9 \"result\""
        let fen = epd_line.split(" c9 ").next().unwrap_or(epd_line);
        let result_val: u8 = if epd_line.contains("\"1-0\"")    { 1 }
                             else if epd_line.contains("\"0-1\"") { 2 }
                             else                                  { 0 };

        let state = match parse_fen(fen) {
            Some(s) => s,
            None => { eprintln!("Skipping bad FEN: {}", fen); continue; }
        };

        // Ask Stockfish for eval
        writeln!(sf_stdin, "position fen {}", fen)?;
        writeln!(sf_stdin, "go depth {}", depth)?;

        let mut final_score: i16 = 0;
        // Capture the last info line at target depth (or deepest seen).
        let depth_prefix = format!("info depth {} ", depth);
        let next_prefix  = format!("info depth {} ", depth + 1);

        loop {
            line.clear();
            sf_reader.read_line(&mut line)?;
            if line.contains("bestmove") { break; }
            if line.starts_with(&depth_prefix) || line.starts_with(&next_prefix) {
                if let Some(s) = parse_score(&line) {
                    final_score = s;
                }
            }
        }

        // Clamp and flip to STM perspective
        let stm_score = match state.side_to_move {
            vortex_core::types::Color::White => final_score,
            vortex_core::types::Color::Black => -final_score,
        }.clamp(-SCORE_CLAMP, SCORE_CLAMP);

        let phase    = get_game_phase(&state);
        let hash     = state.hash;
        let stm: u8  = state.side_to_move as u8;

        // Encode feature indices (the Python bridge data)
        let feature_blob = encode_features(&state.board);

        write_record(&mut writer, hash, stm_score, phase, result_val, stm, &feature_blob)?;
        count += 1;

        if count % 1_000 == 0 {
            println!("Processed {} positions...", count);
            writer.flush()?;
        }
    }

    writeln!(sf_stdin, "quit")?;
    let _ = sf_child.wait();
    writer.flush()?;

    // Patch record count into header (offset 5, 4 bytes)
    use std::io::{Seek, SeekFrom};
    let mut out = writer.into_inner()?;
    out.seek(SeekFrom::Start(5))?;
    out.write_all(&count.to_le_bytes())?;

    println!("Done — wrote {} positions to {}", count, output_path);
    Ok(())
}
