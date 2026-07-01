use crate::state::GameState;
use crate::tt::TranspositionTable;
use crate::search::{SearchControl, SearchResult, search_root_internal};

const ASPIRATION_WINDOW: i16 = 25;
const INFINITY: i16 = 30000;

pub fn search_with_windowing(
    state: &mut GameState,
    depth: i8,
    mut alpha: i16,
    mut beta: i16,
    tt: &mut TranspositionTable,
    ctrl: &mut SearchControl,
) -> SearchResult {
    let mut delta = ASPIRATION_WINDOW;

    loop {
        let result = search_root_internal(state, depth, alpha, beta, tt, ctrl);

        if result.score <= alpha {
            // Fail-low: widen downward
            if alpha == -INFINITY { return result; }
            alpha = (alpha - delta).max(-INFINITY);
            delta = delta.saturating_mul(2);
        } else if result.score >= beta {
            // Fail-high: widen upward
            if beta == INFINITY { return result; }
            beta = (beta + delta).min(INFINITY);
            delta = delta.saturating_mul(2);
        } else {
            return result;
        }

        if ctrl.stop || ctrl.time_up() { 
            ctrl.stop = true;
            return result; 
        }
    }
}
