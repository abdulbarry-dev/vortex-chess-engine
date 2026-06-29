use vortex_core::state::GameState;
use vortex_core::evaluate::evaluate;
use vortex_core::search::{search_position, SearchControl, current_time_ms};
use vortex_core::tt::TranspositionTable;
use vortex_core::zobrist::init_zobrist;
use vortex_core::magic::init_magics;
use vortex_core::attacks::init_step_attacks;
use vortex_core::nnue::init_nnue_empty;
use vortex_core::move_core::Move;
use vortex_core::types::{Color, PieceType};

const MAX_PLY: i8 = 64;

fn setup_startpos(state: &mut GameState) {
    state.board.add_piece(Color::White, PieceType::Rook, 0);
    state.board.add_piece(Color::White, PieceType::Knight, 1);
    state.board.add_piece(Color::White, PieceType::Bishop, 2);
    state.board.add_piece(Color::White, PieceType::Queen, 3);
    state.board.add_piece(Color::White, PieceType::King, 4);
    state.board.add_piece(Color::White, PieceType::Bishop, 5);
    state.board.add_piece(Color::White, PieceType::Knight, 6);
    state.board.add_piece(Color::White, PieceType::Rook, 7);
    for i in 8..16 { state.board.add_piece(Color::White, PieceType::Pawn, i); }

    state.board.add_piece(Color::Black, PieceType::Rook, 56);
    state.board.add_piece(Color::Black, PieceType::Knight, 57);
    state.board.add_piece(Color::Black, PieceType::Bishop, 58);
    state.board.add_piece(Color::Black, PieceType::Queen, 59);
    state.board.add_piece(Color::Black, PieceType::King, 60);
    state.board.add_piece(Color::Black, PieceType::Bishop, 61);
    state.board.add_piece(Color::Black, PieceType::Knight, 62);
    state.board.add_piece(Color::Black, PieceType::Rook, 63);
    for i in 48..56 { state.board.add_piece(Color::Black, PieceType::Pawn, i); }

    state.recompute_hash();
}

#[test]
fn test_evaluate_startpos() {
    init_magics();
    init_step_attacks();
    init_zobrist();
    init_nnue_empty();
    let mut state = GameState::new();
    setup_startpos(&mut state);
    let score = evaluate(&state);
    assert_eq!(score, 0);
}

#[test]
fn test_search_depth_1() {
    init_magics();
    init_step_attacks();
    init_zobrist();
    init_nnue_empty();

    let mut state = GameState::new();
    setup_startpos(&mut state);
    let mut tt = TranspositionTable::new(1);
    let mut ctrl = SearchControl {
        nodes: 0,
        stop: false,
        time_limit_ms: 5000,
        start_time_ms: current_time_ms(),
    };
    let mut killers = [[Move(0); 2]; MAX_PLY as usize];
    let mut history = [[[0i32; 64]; 64]; 2];

    let score = search_position(state, 1, -30000, 30000, 0, &mut tt, &mut ctrl, &mut killers, &mut history);
    
    assert!(ctrl.nodes > 20);
    assert!(score >= -50 && score <= 50);
}

#[test]
fn test_search_depth_4() {
    init_magics();
    init_step_attacks();
    init_zobrist();
    init_nnue_empty();

    // Position after: d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 Ne5 b5 Nxf7 Kxf7 Nxb5 cxb5 a4
    // FEN: r1bq1b1r/ppp1k1pp/5n2/3Pp3/P1p5/8/1P3PPP/RNBQK2R b KQ - 0 9
    let mut state = GameState::new();
    state.board.add_piece(Color::White, PieceType::Rook, 0);
    state.board.add_piece(Color::White, PieceType::Knight, 1);
    state.board.add_piece(Color::White, PieceType::Bishop, 2);
    state.board.add_piece(Color::White, PieceType::Queen, 3);
    state.board.add_piece(Color::White, PieceType::King, 4);
    state.board.add_piece(Color::White, PieceType::Bishop, 5);
    state.board.add_piece(Color::White, PieceType::Rook, 7);
    state.board.add_piece(Color::White, PieceType::Pawn, 8);  // b2
    state.board.add_piece(Color::White, PieceType::Pawn, 12); // e2
    state.board.add_piece(Color::White, PieceType::Pawn, 13); // f2
    state.board.add_piece(Color::White, PieceType::Pawn, 14); // g2
    state.board.add_piece(Color::White, PieceType::Pawn, 15); // h2
    state.board.add_piece(Color::White, PieceType::Pawn, 16); // a4
    state.board.add_piece(Color::White, PieceType::Pawn, 27); // d5
    state.board.add_piece(Color::White, PieceType::Pawn, 36); // e5

    state.board.add_piece(Color::Black, PieceType::Rook, 56);
    state.board.add_piece(Color::Black, PieceType::Rook, 63);
    state.board.add_piece(Color::Black, PieceType::Knight, 57);
    state.board.add_piece(Color::Black, PieceType::Bishop, 58);
    state.board.add_piece(Color::Black, PieceType::Queen, 59);
    state.board.add_piece(Color::Black, PieceType::King, 60);
    state.board.add_piece(Color::Black, PieceType::Bishop, 61);
    state.board.add_piece(Color::Black, PieceType::Knight, 62);
    state.board.add_piece(Color::Black, PieceType::Pawn, 48); // a7
    state.board.add_piece(Color::Black, PieceType::Pawn, 49); // b7
    state.board.add_piece(Color::Black, PieceType::Pawn, 50); // c7
    state.board.add_piece(Color::Black, PieceType::Pawn, 52); // e7
    state.board.add_piece(Color::Black, PieceType::Pawn, 53); // f7
    state.board.add_piece(Color::Black, PieceType::Pawn, 54); // g7
    state.board.add_piece(Color::Black, PieceType::Pawn, 55); // h7
    state.board.add_piece(Color::Black, PieceType::Pawn, 45); // f6
    state.board.add_piece(Color::Black, PieceType::Pawn, 34); // c4
    state.board.add_piece(Color::Black, PieceType::Pawn, 33); // b5

    state.side_to_move = Color::Black;
    state.en_passant_sq = None;
    state.castling_rights = 0x0C; // kq only (no white castling since K moved)
    state.recompute_hash();

    let mut tt = TranspositionTable::new(8);
    let mut ctrl = SearchControl {
        nodes: 0,
        stop: false,
        time_limit_ms: 60000,
        start_time_ms: current_time_ms(),
    };

    for depth in 1..=5 {
        let start = std::time::Instant::now();
        let mut state_copy = state.clone();
        let best = vortex_core::search::search_root(&mut state_copy, depth, &mut tt, &mut ctrl);
        let elapsed = start.elapsed();
        println!("depth {}: best_move={} nodes={} time={:?}", depth, best, ctrl.nodes, elapsed);
        assert!(best != 0, "No move found at depth {}!", depth);
    }
}
