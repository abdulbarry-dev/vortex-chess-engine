import re

with open('vortex-core/src/search/mod.rs', 'r') as f:
    code = f.read()

# 1. search_root_internal changes
code = re.sub(
    r'pub fn search_root_internal\(state: &mut GameState, depth: i8, mut alpha: i16, beta: i16, tt: &mut TranspositionTable, ctrl: &mut SearchControl\) -> SearchResult \{',
    r'pub fn search_root_internal(state: &mut GameState, depth: i8, mut alpha: i16, beta: i16, tt: &mut TranspositionTable, ctrl: &mut SearchControl) -> SearchResult {',
    code
)

# Fix the clone in search_root_internal
old_root_loop = """        let mut next = state.clone();
        next.make_move(m);
        let opp = next.side_to_move.opposite();
        if is_in_check_color(&next, opp) { continue; }"""
new_root_loop = """        let undo = state.make_move(m);
        let opp = state.side_to_move.opposite();
        let in_check = is_in_check_color(state, opp);
        state.unmake_move(m, &undo);
        if in_check { continue; }"""
code = code.replace(old_root_loop, new_root_loop)

# 2. search_position signature
code = code.replace(
    'pub fn search_position(mut state: GameState, depth: i8, mut alpha: i16, beta: i16, ply: i8, tt: &mut TranspositionTable, ctrl: &mut SearchControl, killers: &mut [[Move; 2]; MAX_PLY as usize], history: &mut [[[i32; 64]; 64]; 2]) -> i16 {',
    'pub fn search_position(state: &mut GameState, depth: i8, mut alpha: i16, beta: i16, ply: i8, tt: &mut TranspositionTable, ctrl: &mut SearchControl, killers: &mut [[Move; 2]; MAX_PLY as usize], history: &mut [[[i32; 64]; 64]; 2]) -> i16 {'
)

# Fix null move search_position call (pass `&mut ns`)
code = code.replace(
    '-search_position(ns, depth - 1 - r, -beta, -beta + 1, ply + 1, tt, ctrl, killers, history)',
    '-search_position(&mut ns, depth - 1 - r, -beta, -beta + 1, ply + 1, tt, ctrl, killers, history)'
)

# Replace Vec sort in search_position
old_sort = """    let mut indices: Vec<usize> = (0..move_list.count).collect();
    indices.sort_unstable_by(|&a, &b| {
        let sa = score_move(move_list.moves[a], &state, tt_move, ply, killers, history, &swindle, contempt);
        let sb = score_move(move_list.moves[b], &state, tt_move, ply, killers, history, &swindle, contempt);
        sb.cmp(&sa)
    });
    let mut sorted: [Move; 256] = [Move(0); 256];
    for (i, &idx) in indices.iter().enumerate() {
        sorted[i] = move_list.moves[idx];
    }
    let num_moves = move_list.count;
    move_list.moves = sorted;
    move_list.count = num_moves;"""
new_sort = """    let mut move_scores = [0i32; 256];
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
    }"""
code = code.replace(old_sort, new_sort)

# Replace move loop in search_position
old_move_loop = """        let mut next_state = state.clone();
        next_state.make_move(m);

        let opp = next_state.side_to_move.opposite();
        if is_in_check_color(&next_state, opp) { continue; }

        legal_moves += 1;

        let mut score;
        if legal_moves == 1 {
            score = -search_position(next_state, depth - 1, -beta, -alpha, ply + 1, tt, ctrl, killers, history);
        } else {
            if !in_check && depth >= 3 && legal_moves > 4 && !m.is_capture() && !m.is_promotion() && m != tt_move {
                let lmr_base = legal_moves.min(64) as f32;
                let reduction = (lmr_base.ln() / 2.0f32.ln()).round() as i8;
                let reduced = (depth - 1 - reduction).max(0);
                score = -search_position(next_state.clone(), reduced, -alpha - 1, -alpha, ply + 1, tt, ctrl, killers, history);
                if score > alpha {
                    score = -search_position(next_state.clone(), depth - 1, -alpha - 1, -alpha, ply + 1, tt, ctrl, killers, history);
                }
            } else {
                score = -search_position(next_state.clone(), depth - 1, -alpha - 1, -alpha, ply + 1, tt, ctrl, killers, history);
            }

            if score > alpha && score < beta {
                score = -search_position(next_state, depth - 1, -beta, -alpha, ply + 1, tt, ctrl, killers, history);
            }
        }"""
new_move_loop = """        let undo = state.make_move(m);
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
                let reduction = (lmr_base.ln() / 2.0f32.ln()).round() as i8;
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
        state.unmake_move(m, &undo);"""
code = code.replace(old_move_loop, new_move_loop)


# 3. quiescence_search signature
code = code.replace(
    'fn quiescence_search(mut state: GameState, mut alpha: i16, beta: i16, tt: &mut TranspositionTable, ctrl: &mut SearchControl, killers: &mut [[Move; 2]; MAX_PLY as usize], history: &mut [[[i32; 64]; 64]; 2]) -> i16 {',
    'fn quiescence_search(state: &mut GameState, mut alpha: i16, beta: i16, tt: &mut TranspositionTable, ctrl: &mut SearchControl, killers: &mut [[Move; 2]; MAX_PLY as usize], history: &mut [[[i32; 64]; 64]; 2]) -> i16 {'
)

# quiescence_search calls from search_position
code = code.replace(
    'quiescence_search(state, alpha, beta, tt, ctrl, killers, history)',
    'quiescence_search(state, alpha, beta, tt, ctrl, killers, history)'
)

# Replace Vec sort in quiescence_search
old_q_sort = """    let mut indices: Vec<usize> = (0..move_list.count).collect();
    indices.sort_unstable_by(|&a, &b| {
        let sa = score_move(move_list.moves[a], &state, Move(0), 0, killers, history, &swindle, contempt);
        let sb = score_move(move_list.moves[b], &state, Move(0), 0, killers, history, &swindle, contempt);
        sb.cmp(&sa)
    });
    let mut sorted: [Move; 256] = [Move(0); 256];
    for (i, &idx) in indices.iter().enumerate() {
        sorted[i] = move_list.moves[idx];
    }
    let num_moves = move_list.count;
    move_list.moves = sorted;
    move_list.count = num_moves;"""
new_q_sort = """    let mut move_scores = [0i32; 256];
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
    }"""
code = code.replace(old_q_sort, new_q_sort)

# Replace move loop in quiescence_search
old_q_move_loop = """        let mut next_state = state.clone();
        next_state.make_move(m);

        let opp = next_state.side_to_move.opposite();
        if is_in_check_color(&next_state, opp) { continue; }

        let score = -quiescence_search(next_state, -beta, -alpha, tt, ctrl, killers, history);"""
new_q_move_loop = """        let undo = state.make_move(m);
        let opp = state.side_to_move.opposite();
        if is_in_check_color(state, opp) {
            state.unmake_move(m, &undo);
            continue;
        }

        let score = -quiescence_search(state, -beta, -alpha, tt, ctrl, killers, history);
        state.unmake_move(m, &undo);"""
code = code.replace(old_q_move_loop, new_q_move_loop)

with open('vortex-core/src/search/mod.rs', 'w') as f:
    f.write(code)

