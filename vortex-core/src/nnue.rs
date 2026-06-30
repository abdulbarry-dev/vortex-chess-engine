use crate::state::GameState;
use crate::types::{Color, PieceType, Square};
use std::sync::Mutex;

pub mod accumulator;
pub mod weights;
pub mod forward;
pub mod network;
pub mod serialize;
pub mod threat_map;

pub const HIDDEN_SIZE: usize = 256;
pub const INPUT_SIZE: usize = 40960;

#[derive(Clone)]
#[repr(C)]
pub struct Accumulator {
    pub white: [i16; HIDDEN_SIZE],
    pub black: [i16; HIDDEN_SIZE],
}

impl Accumulator {
    pub fn new() -> Self {
        Self {
            white: [0; HIDDEN_SIZE],
            black: [0; HIDDEN_SIZE],
        }
    }
}

pub struct NNUEWeights {
    pub feature_weights: Vec<i16>,
    pub feature_biases: [i16; HIDDEN_SIZE],
    pub output_weights: [i16; HIDDEN_SIZE * 2],
    pub output_bias: i16,
    pub is_loaded: bool,
}

static NNUE: Mutex<NNUEWeights> = Mutex::new(NNUEWeights {
    feature_weights: Vec::new(),
    feature_biases: [0; HIDDEN_SIZE],
    output_weights: [0; HIDDEN_SIZE * 2],
    output_bias: 0,
    is_loaded: false,
});

pub fn init_nnue_empty() {
    let mut nnue = NNUE.lock().unwrap();
    if nnue.feature_weights.is_empty() {
        nnue.feature_weights = vec![0; INPUT_SIZE * HIDDEN_SIZE];
    }
}

pub fn is_nnue_loaded() -> bool {
    NNUE.lock().unwrap().is_loaded
}

pub fn load_nnue_buffer(buffer: &[u8]) -> bool {
    let expected_size = (INPUT_SIZE * HIDDEN_SIZE * 2)
                      + (HIDDEN_SIZE * 2)
                      + (HIDDEN_SIZE * 2 * 2)
                      + 2;
                       
    if buffer.len() != expected_size {
        return false;
    }

    let mut nnue = NNUE.lock().unwrap();

    let mut offset = 0;
    for i in 0..(INPUT_SIZE * HIDDEN_SIZE) {
        nnue.feature_weights[i] = i16::from_le_bytes([buffer[offset], buffer[offset + 1]]);
        offset += 2;
    }
    
    for i in 0..HIDDEN_SIZE {
        nnue.feature_biases[i] = i16::from_le_bytes([buffer[offset], buffer[offset + 1]]);
        offset += 2;
    }
    
    for i in 0..(HIDDEN_SIZE * 2) {
        nnue.output_weights[i] = i16::from_le_bytes([buffer[offset], buffer[offset + 1]]);
        offset += 2;
    }
    
    nnue.output_bias = i16::from_le_bytes([buffer[offset], buffer[offset + 1]]);
    nnue.is_loaded = true;
    
    true
}

#[inline(always)]
fn feature_index(king_sq: Square, is_us: bool, pt: PieceType, piece_sq: Square) -> usize {
    let piece_type_idx = pt as usize;
    let color_offset = if is_us { 0 } else { 5 * 64 };
    let piece_offset = (piece_type_idx * 64) + piece_sq as usize + color_offset;
    (king_sq as usize * 640) + piece_offset
}

pub fn refresh_accumulator(state: &GameState, acc: &mut Accumulator) {
    let nnue = NNUE.lock().unwrap();
    if !nnue.is_loaded { return; }
    
    acc.white.copy_from_slice(&nnue.feature_biases);
    acc.black.copy_from_slice(&nnue.feature_biases);
    
    let w_king_bb = state.board.get_pieces(Color::White, PieceType::King);
    let b_king_bb = state.board.get_pieces(Color::Black, PieceType::King);
    
    if w_king_bb == 0 || b_king_bb == 0 { return; }
    
    let w_king_sq = w_king_bb.trailing_zeros() as Square;
    let b_king_sq = b_king_bb.trailing_zeros() as Square;
    let b_king_sq_mirrored = b_king_sq ^ 56;
    
    for c in [Color::White, Color::Black] {
        let is_white = c == Color::White;
        
        for pt in [PieceType::Pawn, PieceType::Knight, PieceType::Bishop, PieceType::Rook, PieceType::Queen] {
            let mut bb = state.board.get_pieces(c, pt);
            while bb != 0 {
                let sq = bb.trailing_zeros() as Square;
                bb &= bb - 1;
                
                let sq_mirrored = sq ^ 56;
                
                let w_idx = feature_index(w_king_sq, is_white, pt, sq);
                let b_idx = feature_index(b_king_sq_mirrored, !is_white, pt, sq_mirrored);
                
                let w_offset = w_idx * HIDDEN_SIZE;
                let b_offset = b_idx * HIDDEN_SIZE;
                
                for i in 0..HIDDEN_SIZE {
                    acc.white[i] += nnue.feature_weights[w_offset + i];
                    acc.black[i] += nnue.feature_weights[b_offset + i];
                }
            }
        }
    }
}

pub fn evaluate_nnue(state: &GameState, acc: &Accumulator) -> i16 {
    let nnue = NNUE.lock().unwrap();
    if !nnue.is_loaded {
        return 0;
    }
    
    let (us_acc, them_acc) = if state.side_to_move == Color::White {
        (&acc.white, &acc.black)
    } else {
        (&acc.black, &acc.white)
    };
    
    let mut output: i32 = nnue.output_bias as i32;
    
    for i in 0..HIDDEN_SIZE {
        let act = us_acc[i].clamp(0, 127) as i32;
        output += act * (nnue.output_weights[i] as i32);
        
        let act_them = them_acc[i].clamp(0, 127) as i32;
        output += act_them * (nnue.output_weights[HIDDEN_SIZE + i] as i32);
    }
    
    (output / 16) as i16
}
