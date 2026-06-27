use vortex_core::state::GameState;
use vortex_core::evaluate::evaluate;
use vortex_core::search::{search_position, SearchControl};
use vortex_core::tt::TranspositionTable;
use vortex_core::zobrist::init_zobrist;
use vortex_core::magic::init_magics;
use vortex_core::attacks::init_step_attacks;
use vortex_core::nnue::init_nnue_empty;

use vortex_core::types::{Color, PieceType, Square};

fn setup_startpos(state: &mut GameState) {
    // White
    state.board.add_piece(Color::White, PieceType::Rook, 0);
    state.board.add_piece(Color::White, PieceType::Knight, 1);
    state.board.add_piece(Color::White, PieceType::Bishop, 2);
    state.board.add_piece(Color::White, PieceType::Queen, 3);
    state.board.add_piece(Color::White, PieceType::King, 4);
    state.board.add_piece(Color::White, PieceType::Bishop, 5);
    state.board.add_piece(Color::White, PieceType::Knight, 6);
    state.board.add_piece(Color::White, PieceType::Rook, 7);
    for i in 8..16 { state.board.add_piece(Color::White, PieceType::Pawn, i); }

    // Black
    state.board.add_piece(Color::Black, PieceType::Rook, 56);
    state.board.add_piece(Color::Black, PieceType::Knight, 57);
    state.board.add_piece(Color::Black, PieceType::Bishop, 58);
    state.board.add_piece(Color::Black, PieceType::Queen, 59);
    state.board.add_piece(Color::Black, PieceType::King, 60);
    state.board.add_piece(Color::Black, PieceType::Bishop, 61);
    state.board.add_piece(Color::Black, PieceType::Knight, 62);
    state.board.add_piece(Color::Black, PieceType::Rook, 63);
    for i in 48..56 { state.board.add_piece(Color::Black, PieceType::Pawn, i); }
}

#[test]
fn test_evaluate_startpos() {
    init_nnue_empty();
    let mut state = GameState::new();
    setup_startpos(&mut state);
    let score = evaluate(&state);
    assert_eq!(score, 0); // Symmetric start position should evaluate to 0
}

#[test]
fn test_search_depth_1() {
    init_magics();
    init_step_attacks();
    init_zobrist();
    init_nnue_empty();

    let mut state = GameState::new();
    setup_startpos(&mut state);
    let mut tt = TranspositionTable::new(1); // 1 MB
    let mut ctrl = SearchControl {
        nodes: 0,
        stop: false,
        time_limit_ms: 5000,
    };

    let score = search_position(state, 1, -30000, 30000, 0, &mut tt, &mut ctrl);
    
    // Depth 1 search should complete and evaluate nodes.
    assert!(ctrl.nodes > 20);
    // Score should be close to 0 for start pos
    assert!(score >= -50 && score <= 50);
}
