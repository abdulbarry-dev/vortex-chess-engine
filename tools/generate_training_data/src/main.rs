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

fn write_record(
    w: &mut impl Write,
    hash: u64,
    phase: u8,
    result: i8,
    defensive_bonus: i16,
    stm: u8,
    feature_blob: &[u8],
) -> io::Result<()> {
    w.write_all(&hash.to_le_bytes())?;
    w.write_all(&[phase])?;
    w.write_all(&result.to_le_bytes())?;
    w.write_all(&defensive_bonus.to_le_bytes())?;
    w.write_all(&stm.to_le_bytes())?;
    // Padding to 40 bytes: hash(8) + phase(1) + result(1) + bonus(2) + stm(1) = 13 bytes
    // Wait, the blob len and blob comes after.
    // The spec says padding: 28 bytes. Actually let's just match the old padding structure.
    w.write_all(&[0u8; 27])?; // total 40 bytes fixed size header part
    w.write_all(&(feature_blob.len() as u32).to_le_bytes())?;
    w.write_all(feature_blob)?;
    Ok(())
}

fn main() -> io::Result<()> {
    vortex_core::magic::init_magics();
    vortex_core::attacks::init_step_attacks();
    vortex_core::zobrist::init_zobrist();

    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("Usage: {} <input.epd> <output.vdata>", args[0]);
        std::process::exit(1);
    }

    let input_path = &args[1];
    let output_path = &args[2];

    let in_file   = File::open(input_path)?;
    let reader    = BufReader::new(in_file);
    let out_file  = File::create(output_path)?;
    let mut writer = BufWriter::new(out_file);

    // ── File header ──
    writer.write_all(HEADER_MAGIC)?;
    writer.write_all(&[FILE_VERSION])?;
    let mut count: u32 = 0;
    writer.write_all(&count.to_le_bytes())?; // patched at end

    // ── Process positions ──
    for epd_line in reader.lines() {
        let epd_line = epd_line?;
        let epd_line = epd_line.trim();
        if epd_line.is_empty() || epd_line.starts_with('#') { continue; }

        let fen = epd_line.split(" c9 ").next().unwrap_or(epd_line);
        let result_val: i8 = if epd_line.contains("\"1-0\"")    { 1 }
                             else if epd_line.contains("\"0-1\"") { -1 }
                             else                                  { 0 };

        let state = match parse_fen(fen) {
            Some(s) => s,
            None => { eprintln!("Skipping bad FEN: {}", fen); continue; }
        };

        let phase    = get_game_phase(&state);
        let hash     = state.hash;
        let stm: u8  = state.side_to_move as u8;
        
        let defensive_bonus: i16 = 0; // In the future, parse from EPD

        // Encode feature indices
        let feature_blob = encode_features(&state.board);

        write_record(&mut writer, hash, phase, result_val, defensive_bonus, stm, &feature_blob)?;
        count += 1;

        if count % 1_000 == 0 {
            println!("Processed {} positions...", count);
            writer.flush()?;
        }
    }

    writer.flush()?;

    // Patch record count into header (offset 5, 4 bytes)
    use std::io::{Seek, SeekFrom};
    let mut out = writer.into_inner()?;
    out.seek(SeekFrom::Start(5))?;
    out.write_all(&count.to_le_bytes())?;

    println!("Done — wrote {} positions to {}", count, output_path);
    Ok(())
}
