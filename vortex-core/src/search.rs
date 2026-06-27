use crate::state::GameState;
use crate::move_core::Move;
use crate::movegen::generate_pseudo_legal_moves;
use crate::evaluate::evaluate;
use crate::zobrist::get_zobrist;
use crate::tt::{TranspositionTable, TT_EXACT, TT_ALPHA, TT_BETA};

pub struct SearchControl {
    pub nodes: u64,
    pub stop: bool,
    pub time_limit_ms: u64,
    // Add timer start time here if we had access to WASM time easily, 
    // but typically we'll poll an atomic flag set by JS or use a simple node counter for now.
}

// Basic Negamax Alpha-Beta with NMP and LMR
pub fn search_position(mut state: GameState, depth: i8, mut alpha: i16, beta: i16, ply: i8, tt: &mut TranspositionTable, ctrl: &mut SearchControl) -> i16 {
    if ctrl.stop || ctrl.nodes > 1_000_000 {
        return 0; // abort
    }
    
    ctrl.nodes += 1;

    if depth <= 0 {
        return quiescence_search(state, alpha, beta, tt, ctrl);
    }

    let hash = get_zobrist().compute_hash(&state.board, state.side_to_move, state.castling_rights, state.en_passant_sq);
    
    if let Some(entry) = tt.probe(hash) {
        if entry.depth >= depth {
            if entry.bound == TT_EXACT {
                return entry.score;
            }
            if entry.bound == TT_ALPHA && entry.score <= alpha {
                return alpha;
            }
            if entry.bound == TT_BETA && entry.score >= beta {
                return beta;
            }
        }
    }

    // Null Move Pruning (NMP)
    // We only do NMP if depth >= 3, not in check, and not just after another null move.
    // We also need Zugzwang detection (don't NMP if we only have pawns and king).
    if depth >= 3 && !is_in_check(&state) {
        let mut null_state = state.clone();
        null_state.side_to_move = null_state.side_to_move.opposite();
        null_state.en_passant_sq = None;
        // Search with reduced depth (R=2 or R=3)
        let r = if depth > 6 { 3 } else { 2 };
        let null_score = -search_position(null_state, depth - 1 - r, -beta, -beta + 1, ply + 1, tt, ctrl);
        if null_score >= beta {
            return beta;
        }
    }

    let move_list = generate_pseudo_legal_moves(&state.board, state.side_to_move);
    let mut best_score = -30000;
    let mut best_move = Move(0);
    let original_alpha = alpha;
    
    let mut legal_moves = 0;

    for i in 0..move_list.count {
        let m = move_list.moves[i];
        
        let mut next_state = state.clone();
        next_state.make_move(m);

        // Filter illegal moves (if our king is in check after the move)
        // Note: is_in_check for the side that JUST moved!
        let opp = next_state.side_to_move.opposite(); // which is 'us'
        if is_in_check_color(&next_state, opp) {
            continue; 
        }

        legal_moves += 1;

        // Late Move Reductions (LMR)
        let mut score = 0;
        let mut needs_full_search = true;
        
        if depth >= 3 && legal_moves > 4 && !m.is_capture() && !m.is_promotion() && !is_in_check(&next_state) {
            let reduced_depth = depth - 2;
            score = -search_position(next_state.clone(), reduced_depth, -alpha - 1, -alpha, ply + 1, tt, ctrl);
            needs_full_search = score > alpha;
        }

        if needs_full_search {
            score = -search_position(next_state, depth - 1, -beta, -alpha, ply + 1, tt, ctrl);
        }

        if score > best_score {
            best_score = score;
            best_move = m;
        }
        
        if score > alpha {
            alpha = score;
        }

        if alpha >= beta {
            break; // Beta cutoff
        }
    }

    if legal_moves == 0 {
        if is_in_check(&state) {
            return -29000 + ply as i16; // Checkmate
        } else {
            return 0; // Stalemate
        }
    }

    // Store to TT
    let bound = if best_score <= original_alpha {
        TT_ALPHA
    } else if best_score >= beta {
        TT_BETA
    } else {
        TT_EXACT
    };

    tt.store(hash, depth, best_score, bound, best_move);

    best_score
}

fn is_in_check(state: &GameState) -> bool {
    is_in_check_color(state, state.side_to_move)
}

fn is_in_check_color(state: &GameState, color: crate::types::Color) -> bool {
    use crate::types::PieceType;
    let king_bb = state.board.get_pieces(color, PieceType::King);
    if king_bb == 0 { return false; } // Should not happen in real chess
    let king_sq = king_bb.trailing_zeros() as crate::types::Square;
    
    // Check if any enemy piece attacks king_sq
    // A trick is to pretend we have pieces of all types on king_sq and see if they attack enemy pieces
    use crate::attacks::{get_knight_attacks, get_king_attacks};
    use crate::magic::{get_rook_attacks, get_bishop_attacks};
    let them = color.opposite();
    let all = state.board.occupancies[2];

    if (get_knight_attacks(king_sq) & state.board.get_pieces(them, PieceType::Knight)) != 0 { return true; }
    if (get_king_attacks(king_sq) & state.board.get_pieces(them, PieceType::King)) != 0 { return true; }
    
    let rooks_queens = state.board.get_pieces(them, PieceType::Rook) | state.board.get_pieces(them, PieceType::Queen);
    if (get_rook_attacks(king_sq, all) & rooks_queens) != 0 { return true; }

    let bishops_queens = state.board.get_pieces(them, PieceType::Bishop) | state.board.get_pieces(them, PieceType::Queen);
    if (get_bishop_attacks(king_sq, all) & bishops_queens) != 0 { return true; }

    // Pawns
    let pawns = state.board.get_pieces(them, PieceType::Pawn);
    let pawn_attacks = if color == crate::types::Color::White {
        // Black pawns attacking white king
        ((king_bb << 7) & !0x0101010101010101) | ((king_bb << 9) & !0x8080808080808080)
    } else {
        ((king_bb >> 9) & !0x0101010101010101) | ((king_bb >> 7) & !0x8080808080808080)
    };
    if (pawn_attacks & pawns) != 0 { return true; }

    false
}

pub fn quiescence_search(state: GameState, mut alpha: i16, beta: i16, tt: &mut TranspositionTable, ctrl: &mut SearchControl) -> i16 {
    if ctrl.stop || ctrl.nodes > 2_000_000 {
        return 0;
    }
    
    ctrl.nodes += 1;
    
    let stand_pat = evaluate(&state);
    if stand_pat >= beta {
        return beta;
    }
    
    if alpha < stand_pat {
        alpha = stand_pat;
    }
    
    let move_list = generate_pseudo_legal_moves(&state.board, state.side_to_move);
    
    for i in 0..move_list.count {
        let m = move_list.moves[i];
        
        // Only consider captures in QS
        if !m.is_capture() && !m.is_promotion() {
            continue;
        }
        
        let mut next_state = state.clone();
        next_state.make_move(m);
        
        // Filter illegal moves
        let opp = next_state.side_to_move.opposite();
        if is_in_check_color(&next_state, opp) {
            continue; 
        }
        
        let score = -quiescence_search(next_state, -beta, -alpha, tt, ctrl);
        
        if score >= beta {
            return beta;
        }
        
        if score > alpha {
            alpha = score;
        }
    }
    
    alpha
}
