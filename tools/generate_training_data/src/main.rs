use std::fs::File;
use std::io::{self, BufRead, BufReader, Write, BufWriter};
use std::process::{Command, Stdio};
use regex::Regex;
use vortex_core::fen::parse_fen;

fn get_game_phase(state: &vortex_core::state::GameState) -> u8 {
    use vortex_core::types::{Color, PieceType};
    let mut phase = 0;
    for c in [Color::White, Color::Black] {
        phase += state.board.get_pieces(c, PieceType::Knight).count_ones() * 1;
        phase += state.board.get_pieces(c, PieceType::Bishop).count_ones() * 1;
        phase += state.board.get_pieces(c, PieceType::Rook).count_ones() * 2;
        phase += state.board.get_pieces(c, PieceType::Queen).count_ones() * 4;
    }
    // Max phase is 24 (4*1 + 4*1 + 4*2 + 2*4)
    // Scale 0..24 to 0..15
    ((phase * 15) / 24).min(15) as u8
}

fn main() -> io::Result<()> {
    vortex_core::magic::init_magics();
    vortex_core::attacks::init_step_attacks();
    vortex_core::zobrist::init_zobrist();
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 4 {
        eprintln!("Usage: {} <stockfish_path> <input.epd> <output.vdata>", args[0]);
        std::process::exit(1);
    }
    
    let sf_path = &args[1];
    let input_path = &args[2];
    let output_path = &args[3];
    
    let mut sf_child = Command::new(sf_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("Failed to spawn Stockfish");
        
    let mut sf_stdin = sf_child.stdin.take().expect("Failed to open stdin");
    let sf_stdout = sf_child.stdout.take().expect("Failed to open stdout");
    let mut sf_reader = BufReader::new(sf_stdout);
    
    writeln!(sf_stdin, "uci")?;
    writeln!(sf_stdin, "setoption name Threads value 1")?;
    writeln!(sf_stdin, "setoption name Hash value 16")?;
    writeln!(sf_stdin, "isready")?;
    
    let mut line = String::new();
    loop {
        line.clear();
        sf_reader.read_line(&mut line)?;
        if line.contains("readyok") {
            break;
        }
    }
    
    let file = File::open(input_path)?;
    let reader = BufReader::new(file);
    
    let out_file = File::create(output_path)?;
    let mut writer = BufWriter::new(out_file);
    
    // Write VDAT header
    writer.write_all(b"VDAT")?;
    writer.write_all(&[1])?; // version
    
    let mut count: u32 = 0;
    // We will patch the count later
    writer.write_all(&count.to_le_bytes())?;
    
    let score_re = Regex::new(r"score cp (-?\d+)").unwrap();
    let mate_re = Regex::new(r"score mate (-?\d+)").unwrap();
    
    for epd_line in reader.lines() {
        let epd_line = epd_line?;
        if epd_line.trim().is_empty() { continue; }
        
        let fen = epd_line.split(" c9 ").next().unwrap_or(&epd_line);
        let mut result_val = 0u8; // draw
        if epd_line.contains("\"1-0\"") { result_val = 1; }
        if epd_line.contains("\"0-1\"") { result_val = 2; }
        if epd_line.contains("\"1/2-1/2\"") { result_val = 0; }
        
        let state = match parse_fen(fen) {
            Some(s) => s,
            None => { eprintln!("Failed to parse fen: {}", fen); continue; }
        };
        
        writeln!(sf_stdin, "position fen {}", fen)?;
        writeln!(sf_stdin, "go depth 18")?;
        
        let mut final_score = 0i16;
        
        loop {
            line.clear();
            sf_reader.read_line(&mut line)?;
            if line.contains("bestmove") {
                break;
            }
            if line.contains("info depth 18 ") || line.contains("info depth 19 ") {
                if let Some(caps) = score_re.captures(&line) {
                    final_score = caps.get(1).unwrap().as_str().parse().unwrap_or(0);
                } else if let Some(caps) = mate_re.captures(&line) {
                    let mate_in = caps.get(1).unwrap().as_str().parse::<i16>().unwrap_or(0);
                    if mate_in > 0 {
                        final_score = 30000 - mate_in;
                    } else {
                        final_score = -30000 - mate_in;
                    }
                }
            }
        }
        
        let phase = get_game_phase(&state);
        let hash = state.hash;
        
        // Output format:
        // zobrist_hash: u64
        // stockfish_score: i16
        // game_phase: u8
        // game_result: u8
        // padding: 12 bytes
        
        writer.write_all(&hash.to_le_bytes())?;
        writer.write_all(&final_score.to_le_bytes())?;
        writer.write_all(&[phase])?;
        writer.write_all(&[result_val])?;
        writer.write_all(&[0u8; 28])?;
        
        count += 1;
        if count % 100 == 0 {
            println!("Processed {} positions...", count);
        }
    }
    
    writeln!(sf_stdin, "quit")?;
    let _ = sf_child.wait();
    
    writer.flush()?;
    
    // Patch header count
    use std::io::Seek;
    use std::io::SeekFrom;
    let mut out_file = writer.into_inner()?;
    out_file.seek(SeekFrom::Start(5))?;
    out_file.write_all(&count.to_le_bytes())?;
    
    println!("Exported {} positions to {}", count, output_path);
    Ok(())
}
