use crate::nnue::accumulator::{PstAccumulator, ThreatAccumulator, ThreatDelta};
//
use crate::nnue::threat_map::get_threat_map;
use crate::types::{Color, PieceType, Square, FT_SIZE, pst_feature_index};

#[derive(Clone)]
pub struct IncrementalNetwork {
    pub pst_stack: Vec<PstAccumulator>,
    pub threat_stack: Vec<ThreatAccumulator>,
    pub index: usize,
}

impl IncrementalNetwork {
    pub fn new() -> Self {
        Self {
            pst_stack: vec![PstAccumulator::new(); 256],
            threat_stack: vec![ThreatAccumulator::new(); 256],
            index: 0,
        }
    }

    pub fn push(&mut self) {
        if self.index + 1 < self.pst_stack.len() {
            self.pst_stack[self.index + 1] = self.pst_stack[self.index];
            self.threat_stack[self.index + 1] = self.threat_stack[self.index];
            self.threat_stack[self.index + 1].clear_deltas();
            self.index += 1;
        }
    }

    pub fn pop(&mut self) {
        if self.index > 0 {
            self.index -= 1;
        }
    }

    pub fn current_pst(&mut self) -> &mut PstAccumulator {
        &mut self.pst_stack[self.index]
    }

    pub fn current_threat(&mut self) -> &mut ThreatAccumulator {
        &mut self.threat_stack[self.index]
    }

    pub fn current_pst_ref(&self) -> &PstAccumulator {
        &self.pst_stack[self.index]
    }

    pub fn current_threat_ref(&self) -> &ThreatAccumulator {
        &self.threat_stack[self.index]
    }

    // -----------------------------------------------------------------------
    // PST Accumulator
    // -----------------------------------------------------------------------

    /// Full refresh of the PST accumulator from scratch.
    /// Called whenever the accumulator is marked stale (e.g. king moves, load).
    /// Iterates every piece on the board, computes the king-bucketed HalfKP feature
    /// index for both White and Black perspectives, and adds the weight row.
    pub fn refresh_pst(&mut self, board: &crate::board::Board) {
        let weights = unsafe { &*crate::nnue::weights::WEIGHTS_PTR };
        if !weights.is_loaded {
            return;
        }

        let pst = &mut self.pst_stack[self.index];

        // Seed both perspectives with the bias vector.
        pst.values[0].copy_from_slice(&weights.pst_biases);
        pst.values[1].copy_from_slice(&weights.pst_biases);

        // King squares for each perspective.
        let w_king_sq = board.get_pieces(Color::White, PieceType::King).trailing_zeros() as Square;
        let b_king_sq = board.get_pieces(Color::Black, PieceType::King).trailing_zeros() as Square;
        // Black perspective uses a vertically-flipped king square.
        let b_king_sq_flip = b_king_sq ^ 56;

        // Accumulate features for every piece (including kings themselves).
        for color in [Color::White, Color::Black] {
            for pt in [
                PieceType::Pawn,
                PieceType::Knight,
                PieceType::Bishop,
                PieceType::Rook,
                PieceType::Queen,
                PieceType::King,
            ] {
                let mut bb = board.get_pieces(color, pt);
                while bb != 0 {
                    let sq = bb.trailing_zeros() as Square;
                    bb &= bb - 1;

                    let sq_flip = sq ^ 56; // flipped for Black perspective

                    // White perspective: friendly = (color == White)
                    let w_idx = pst_feature_index(w_king_sq, color == Color::White, pt, sq);
                    // Black perspective: friendly = (color == Black), square flipped
                    let b_idx = pst_feature_index(b_king_sq_flip, color == Color::Black, pt, sq_flip);

                    // Guard against out-of-bounds (should not happen with correct constants).
                    if w_idx < crate::types::PST_FEATURES && b_idx < crate::types::PST_FEATURES {
                        let w_offset = w_idx * FT_SIZE;
                        let b_offset = b_idx * FT_SIZE;
                        for i in 0..FT_SIZE {
                            pst.values[0][i] = pst.values[0][i]
                                .saturating_add(weights.pst_weights[w_offset + i]);
                            pst.values[1][i] = pst.values[1][i]
                                .saturating_add(weights.pst_weights[b_offset + i]);
                        }
                    }
                }
            }
        }

        pst.accurate[0] = true;
        pst.accurate[1] = true;
    }

    /// Incremental PST update for a single piece moving from→to.
    /// Subtracts the `from` feature and adds the `to` feature for both perspectives.
    /// If the king moves, we mark stale (a full refresh will happen on next eval).
    pub fn update_pst(
        &mut self,
        board: &crate::board::Board,
        pt: PieceType,
        color: Color,
        from: Square,
        to: Square,
    ) {
        if !crate::nnue::serialize::is_vortex_loaded() {
            return;
        }

        // A king move changes the bucket for its side → require full refresh.
        if pt == PieceType::King {
            self.pst_stack[self.index].accurate[0] = false;
            self.pst_stack[self.index].accurate[1] = false;
            return;
        }

        let weights = unsafe { &*crate::nnue::weights::WEIGHTS_PTR };

        let w_king_sq = board.get_pieces(Color::White, PieceType::King).trailing_zeros() as Square;
        let b_king_sq = (board.get_pieces(Color::Black, PieceType::King).trailing_zeros() as Square) ^ 56;

        let pst = &mut self.pst_stack[self.index];

        // Remove old square, add new square — for both perspectives.
        let persp_data: [(Square, Square, bool, bool); 2] = [
            // White perspective: king=w_king_sq, sq not flipped
            (w_king_sq, w_king_sq, color == Color::White, false),
            // Black perspective: king=b_king_sq (flipped), sq flipped
            (b_king_sq, b_king_sq, color == Color::Black, true),
        ];

        for (persp, (king_sq, _, is_friendly, flip)) in persp_data.iter().enumerate() {
            let from_sq = if *flip { from ^ 56 } else { from };
            let to_sq   = if *flip { to ^ 56   } else { to   };

            let from_idx = pst_feature_index(*king_sq, *is_friendly, pt, from_sq);
            let to_idx   = pst_feature_index(*king_sq, *is_friendly, pt, to_sq);

            if from_idx < crate::types::PST_FEATURES && to_idx < crate::types::PST_FEATURES {
                let from_off = from_idx * FT_SIZE;
                let to_off   = to_idx   * FT_SIZE;
                for i in 0..FT_SIZE {
                    pst.values[persp][i] = pst.values[persp][i]
                        .saturating_sub(weights.pst_weights[from_off + i])
                        .saturating_add(weights.pst_weights[to_off   + i]);
                }
            }
        }
        // Incremental update keeps the accumulator accurate.
        pst.accurate[0] = true;
        pst.accurate[1] = true;
    }

    /// Remove a piece from the PST accumulator (used for captures and promotions).
    ///
    /// Subtracts the captured/removed piece's feature row from both perspectives.
    /// Called AFTER the piece has already been removed from the board (so we pass
    /// the piece type and color explicitly rather than re-querying the board).
    pub fn remove_pst(
        &mut self,
        board: &crate::board::Board,
        pt: PieceType,
        color: Color,
        sq: Square,
    ) {
        if !crate::nnue::serialize::is_vortex_loaded() {
            return;
        }
        // King removal is handled by marking stale (shouldn't happen in normal play).
        if pt == PieceType::King {
            self.pst_stack[self.index].accurate[0] = false;
            self.pst_stack[self.index].accurate[1] = false;
            return;
        }

        let weights = unsafe { &*crate::nnue::weights::WEIGHTS_PTR };

        let w_king_sq = board.get_pieces(Color::White, PieceType::King).trailing_zeros() as Square;
        let b_king_sq = (board.get_pieces(Color::Black, PieceType::King).trailing_zeros() as Square) ^ 56;

        let pst = &mut self.pst_stack[self.index];

        // White perspective
        {
            let idx = pst_feature_index(w_king_sq, color == Color::White, pt, sq);
            if idx < crate::types::PST_FEATURES {
                let off = idx * FT_SIZE;
                for i in 0..FT_SIZE {
                    pst.values[0][i] = pst.values[0][i]
                        .saturating_sub(weights.pst_weights[off + i]);
                }
            }
        }
        // Black perspective (flip sq)
        {
            let sq_flip = sq ^ 56;
            let idx = pst_feature_index(b_king_sq, color == Color::Black, pt, sq_flip);
            if idx < crate::types::PST_FEATURES {
                let off = idx * FT_SIZE;
                for i in 0..FT_SIZE {
                    pst.values[1][i] = pst.values[1][i]
                        .saturating_sub(weights.pst_weights[off + i]);
                }
            }
        }
    }


    // -----------------------------------------------------------------------
    // Threat Accumulator
    // -----------------------------------------------------------------------

    /// Compute threat-attack changes for a single piece move (from→to).
    pub fn update_threats(
        &mut self,
        board: &crate::board::Board,
        piece: PieceType,
        color: Color,
        from: Square,
        to: Square,
    ) {
        self.push_threats_on_change(board, color, piece, from, false);
        self.push_threats_on_change(board, color, piece, to, true);
    }

    /// Record ThreatDeltas caused by a piece appearing/disappearing at `sq`.
    pub fn push_threats_on_change(
        &mut self,
        board: &crate::board::Board,
        color: Color,
        piece: PieceType,
        sq: Square,
        add: bool,
    ) {
        // Attacks by `piece` on opposite-colour pieces.
        let attacks = Self::get_attacks(piece, color, sq, 0);
        let mut bb = attacks & board.occupancies[color.opposite() as usize];
        while bb != 0 {
            let to_sq = bb.trailing_zeros() as Square;
            bb &= bb - 1;
            if let Some((_, victim_pt)) = board.piece_at(to_sq) {
                self.push_threat_delta(ThreatDelta::new(piece, sq, victim_pt, to_sq, add));
            }
        }

        // Attacks by enemy pieces that hit `sq` (the piece at sq is the victim).
        let them = color.opposite();
        for pt in [
            PieceType::Pawn,
            PieceType::Knight,
            PieceType::Bishop,
            PieceType::Rook,
            PieceType::Queen,
            PieceType::King,
        ] {
            let mut enemy_bb = board.get_pieces(them, pt);
            while enemy_bb != 0 {
                let e_sq = enemy_bb.trailing_zeros() as Square;
                enemy_bb &= enemy_bb - 1;
                let e_attacks = Self::get_attacks(pt, them, e_sq, 0);
                if (e_attacks & (1u64 << sq)) != 0 {
                    self.push_threat_delta(ThreatDelta::new(pt, e_sq, piece, sq, add));
                }
            }
        }
    }

    fn get_attacks(pt: PieceType, color: Color, sq: Square, all_pieces: u64) -> u64 {
        match pt {
            PieceType::Pawn => {
                let mut bb = 0;
                if color == Color::White {
                    if sq / 8 < 7 {
                        if sq % 8 > 0 { bb |= 1u64 << (sq + 7); }
                        if sq % 8 < 7 { bb |= 1u64 << (sq + 9); }
                    }
                } else {
                    if sq / 8 > 0 {
                        if sq % 8 > 0 { bb |= 1u64 << (sq - 9); }
                        if sq % 8 < 7 { bb |= 1u64 << (sq - 7); }
                    }
                }
                bb
            }
            PieceType::Knight => crate::attacks::get_knight_attacks(sq),
            PieceType::Bishop => crate::magic::get_bishop_attacks(sq, all_pieces),
            PieceType::Rook   => crate::magic::get_rook_attacks(sq, all_pieces),
            PieceType::Queen  => {
                crate::magic::get_bishop_attacks(sq, all_pieces)
                    | crate::magic::get_rook_attacks(sq, all_pieces)
            }
            PieceType::King => crate::attacks::get_king_attacks(sq),
        }
    }

    pub fn push_threat_delta(&mut self, delta: ThreatDelta) {
        let threat = &mut self.threat_stack[self.index];
        threat.push_delta(delta);
        threat.accurate[0] = false;
        threat.accurate[1] = false;
    }

    /// Apply all pending ThreatDeltas to both perspectives of the threat accumulator.
    ///
    /// For each delta the ThreatMap returns a feature index `f` in [0, THREAT_FEATURES).
    /// The corresponding weight row is `threat_weights[f * FT_SIZE .. (f+1) * FT_SIZE]`
    /// — a full FT_SIZE vector — which is added to (or subtracted from) the accumulator.
    ///
    /// Perspective handling:
    ///   - White perspective (persp 0): use squares as recorded.
    ///   - Black perspective (persp 1): flip both `from_sq` and `to_sq` with `^ 56`
    ///     before the ThreatMap lookup so the geometry is mirrored correctly.
    pub fn apply_threat_deltas(&mut self) {
        let weights = unsafe { &*crate::nnue::weights::WEIGHTS_PTR };
        if !weights.is_loaded {
            return;
        }

        let threat = &mut self.threat_stack[self.index];
        if threat.accurate[0] && threat.accurate[1] {
            return;
        }

        let map = get_threat_map();

        for d in 0..threat.delta_len {
            let delta = threat.deltas[d];

            let attacker = match delta.attacker() {
                0 => PieceType::Pawn,
                1 => PieceType::Knight,
                2 => PieceType::Bishop,
                3 => PieceType::Rook,
                4 => PieceType::Queen,
                5 => PieceType::King,
                _ => continue,
            };
            let victim = match delta.victim() {
                0 => PieceType::Pawn,
                1 => PieceType::Knight,
                2 => PieceType::Bishop,
                3 => PieceType::Rook,
                4 => PieceType::Queen,
                5 => PieceType::King,
                _ => continue,
            };

            let from_sq = delta.from_sq();
            let to_sq   = delta.to_sq();
            let add     = delta.is_add();

            for persp in 0..2usize {
                // Flip squares vertically for Black perspective.
                let p_from = if persp == 1 { from_sq ^ 56 } else { from_sq };
                let p_to   = if persp == 1 { to_sq   ^ 56 } else { to_sq   };

                if let Some(feat_idx) = map.get_index(attacker, p_from, victim, p_to) {
                    // Each threat feature occupies a full FT_SIZE row in threat_weights.
                    let row_start = feat_idx * FT_SIZE;
                    let row_end   = row_start + FT_SIZE;

                    if row_end <= weights.threat_weights.len() {
                        for i in 0..FT_SIZE {
                            let w = weights.threat_weights[row_start + i] as i16;
                            threat.values[persp][i] = if add {
                                threat.values[persp][i].saturating_add(w)
                            } else {
                                threat.values[persp][i].saturating_sub(w)
                            };
                        }
                    }
                }
            }
        }

        threat.clear_deltas();
        threat.accurate[0] = true;
        threat.accurate[1] = true;
    }


    pub fn refresh_threats(&mut self, board: &crate::board::Board) {
        let weights = unsafe { &*crate::nnue::weights::WEIGHTS_PTR };
        if !weights.is_loaded {
            return;
        }

        let threat = &mut self.threat_stack[self.index];
        threat.values[0].fill(0);
        threat.values[1].fill(0);

        let map = get_threat_map();

        for atk_color in [Color::White, Color::Black] {
            for atk_pt in [
                PieceType::Pawn,
                PieceType::Knight,
                PieceType::Bishop,
                PieceType::Rook,
                PieceType::Queen,
                PieceType::King,
            ] {
                let mut atk_bb = board.get_pieces(atk_color, atk_pt);
                while atk_bb != 0 {
                    let from_sq = atk_bb.trailing_zeros() as Square;
                    atk_bb &= atk_bb - 1;

                    let vic_color = atk_color.opposite();
                    for vic_pt in [
                        PieceType::Pawn,
                        PieceType::Knight,
                        PieceType::Bishop,
                        PieceType::Rook,
                        PieceType::Queen,
                        PieceType::King,
                    ] {
                        let mut vic_bb = board.get_pieces(vic_color, vic_pt);
                        while vic_bb != 0 {
                            let to_sq = vic_bb.trailing_zeros() as Square;
                            vic_bb &= vic_bb - 1;

                            // White perspective: raw squares
                            if let Some(feat_idx) = map.get_index(atk_pt, from_sq, vic_pt, to_sq) {
                                let row_start = feat_idx * FT_SIZE;
                                let row_end = row_start + FT_SIZE;
                                if row_end <= weights.threat_weights.len() {
                                    for i in 0..FT_SIZE {
                                        let w = weights.threat_weights[row_start + i] as i16;
                                        threat.values[0][i] = threat.values[0][i].saturating_add(w);
                                    }
                                }
                            }

                            // Black perspective: flip both squares
                            if let Some(feat_idx) = map.get_index(atk_pt, from_sq ^ 56, vic_pt, to_sq ^ 56) {
                                let row_start = feat_idx * FT_SIZE;
                                let row_end = row_start + FT_SIZE;
                                if row_end <= weights.threat_weights.len() {
                                    for i in 0..FT_SIZE {
                                        let w = weights.threat_weights[row_start + i] as i16;
                                        threat.values[1][i] = threat.values[1][i].saturating_add(w);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        threat.accurate[0] = true;
        threat.accurate[1] = true;
    }

    /// Make both accumulators accurate before evaluation.
    pub fn ensure_accurate(&mut self, board: &crate::board::Board) {
        // PST: full refresh if stale (covers king moves and cold-start).
        if !self.pst_stack[self.index].accurate[0]
            || !self.pst_stack[self.index].accurate[1]
        {
            self.refresh_pst(board);
        }

        // Threat: apply any pending deltas.
        if !self.threat_stack[self.index].accurate[0]
            || !self.threat_stack[self.index].accurate[1]
        {
            let delta_len = self.threat_stack[self.index].delta_len;
            if delta_len == 0 {
                self.refresh_threats(board);
            } else {
                self.apply_threat_deltas();
            }
        }
    }
}
