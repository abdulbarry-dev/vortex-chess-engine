use crate::state::GameState;
use crate::tt::TranspositionTable;
use crate::search::{SearchControl, SearchResult};
use crate::search::aspiration::search_with_windowing;
use crate::move_core::Move;

const INFINITY: i16 = 30000;
const MATE_SCORE: i16 = 29000;
const MAX_PLY: i8 = 64;

#[derive(serde::Serialize)]
pub struct SearchStats {
    pub best_move: u16,
    pub best_score: i16,
    pub nodes: u64,
    pub volatility: f32,
    pub threat_delta: i16,
    pub contempt: i16,
}

pub fn search_root_id(
    state: &mut GameState,
    max_depth: i8,
    time_limit_ms: u64,
    tt: &mut TranspositionTable,
    ctrl: &mut SearchControl,
) -> SearchStats {
    let mut best_move = Move(0);
    let mut best_score = 0i16;
    let mut prev_score = 0i16;
    let mut volatility = 0.0f32;

    for depth in 1..=max_depth {
        if ctrl.stop || ctrl.time_up() { break; }

        let (alpha, beta) = if depth >= 3 {
            (best_score - 25, best_score + 25)
        } else { (-INFINITY, INFINITY) };

        let result = search_with_windowing(state, depth, alpha, beta, tt, ctrl);

        if depth >= 2 {
            let delta = (result.score as i32 - prev_score as i32).abs() as f32;
            volatility = volatility * 0.7 + delta * 0.3;
            prev_score = result.score;
        }

        if result.score > -MATE_SCORE + MAX_PLY as i16 {
            best_move = result.best_move;
            best_score = result.score;
        } else {
            best_move = result.best_move;
            best_score = result.score;
        }
    }

    SearchStats {
        best_move: best_move.0,
        best_score,
        nodes: ctrl.nodes,
        volatility,
        threat_delta: state.threat_delta,
        contempt: crate::contempt::compute_contempt(best_score),
    }
}
