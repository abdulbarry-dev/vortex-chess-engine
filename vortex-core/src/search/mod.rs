pub mod variance;
pub mod swindle;
pub mod id;
pub mod aspiration;

use crate::state::GameState;
use crate::move_core::Move;
use crate::movegen::generate_pseudo_legal_moves;
use crate::evaluate::evaluate;
use crate::tt::{TranspositionTable, TT_EXACT, TT_ALPHA, TT_BETA};
use crate::types::{Color, PieceType, Square};
use crate::board::Board;

const MAX_PLY: i8 = 64;
const INFINITY: i16 = 30000;
const MATE_SCORE: i16 = 29000;
const DRAW_SCORE: i16 = 0;

#[cfg(target_arch = "wasm32")]
pub fn current_time_ms() -> u64 {
    js_sys::Date::now() as u64
}

#[cfg(not(target_arch = "wasm32"))]
pub fn current_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub struct SearchControl {
    pub nodes: u64,
    pub stop: bool,
    pub time_limit_ms: u64,
    pub start_time_ms: u64,
}

impl SearchControl {
    pub fn time_up(&self) -> bool {
        if self.time_limit_ms == 0 { return false; }
        // Optimization: Only cross WASM boundary to JS Date::now() every 2048 nodes
        if self.nodes % 2048 != 0 { return false; }
        current_time_ms() - self.start_time_ms >= self.time_limit_ms
    }
}

use crate::search::swindle::SwindleMode;
use crate::search::variance::VarianceTracker;

fn score_move(m: Move, state: &GameState, tt_move: Move, ply: i8, killers: &[[Move; 2]; MAX_PLY as usize], history: &[[[i32; 64]; 64]; 2], swindle: &SwindleMode, contempt: i16) -> i32 {
    if m == tt_move { return 10_000_000; }

    if m.is_promotion() { return 9_000_000; }

    if m.is_capture() {
        let capture_sq = if m.flag() == crate::move_core::FLAG_EP_CAPTURE {
            if state.side_to_move == Color::White { m.to() - 8 } else { m.to() + 8 }
        } else {
            m.to()
        };
        let them = state.side_to_move.opposite();
        let mut victim_val = 0;
        for pt in [PieceType::Queen, PieceType::Rook, PieceType::Bishop, PieceType::Knight, PieceType::Pawn] {
            if (state.board.get_pieces(them, pt) & (1u64 << capture_sq)) != 0 {
                victim_val = match pt {
                    PieceType::Queen => 50,
                    PieceType::Rook => 40,
                    PieceType::Bishop => 30,
                    PieceType::Knight => 30,
                    PieceType::Pawn => 10,
                    _ => 0,
                };
                break;
            }
        }
        let attacker_val = if (state.board.get_pieces(state.side_to_move, PieceType::Pawn) & (1u64 << m.from())) != 0 { 10 }
            else if (state.board.get_pieces(state.side_to_move, PieceType::Knight) & (1u64 << m.from())) != 0 { 30 }
            else if (state.board.get_pieces(state.side_to_move, PieceType::Bishop) & (1u64 << m.from())) != 0 { 30 }
            else if (state.board.get_pieces(state.side_to_move, PieceType::Rook) & (1u64 << m.from())) != 0 { 40 }
            else if (state.board.get_pieces(state.side_to_move, PieceType::Queen) & (1u64 << m.from())) != 0 { 50 }
            else { 60 };
        
        let mut capture_score = 8_000_000 + victim_val * 100 - attacker_val;
        if contempt < 0 {
            capture_score += 500;
        }
        return capture_score;
    }

    if m == killers[ply as usize][0] || m == killers[ply as usize][1] {
        return 7_000_000;
    }

    let hist = history[state.side_to_move as usize][m.from() as usize][m.to() as usize];
    let mut base_score = hist.min(100_000);

    // Neural Network Policy Head: Prior distribution for move ordering
    let policy_logit = crate::nnue::evaluate_policy_move(state, &state.nnue, m.to_policy_index());
    let policy_bonus = (policy_logit * 5000.0) as i32; // Scale logit to act as a strong history bias
    base_score += policy_bonus;

    swindle.modify_move_ordering(m, base_score, state)
}

#[derive(Clone, Copy)]
pub struct SearchResult {
    pub best_move: Move,
    pub score: i16,
}

pub fn search_root_internal(state: &mut GameState, depth: i8, mut alpha: i16, beta: i16, tt: &mut TranspositionTable, ctrl: &mut SearchControl) -> SearchResult {
    ctrl.nodes = 0;
    tt.new_search();

    let mut best_move = Move(0);
    let mut best_score = -INFINITY;

    let mut killers = [[Move(0); 2]; MAX_PLY as usize];
    let mut history = [[[0i32; 64]; 64]; 2];

    let mut move_list = generate_pseudo_legal_moves(&state.board, state.side_to_move, state.castling_rights, state.en_passant_sq);

    let mut legal_count = 0;
    for i in 0..move_list.count {
        let m = move_list.moves[i];
        let flag = m.flag();
        if flag == crate::move_core::FLAG_KING_CASTLE || flag == crate::move_core::FLAG_QUEEN_CASTLE {
            if is_in_check_color(state, state.side_to_move) { continue; }
            let them = state.side_to_move.opposite();
            let (kingside_sq, queenside_sq) = match state.side_to_move {
                Color::White => (5u8, 3u8),
                Color::Black => (61u8, 59u8),
            };
            let pass_through = if flag == crate::move_core::FLAG_KING_CASTLE { kingside_sq } else { queenside_sq };
            if is_square_attacked_by(&state.board, pass_through, them) { continue; }
        }
        let undo = state.make_move(m);
        let opp = state.side_to_move.opposite();
        let in_check = is_in_check_color(state, opp);
        state.unmake_move(m, &undo);
        if in_check { continue; }
        move_list.moves[legal_count] = m;
        legal_count += 1;
    }
    move_list.count = legal_count;

    if move_list.count == 0 { 
        return SearchResult { best_move: Move(0), score: if is_in_check_color(state, state.side_to_move) { -MATE_SCORE } else { DRAW_SCORE } }; 
    }


    let eval_score = evaluate(state);
    let swindle = SwindleMode::new(eval_score);
    let contempt = crate::contempt::compute_contempt(eval_score);
    let _variance_tracker = VarianceTracker::new();

    let mut move_scores = [0i32; 256];
    for i in 0..move_list.count {
        move_scores[i] = score_move(move_list.moves[i], state, Move(0), 0, &killers, &history, &swindle, contempt);
    }
    for i in 1..move_list.count {
        let mut j = i;
        while j > 0 && move_scores[j] > move_scores[j - 1] {
            move_scores.swap(j, j - 1);
            move_list.moves.swap(j, j - 1);
            j -= 1;
        }
    }

    for i in 0..move_list.count {
        if ctrl.stop || ctrl.time_up() { ctrl.stop = true; break; }

        let m = move_list.moves[i];
        let flag = m.flag();
        if flag == crate::move_core::FLAG_KING_CASTLE || flag == crate::move_core::FLAG_QUEEN_CASTLE {
            if is_in_check_color(state, state.side_to_move) { continue; }
            let them = state.side_to_move.opposite();
            let (kingside_sq, queenside_sq) = match state.side_to_move {
                Color::White => (5u8, 3u8),
                Color::Black => (61u8, 59u8),
            };
            let pass_through = if flag == crate::move_core::FLAG_KING_CASTLE { kingside_sq } else { queenside_sq };
            if is_square_attacked_by(&state.board, pass_through, them) { continue; }
        }
        let undo = state.make_move(m);
        let opp = state.side_to_move.opposite();
        if is_in_check_color(state, opp) {
            state.unmake_move(m, &undo);
            continue;
        }

        if ctrl.stop || ctrl.time_up() { 
            ctrl.stop = true;
            state.unmake_move(m, &undo);
            break; 
        }

        let mut score;
        if i == 0 {
            score = -search_position(state, depth - 1, -beta, -alpha, 1, tt, ctrl, &mut killers, &mut history);
        } else {
            score = -search_position(state, depth - 1, -alpha - 1, -alpha, 1, tt, ctrl, &mut killers, &mut history);
            if score > alpha && score < beta {
                score = -search_position(state, depth - 1, -beta, -alpha, 1, tt, ctrl, &mut killers, &mut history);
            }
        }
        state.unmake_move(m, &undo);

        if ctrl.stop { break; }

        if score > best_score {
            best_score = score;
            best_move = m;
        }

        if score > alpha {
            alpha = score;
        }
    }
    
    // Variance tracker updating omitted for root loop because we return immediately,
    // but in a full iterative deepening framework it tracks across iterations.

    if best_move.0 != 0 {
        tt.store(state.hash, depth, best_score, TT_EXACT, best_move);
    }

    SearchResult {
        best_move,
        score: best_score,
    }
}

pub fn search_position(state: &mut GameState, depth: i8, mut alpha: i16, beta: i16, ply: i8, tt: &mut TranspositionTable, ctrl: &mut SearchControl, killers: &mut [[Move; 2]; MAX_PLY as usize], history: &mut [[[i32; 64]; 64]; 2]) -> i16 {
    if ctrl.stop || ctrl.time_up() {
        ctrl.stop = true;
        return 0;
    }

    ctrl.nodes += 1;

    if ply >= MAX_PLY {
        return evaluate(state);
    }

    let is_draw = state.halfmove_clock >= 100 || is_insufficient_material(&state) || is_repetition(&state);
    if is_draw {
        let eval_score = evaluate(state);
        let contempt = crate::contempt::compute_contempt(eval_score);
        return if contempt >= 0 { 0 } else { contempt };
    }

    if depth <= 0 {
        return quiescence_search(state, alpha, beta, tt, ctrl, killers, history);
    }

    let hash = state.hash;

    let mut tt_move = Move(0);
    if let Some(entry) = tt.probe(hash) {
        let mut score = entry.score;
        if score > MATE_SCORE - 100 {
            score -= ply as i16;
        } else if score < -MATE_SCORE + 100 {
            score += ply as i16;
        }
        if entry.depth >= depth {
            if entry.bound == TT_EXACT { return score; }
            if entry.bound == TT_ALPHA && score <= alpha { return alpha; }
            if entry.bound == TT_BETA && score >= beta { return beta; }
        }
        tt_move = Move(entry.best_move);
    }

    if depth >= 3 && !is_in_check(&state) && has_major_pieces(&state, state.side_to_move) {
        let mut ns = state.clone();
        ns.hash ^= crate::zobrist::get_zobrist().side_to_move_key;
        if let Some(f) = ns.en_passant_sq {
            ns.hash ^= crate::zobrist::get_zobrist().en_passant_keys[(f % 8) as usize];
        }
        ns.side_to_move = ns.side_to_move.opposite();
        ns.en_passant_sq = None;
        let r = if depth > 6 { 3 } else { 2 };
        let null_score = -search_position(&mut ns, depth - 1 - r, -beta, -beta + 1, ply + 1, tt, ctrl, killers, history);
        
        if null_score >= beta { return beta; }
        
        let current_eval = evaluate(state);
        let threat_delta = current_eval - null_score;
        if threat_delta > 200 {
            state.threat_delta = threat_delta;
        } else {
            state.threat_delta = 0;
        }
    }

    let mut move_list = generate_pseudo_legal_moves(&state.board, state.side_to_move, state.castling_rights, state.en_passant_sq);

    let eval_score = evaluate(state);
    let swindle = SwindleMode::new(eval_score);
    let contempt = crate::contempt::compute_contempt(eval_score);
    let mut move_scores = [0i32; 256];
    for i in 0..move_list.count {
        move_scores[i] = score_move(move_list.moves[i], state, tt_move, ply, killers, history, &swindle, contempt);
    }
    for i in 1..move_list.count {
        let mut j = i;
        while j > 0 && move_scores[j] > move_scores[j - 1] {
            move_scores.swap(j, j - 1);
            move_list.moves.swap(j, j - 1);
            j -= 1;
        }
    }

    let in_check = is_in_check(&state);
    let mut best_score = -INFINITY - 1;
    let mut best_move = Move(0);
    let original_alpha = alpha;
    let mut legal_moves = 0;
    let moves_evaluated = move_list.count.min(if in_check { 256 } else { 64 });

    for i in 0..moves_evaluated {
        if ctrl.stop || ctrl.time_up() { ctrl.stop = true; break; }

        let m = move_list.moves[i];

        let flag = m.flag();
        if flag == crate::move_core::FLAG_KING_CASTLE || flag == crate::move_core::FLAG_QUEEN_CASTLE {
            if is_in_check_color(&state, state.side_to_move) { continue; }
            let them = state.side_to_move.opposite();
            let (kingside_sq, queenside_sq) = match state.side_to_move {
                Color::White => (5u8, 3u8),
                Color::Black => (61u8, 59u8),
            };
            let pass_through = if flag == crate::move_core::FLAG_KING_CASTLE { kingside_sq } else { queenside_sq };
            if is_square_attacked_by(&state.board, pass_through, them) { continue; }
        }
        let undo = state.make_move(m);
        let opp = state.side_to_move.opposite();
        if is_in_check_color(state, opp) {
            state.unmake_move(m, &undo);
            continue;
        }

        legal_moves += 1;

        let mut score;
        if legal_moves == 1 {
            score = -search_position(state, depth - 1, -beta, -alpha, ply + 1, tt, ctrl, killers, history);
        } else {
            if !in_check && depth >= 3 && legal_moves > 4 && !m.is_capture() && !m.is_promotion() && m != tt_move {
                let lmr_base = legal_moves.min(64) as f32;
                let reduction = ((lmr_base.ln() / 2.0f32.ln()).round() as i8).min(depth / 2).max(1);
                let reduced = (depth - 1 - reduction).max(0);
                score = -search_position(state, reduced, -alpha - 1, -alpha, ply + 1, tt, ctrl, killers, history);
                if score > alpha {
                    score = -search_position(state, depth - 1, -alpha - 1, -alpha, ply + 1, tt, ctrl, killers, history);
                }
            } else {
                score = -search_position(state, depth - 1, -alpha - 1, -alpha, ply + 1, tt, ctrl, killers, history);
            }

            if score > alpha && score < beta {
                score = -search_position(state, depth - 1, -beta, -alpha, ply + 1, tt, ctrl, killers, history);
            }
        }
        state.unmake_move(m, &undo);

        if ctrl.stop { break; }

        if score > best_score {
            best_score = score;
            best_move = m;
        }

        if score > alpha {
            alpha = score;
        }

        if alpha >= beta {
            if !m.is_capture() {
                killers[ply as usize][1] = killers[ply as usize][0];
                killers[ply as usize][0] = m;
                history[state.side_to_move as usize][m.from() as usize][m.to() as usize] += depth as i32;
            }
            break;
        }
    }

    if legal_moves == 0 {
        if in_check { return -MATE_SCORE + ply as i16; }
        return DRAW_SCORE;
    }

    if ctrl.stop { return 0; }

    let bound = if best_score <= original_alpha { TT_ALPHA }
               else if best_score >= beta { TT_BETA }
               else { TT_EXACT };

    let mut score_to_store = best_score;
    if score_to_store > MATE_SCORE - 100 {
        score_to_store += ply as i16;
    } else if score_to_store < -MATE_SCORE + 100 {
        score_to_store -= ply as i16;
    }
    tt.store(hash, depth, score_to_store, bound, best_move);

    best_score
}

fn is_in_check(state: &GameState) -> bool {
    is_in_check_color(state, state.side_to_move)
}

fn is_in_check_color(state: &GameState, color: Color) -> bool {
    let king_bb = state.board.get_pieces(color, PieceType::King);
    if king_bb == 0 { return false; }
    let king_sq = king_bb.trailing_zeros() as Square;

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

    let pawns = state.board.get_pieces(them, PieceType::Pawn);
    let pawn_attacks = if color == Color::White {
        ((king_bb & !0x0101010101010101) << 7) | ((king_bb & !0x8080808080808080) << 9)
    } else {
        ((king_bb & !0x0101010101010101) >> 9) | ((king_bb & !0x8080808080808080) >> 7)
    };
    if (pawn_attacks & pawns) != 0 { return true; }

    false
}

fn is_square_attacked_by(board: &Board, sq: Square, attacker: Color) -> bool {
    use crate::attacks::{get_knight_attacks, get_king_attacks};
    use crate::magic::{get_rook_attacks, get_bishop_attacks};

    let all = board.occupancies[2];

    if (get_knight_attacks(sq) & board.get_pieces(attacker, PieceType::Knight)) != 0 { return true; }
    if (get_king_attacks(sq) & board.get_pieces(attacker, PieceType::King)) != 0 { return true; }

    let rooks_queens = board.get_pieces(attacker, PieceType::Rook) | board.get_pieces(attacker, PieceType::Queen);
    if (get_rook_attacks(sq, all) & rooks_queens) != 0 { return true; }

    let bishops_queens = board.get_pieces(attacker, PieceType::Bishop) | board.get_pieces(attacker, PieceType::Queen);
    if (get_bishop_attacks(sq, all) & bishops_queens) != 0 { return true; }

    let sq_bb = 1u64 << sq;
    let pawns = board.get_pieces(attacker, PieceType::Pawn);
    let pawn_attacks = if attacker == Color::White {
        ((sq_bb & !0x0101010101010101) >> 9) | ((sq_bb & !0x8080808080808080) >> 7)
    } else {
        ((sq_bb & !0x0101010101010101) << 7) | ((sq_bb & !0x8080808080808080) << 9)
    };
    if (pawn_attacks & pawns) != 0 { return true; }

    false
}

fn is_insufficient_material(state: &GameState) -> bool {
    let w_knights = state.board.get_pieces(Color::White, PieceType::Knight);
    let b_knights = state.board.get_pieces(Color::Black, PieceType::Knight);
    let w_bishops = state.board.get_pieces(Color::White, PieceType::Bishop);
    let b_bishops = state.board.get_pieces(Color::Black, PieceType::Bishop);
    let w_rooks = state.board.get_pieces(Color::White, PieceType::Rook);
    let b_rooks = state.board.get_pieces(Color::Black, PieceType::Rook);
    let w_queens = state.board.get_pieces(Color::White, PieceType::Queen);
    let b_queens = state.board.get_pieces(Color::Black, PieceType::Queen);
    let w_pawns = state.board.get_pieces(Color::White, PieceType::Pawn);
    let b_pawns = state.board.get_pieces(Color::Black, PieceType::Pawn);

    let total_non_kings = (w_knights | b_knights | w_bishops | b_bishops | w_rooks | b_rooks | w_queens | b_queens | w_pawns | b_pawns).count_ones();
    if total_non_kings == 0 { return true; }
    if total_non_kings == 1 {
        if w_bishops.count_ones() == 1 || b_bishops.count_ones() == 1 { return true; }
        if w_knights.count_ones() == 1 || b_knights.count_ones() == 1 { return true; }
    }
    if total_non_kings == 2 && w_bishops.count_ones() == 1 && b_bishops.count_ones() == 1 {
        let w_bb_sq = w_bishops.trailing_zeros() as usize;
        let b_bb_sq = b_bishops.trailing_zeros() as usize;
        if (w_bb_sq % 2) == (b_bb_sq % 2) { return true; }
    }

    false
}

fn is_repetition(state: &GameState) -> bool {
    let history = &state.repetition_history;
    if history.len() < 4 { return false; }

    let current_hash = state.hash;
    let mut count = 0;
    for &h in history.iter().rev() {
        if h == current_hash {
            count += 1;
            if count >= 2 { return true; }
        }
    }
    false
}

fn has_major_pieces(state: &GameState, color: Color) -> bool {
    let pieces = state.board.get_pieces(color, PieceType::Rook) |
                 state.board.get_pieces(color, PieceType::Queen) |
                 state.board.get_pieces(color, PieceType::Knight) |
                 state.board.get_pieces(color, PieceType::Bishop);
    pieces != 0
}

fn quiescence_search(state: &mut GameState, mut alpha: i16, beta: i16, tt: &mut TranspositionTable, ctrl: &mut SearchControl, killers: &mut [[Move; 2]; MAX_PLY as usize], history: &mut [[[i32; 64]; 64]; 2]) -> i16 {
    if ctrl.stop || ctrl.time_up() {
        ctrl.stop = true;
        return 0;
    }

    ctrl.nodes += 1;

    let stand_pat = evaluate(state);
    if stand_pat >= beta { return beta; }
    if alpha < stand_pat { alpha = stand_pat; }

    let mut move_list = generate_pseudo_legal_moves(&state.board, state.side_to_move, state.castling_rights, state.en_passant_sq);

    let swindle = SwindleMode::new(stand_pat);
    let contempt = crate::contempt::compute_contempt(stand_pat);
    let mut move_scores = [0i32; 256];
    for i in 0..move_list.count {
        move_scores[i] = score_move(move_list.moves[i], state, Move(0), 0, killers, history, &swindle, contempt);
    }
    for i in 1..move_list.count {
        let mut j = i;
        while j > 0 && move_scores[j] > move_scores[j - 1] {
            move_scores.swap(j, j - 1);
            move_list.moves.swap(j, j - 1);
            j -= 1;
        }
    }

    for i in 0..move_list.count {
        if ctrl.stop || ctrl.time_up() { ctrl.stop = true; break; }

        let m = move_list.moves[i];
        if !m.is_capture() && !m.is_promotion() { continue; }

        if stand_pat + 1100 < alpha { continue; }

        let flag = m.flag();
        if flag == crate::move_core::FLAG_KING_CASTLE || flag == crate::move_core::FLAG_QUEEN_CASTLE {
            if is_in_check_color(&state, state.side_to_move) { continue; }
            let them = state.side_to_move.opposite();
            let (kingside_sq, queenside_sq) = match state.side_to_move {
                Color::White => (5u8, 3u8),
                Color::Black => (61u8, 59u8),
            };
            let pass_through = if flag == crate::move_core::FLAG_KING_CASTLE { kingside_sq } else { queenside_sq };
            if is_square_attacked_by(&state.board, pass_through, them) { continue; }
        }
        let undo = state.make_move(m);
        let opp = state.side_to_move.opposite();
        if is_in_check_color(state, opp) {
            state.unmake_move(m, &undo);
            continue;
        }

        let score = -quiescence_search(state, -beta, -alpha, tt, ctrl, killers, history);
        state.unmake_move(m, &undo);

        if ctrl.stop { break; }

        if score >= beta { return beta; }
        if score > alpha { alpha = score; }
    }

    alpha
}
