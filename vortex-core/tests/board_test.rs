use vortex_core::board::Board;
use vortex_core::types::{Color, PieceType, Square};
use vortex_core::movegen::generate_pseudo_legal_moves;
use vortex_core::magic::init_magics;
use vortex_core::attacks::init_step_attacks;

fn setup_startpos(board: &mut Board) {
    // White
    board.add_piece(Color::White, PieceType::Rook, 0);
    board.add_piece(Color::White, PieceType::Knight, 1);
    board.add_piece(Color::White, PieceType::Bishop, 2);
    board.add_piece(Color::White, PieceType::Queen, 3);
    board.add_piece(Color::White, PieceType::King, 4);
    board.add_piece(Color::White, PieceType::Bishop, 5);
    board.add_piece(Color::White, PieceType::Knight, 6);
    board.add_piece(Color::White, PieceType::Rook, 7);
    for i in 8..16 { board.add_piece(Color::White, PieceType::Pawn, i); }
    
    // Black
    board.add_piece(Color::Black, PieceType::Rook, 56);
    board.add_piece(Color::Black, PieceType::Knight, 57);
    board.add_piece(Color::Black, PieceType::Bishop, 58);
    board.add_piece(Color::Black, PieceType::Queen, 59);
    board.add_piece(Color::Black, PieceType::King, 60);
    board.add_piece(Color::Black, PieceType::Bishop, 61);
    board.add_piece(Color::Black, PieceType::Knight, 62);
    board.add_piece(Color::Black, PieceType::Rook, 63);
    for i in 48..56 { board.add_piece(Color::Black, PieceType::Pawn, i); }
}

#[test]
fn test_board_initialization() {
    let mut board = Board::new();
    setup_startpos(&mut board);
    // Verify white pawns
    assert_eq!(board.get_pieces(Color::White, PieceType::Pawn), 0x000000000000FF00);
    // Verify black king
    assert_eq!(board.get_pieces(Color::Black, PieceType::King), 0x1000000000000000);
}

#[test]
fn test_pseudo_legal_movegen() {
    init_magics();
    init_step_attacks();
    let mut board = Board::new();
    setup_startpos(&mut board);
    let moves = generate_pseudo_legal_moves(&board, Color::White);
    
    // 16 pawn moves (each pawn can move 1 or 2 squares) and 4 knight moves
    assert_eq!(moves.count, 20);
}

#[test]
fn test_piece_addition() {
    let mut board = Board::new();
    // clear e2 pawn
    board.remove_piece(Color::White, PieceType::Pawn, 12);
    assert_eq!(board.get_pieces(Color::White, PieceType::Pawn) & (1 << 12), 0);
    
    // add it back to e4 (28)
    board.add_piece(Color::White, PieceType::Pawn, 28);
    assert_eq!(board.get_pieces(Color::White, PieceType::Pawn) & (1 << 28), 1 << 28);
}
