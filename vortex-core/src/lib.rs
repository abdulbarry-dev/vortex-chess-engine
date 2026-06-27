pub mod types;
pub mod bitboard;
pub mod board;
pub mod magic;
pub mod attacks;
pub mod move_core;
pub mod movegen;
pub mod zobrist;
pub mod tt;

use wasm_bindgen::prelude::*;
use crate::board::Board;
use crate::types::{Color, PieceType};
use crate::magic::{init_magics, get_rook_attacks, get_bishop_attacks};
use crate::attacks::init_step_attacks;
use crate::movegen::generate_pseudo_legal_moves;
use crate::zobrist::init_zobrist;
use crate::tt::TranspositionTable;

#[wasm_bindgen]
pub struct VortexCore {
    version: String,
    board: Board,
    tt: TranspositionTable,
}

#[wasm_bindgen]
impl VortexCore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> VortexCore {
        init_magics();
        init_step_attacks();
        init_zobrist();
        VortexCore {
            version: String::from("2.0.0-rust-alpha"),
            board: Board::new(),
            tt: TranspositionTable::new(16), // 16 MB default
        }
    }

    #[wasm_bindgen]
    pub fn get_version(&self) -> String {
        self.version.clone()
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
        self.board.add_piece(color, pt, sq);
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
        self.board.get_pieces(color, pt)
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
        let move_list = generate_pseudo_legal_moves(&self.board, color);
        
        let mut raw = Vec::with_capacity(move_list.count);
        for i in 0..move_list.count {
            raw.push(move_list.moves[i].0);
        }
        
        js_sys::Uint16Array::from(&raw[..])
    }
}
