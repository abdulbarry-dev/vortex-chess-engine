with open('vortex-core/src/search/mod.rs', 'r') as f:
    code = f.read()

old_root_search = """        let mut next_state = state.clone();
        next_state.make_move(m);

        let opp = next_state.side_to_move.opposite();
        if is_in_check_color(&next_state, opp) { continue; }

        if ctrl.stop || ctrl.time_up() { break; }

        let mut score;
        if i == 0 {
            score = -search_position(next_state, depth - 1, -beta, -alpha, 1, tt, ctrl, &mut killers, &mut history);
        } else {
            score = -search_position(next_state, depth - 1, -alpha - 1, -alpha, 1, tt, ctrl, &mut killers, &mut history);
            if score > alpha && score < beta {
                let mut re_state = state.clone();
                re_state.make_move(m);
                let opp2 = re_state.side_to_move.opposite();
                if !is_in_check_color(&re_state, opp2) {
                    let new_score = -search_position(re_state, depth - 1, -beta, -alpha, 1, tt, ctrl, &mut killers, &mut history);
                    score = new_score;
                }
            }
        }"""
new_root_search = """        let undo = state.make_move(m);
        let opp = state.side_to_move.opposite();
        if is_in_check_color(state, opp) {
            state.unmake_move(m, &undo);
            continue;
        }

        if ctrl.stop || ctrl.time_up() { 
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
        state.unmake_move(m, &undo);"""
code = code.replace(old_root_search, new_root_search)

# Fix evaluate(&mut state) to evaluate(state)
code = code.replace('evaluate(&mut state)', 'evaluate(state)')

# Fix sorted_indices in search_root_internal
old_root_sort = """    let mut sorted_indices: Vec<usize> = (0..move_list.count).collect();
    sorted_indices.sort_unstable_by(|&a, &b| {
        let sa = score_move(move_list.moves[a], state, Move(0), 0, &killers, &history, &swindle, contempt);
        let sb = score_move(move_list.moves[b], state, Move(0), 0, &killers, &history, &swindle, contempt);
        sb.cmp(&sa)
    });
    let mut sorted_moves: [Move; 256] = [Move(0); 256];
    for (i, &idx) in sorted_indices.iter().enumerate() {
        sorted_moves[i] = move_list.moves[idx];
    }
    move_list.moves = sorted_moves;"""
new_root_sort = """    let mut move_scores = [0i32; 256];
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
    }"""
code = code.replace(old_root_sort, new_root_sort)

with open('vortex-core/src/search/mod.rs', 'w') as f:
    f.write(code)
