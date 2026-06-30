pub mod types;
pub mod bitboard;
pub mod board;
pub mod magic;
pub mod attacks;
pub mod move_core;
pub mod movegen;
pub mod zobrist;
pub mod contempt;
pub mod tt;
pub mod state;
pub mod evaluate;
pub mod search;
pub mod nnue;
pub mod fen;

use wasm_bindgen::prelude::*;
use crate::types::{Color, PieceType};
use crate::magic::init_magics;
use crate::attacks::init_step_attacks;
use crate::movegen::generate_pseudo_legal_moves;
use crate::zobrist::init_zobrist;
use crate::tt::TranspositionTable;
use crate::state::GameState;
use crate::search::{SearchControl};
use crate::search::id::search_root_id;
use crate::nnue::serialize::load_vortex_weights;

#[wasm_bindgen]
pub struct VortexCore {
    version: String,
    state: GameState,
    tt: TranspositionTable,
    last_nodes: u32,
    last_volatility: f32,
    last_contempt: i16,
}

#[wasm_bindgen]
impl VortexCore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> VortexCore {
        console_error_panic_hook::set_once();
        init_magics();
        init_step_attacks();
        init_zobrist();
        VortexCore {
            version: String::from("2.0.0-rust-alpha"),
            state: GameState::new(),
            tt: TranspositionTable::new(16),
            last_nodes: 0,
            last_volatility: 0.0,
            last_contempt: 0,
        }
    }

    #[wasm_bindgen]
    pub fn reset_board(&mut self) {
        self.state = GameState::new();
    }

    #[wasm_bindgen]
    pub fn set_side_to_move(&mut self, is_white: bool) {
        let color = if is_white { Color::White } else { Color::Black };
        self.state.set_side_to_move(color);
    }

    #[wasm_bindgen]
    pub fn set_castling_rights(&mut self, rights: u8) {
        self.state.set_castling_rights(rights);
    }

    #[wasm_bindgen]
    pub fn set_en_passant_sq(&mut self, sq: i8) {
        // -1 means no en passant, 0-63 means the target square
        if sq < 0 || sq > 63 {
            self.state.set_en_passant(None);
        } else {
            self.state.set_en_passant(Some(sq as u8));
        }
    }

    #[wasm_bindgen]
    pub fn get_castling_rights(&self) -> u8 {
        self.state.castling_rights
    }

    #[wasm_bindgen]
    pub fn load_nnue(&mut self, buffer: Vec<u8>) -> bool {
        load_vortex_weights(&buffer)
    }

    #[wasm_bindgen]
    pub fn get_version(&self) -> String {
        self.version.clone()
    }

    #[wasm_bindgen]
    pub fn get_last_nodes(&self) -> u32 {
        self.last_nodes
    }

    #[wasm_bindgen]
    pub fn add_piece(&mut self, is_white: bool, pt_index: u8, sq: u8) {
        let color = if is_white { Color::White } else { Color::Black };
        let pt = match pt_index {
            1 => PieceType::Pawn,
            2 => PieceType::Knight,
            3 => PieceType::Bishop,
            4 => PieceType::Rook,
            5 => PieceType::Queen,
            6 => PieceType::King,
            _ => return,
        };
        self.state.board.add_piece(color, pt, sq);
    }

    #[wasm_bindgen]
    pub fn get_pieces(&self, is_white: bool, pt_index: u8) -> u64 {
        let color = if is_white { Color::White } else { Color::Black };
        let pt = match pt_index {
            1 => PieceType::Pawn,
            2 => PieceType::Knight,
            3 => PieceType::Bishop,
            4 => PieceType::Rook,
            5 => PieceType::Queen,
            6 => PieceType::King,
            _ => return 0,
        };
        self.state.board.get_pieces(color, pt)
    }

    #[wasm_bindgen]
    pub fn generate_pseudo_legal_moves(&self, is_white: bool) -> js_sys::Uint16Array {
        let color = if is_white { Color::White } else { Color::Black };
        let move_list = generate_pseudo_legal_moves(&self.state.board, color, self.state.castling_rights, self.state.en_passant_sq);

        let mut raw = Vec::with_capacity(move_list.count);
        for i in 0..move_list.count {
            raw.push(move_list.moves[i].0);
        }

        js_sys::Uint16Array::from(&raw[..])
    }

    #[wasm_bindgen]
    pub fn evaluate(&mut self) -> i16 {
        self.state.recompute_hash();
        crate::evaluate::evaluate(&mut self.state)
    }

    #[wasm_bindgen]
    pub fn structural_danger(&self) -> u8 {
        crate::evaluate::structural_danger(&self.state)
    }

    #[wasm_bindgen]
    pub fn search(&mut self, depth: i8, time_limit_ms: u64) -> wasm_bindgen::JsValue {
        self.state.recompute_hash();
        let mut ctrl = SearchControl {
            nodes: 0,
            stop: false,
            time_limit_ms,
            start_time_ms: crate::search::current_time_ms(),
        };

        self.state.repetition_history.push(self.state.hash);
        let stats = search_root_id(&mut self.state, depth, time_limit_ms, &mut self.tt, &mut ctrl);
        if !self.state.repetition_history.is_empty() {
            self.state.repetition_history.pop();
        }

        self.last_nodes = ctrl.nodes as u32;
        self.last_volatility = stats.volatility;
        self.last_contempt = stats.contempt;
        serde_wasm_bindgen::to_value(&stats).unwrap()
    }

    #[wasm_bindgen]
    pub fn get_game_phase(&self) -> u8 {
        crate::nnue::forward::game_phase(&self.state).1 as u8
    }

    #[wasm_bindgen]
    pub fn is_nnue_loaded(&self) -> bool {
        crate::nnue::serialize::is_vortex_loaded()
    }

    #[wasm_bindgen]
    pub fn get_contempt(&mut self) -> i16 {
        let score = self.evaluate();
        crate::contempt::compute_contempt(score)
    }

    #[wasm_bindgen]
    pub fn get_threat_delta(&self) -> i16 {
        self.state.threat_delta
    }

    #[wasm_bindgen]
    pub fn get_volatility(&self) -> f32 {
        self.last_volatility
    }
}
