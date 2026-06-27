// NNUE (Efficiently Updatable Neural Network) Inference implementation
// Architecture: Half-KP (King-Piece) 
// Input: 40960 features (64 king squares * 640 piece-squares)
// Hidden Layer: 256 neurons per side (White/Black perspectives)

use crate::state::GameState;
use crate::types::{Color, PieceType, Square};

pub const HIDDEN_SIZE: usize = 256;
pub const INPUT_SIZE: usize = 40960;

// Align to 32 bytes for SIMD if applicable, though WASM doesn't easily do aligned SIMD out of the box
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
    pub feature_weights: Vec<i16>, // [INPUT_SIZE * HIDDEN_SIZE]
    pub feature_biases: [i16; HIDDEN_SIZE],
    pub output_weights: [i16; HIDDEN_SIZE * 2], // 256 for white perspective, 256 for black
    pub output_bias: i16,
    pub is_loaded: bool,
}

pub static mut NNUE: NNUEWeights = NNUEWeights {
    feature_weights: Vec::new(),
    feature_biases: [0; HIDDEN_SIZE],
    output_weights: [0; HIDDEN_SIZE * 2],
    output_bias: 0,
    is_loaded: false,
};

pub fn init_nnue_empty() {
    unsafe {
        if NNUE.feature_weights.is_empty() {
            NNUE.feature_weights = vec![0; INPUT_SIZE * HIDDEN_SIZE];
        }
    }
}

pub fn load_nnue_buffer(buffer: &[u8]) -> bool {
    // Basic verification and loading of NNUE weights
    // In a real engine, this parses a standardized binary format.
    // For Vortex, we expect exactly the size of our weights.
    
    let expected_size = (INPUT_SIZE * HIDDEN_SIZE * 2) // feature weights
                      + (HIDDEN_SIZE * 2)              // feature biases
                      + (HIDDEN_SIZE * 2 * 2)          // output weights
                      + 2;                             // output bias
                      
    if buffer.len() != expected_size {
        return false;
    }

    unsafe {
        // Read feature weights
        let mut offset = 0;
        for i in 0..(INPUT_SIZE * HIDDEN_SIZE) {
            NNUE.feature_weights[i] = i16::from_le_bytes([buffer[offset], buffer[offset + 1]]);
            offset += 2;
        }
        
        for i in 0..HIDDEN_SIZE {
            NNUE.feature_biases[i] = i16::from_le_bytes([buffer[offset], buffer[offset + 1]]);
            offset += 2;
        }
        
        for i in 0..(HIDDEN_SIZE * 2) {
            NNUE.output_weights[i] = i16::from_le_bytes([buffer[offset], buffer[offset + 1]]);
            offset += 2;
        }
        
        NNUE.output_bias = i16::from_le_bytes([buffer[offset], buffer[offset + 1]]);
        NNUE.is_loaded = true;
    }
    
    true
}

// Compute the feature index for a specific piece on a square, relative to a king square
#[inline(always)]
fn feature_index(king_sq: Square, is_us: bool, pt: PieceType, piece_sq: Square) -> usize {
    let piece_type_idx = pt as usize - 1; // 0..4 (pawn..queen)
    let color_offset = if is_us { 0 } else { 5 * 64 };
    
    let piece_offset = (piece_type_idx * 64) + piece_sq as usize + color_offset;
    (king_sq as usize * 640) + piece_offset
}

// Recompute accumulator from scratch
pub fn refresh_accumulator(state: &GameState, acc: &mut Accumulator) {
    unsafe {
        if !NNUE.is_loaded { return; }
        
        // Start with biases
        acc.white.copy_from_slice(&NNUE.feature_biases);
        acc.black.copy_from_slice(&NNUE.feature_biases);
        
        let w_king_bb = state.board.get_pieces(Color::White, PieceType::King);
        let b_king_bb = state.board.get_pieces(Color::Black, PieceType::King);
        
        if w_king_bb == 0 || b_king_bb == 0 { return; }
        
        let w_king_sq = w_king_bb.trailing_zeros() as Square;
        let b_king_sq = b_king_bb.trailing_zeros() as Square;
        let b_king_sq_mirrored = b_king_sq ^ 56; // Mirror vertically for black perspective
        
        // Add active features
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
                        acc.white[i] += NNUE.feature_weights[w_offset + i];
                        acc.black[i] += NNUE.feature_weights[b_offset + i];
                    }
                }
            }
        }
    }
}

// Evaluate the position using NNUE
pub fn evaluate_nnue(state: &GameState, acc: &Accumulator) -> i16 {
    unsafe {
        if !NNUE.is_loaded {
            return 0; // Fallback to classic eval if not loaded
        }
        
        let (us_acc, them_acc) = if state.side_to_move == Color::White {
            (&acc.white, &acc.black)
        } else {
            (&acc.black, &acc.white)
        };
        
        let mut output: i32 = NNUE.output_bias as i32;
        
        // Clipped ReLU activation and output layer dot product
        for i in 0..HIDDEN_SIZE {
            // US half
            let act = us_acc[i].clamp(0, 127) as i32;
            output += act * (NNUE.output_weights[i] as i32);
            
            // THEM half
            let act_them = them_acc[i].clamp(0, 127) as i32;
            output += act_them * (NNUE.output_weights[HIDDEN_SIZE + i] as i32);
        }
        
        // Scale down the output to centipawns
        (output / 16) as i16
    }
}
