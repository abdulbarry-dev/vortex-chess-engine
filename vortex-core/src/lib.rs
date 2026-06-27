pub mod types;
pub mod bitboard;
pub mod board;
pub mod magic;
pub mod attacks;
pub mod move_core;
pub mod movegen;
pub mod zobrist;
pub mod tt;
pub mod state;
pub mod evaluate;
pub mod search;
pub mod nnue;

use wasm_bindgen::prelude::*;
use crate::board::Board;
use crate::types::{Color, PieceType};
use crate::magic::{init_magics, get_rook_attacks, get_bishop_attacks};
use crate::attacks::init_step_attacks;
use crate::movegen::generate_pseudo_legal_moves;
use crate::zobrist::{init_zobrist, get_zobrist};
use crate::tt::TranspositionTable;
use crate::state::GameState;
use crate::search::{search_position, SearchControl};
use crate::nnue::{init_nnue_empty, load_nnue_buffer};

#[wasm_bindgen]
pub struct VortexCore {
    version: String,
    state: GameState,
    tt: TranspositionTable,
    last_nodes: u32,
}

#[wasm_bindgen]
impl VortexCore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> VortexCore {
        init_magics();
        init_step_attacks();
        init_zobrist();
        init_nnue_empty();
        VortexCore {
            version: String::from("2.0.0-rust-alpha"),
            state: GameState::new(),
            tt: TranspositionTable::new(16), // 16 MB default
            last_nodes: 0,
        }
    }

    #[wasm_bindgen]
    pub fn reset_board(&mut self) {
        self.state = GameState::new();
    }

    #[wasm_bindgen]
    pub fn set_side_to_move(&mut self, is_white: bool) {
        self.state.side_to_move = if is_white { Color::White } else { Color::Black };
    }

    #[wasm_bindgen]
    pub fn load_nnue(&self, buffer: &[u8]) -> bool {
        load_nnue_buffer(buffer)
    }

    #[wasm_bindgen]
    pub fn get_version(&self) -> String {
        self.version.clone()
    }

    #[wasm_bindgen]
    pub fn get_last_nodes(&self) -> u32 {
        self.last_nodes
    }
    
    // Some basic WASM wrappers to interact with the board from TypeScript
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
            _ => return, // Invalid piece type
        };
        self.state.board.add_piece(color, pt, sq);
    }
    
    // We can return the low and high 32 bits of a u64 since JS numbers (f64) 
    // lose precision for 64-bit integers, though wasm-bindgen handles BigInt out of the box now.
    // For performance, BigInt works fine across modern browsers/Node.
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
    pub fn test_rook_attacks(&self, sq: u8, occ: u64) -> u64 {
        get_rook_attacks(sq, occ)
    }

    #[wasm_bindgen]
    pub fn test_bishop_attacks(&self, sq: u8, occ: u64) -> u64 {
        get_bishop_attacks(sq, occ)
    }

    // Return the pseudo legal moves for a color as a JS Uint16Array
    #[wasm_bindgen]
    pub fn generate_pseudo_legal_moves(&self, is_white: bool) -> js_sys::Uint16Array {
        let color = if is_white { Color::White } else { Color::Black };
        let move_list = generate_pseudo_legal_moves(&self.state.board, color);
        
        let mut raw = Vec::with_capacity(move_list.count);
        for i in 0..move_list.count {
            raw.push(move_list.moves[i].0);
        }
        
        js_sys::Uint16Array::from(&raw[..])
    }

    // Search the position and return the best move as a u16
    #[wasm_bindgen]
    pub fn search(&mut self, depth: i8) -> u16 {
        let mut ctrl = SearchControl {
            nodes: 0,
            stop: false,
            time_limit_ms: 5000,
        };
        
        // Very simple search trigger
        search_position(self.state.clone(), depth, -30000, 30000, 0, &mut self.tt, &mut ctrl);
        
        // Grab the best move from the root TT entry
        let hash = get_zobrist().compute_hash(&self.state.board, self.state.side_to_move, self.state.castling_rights, self.state.en_passant_sq);
        
        self.last_nodes = ctrl.nodes as u32;
        
        if let Some(entry) = self.tt.probe(hash) {
            return entry.best_move;
        }
        0 // No move found (checkmate/stalemate/error)
    }
}
