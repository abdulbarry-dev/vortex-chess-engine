use crate::types::FT_SIZE;
use std::sync::Mutex;

pub struct VortexWeights {
    pub pst_weights: Vec<i16>,       
    pub pst_biases: [i16; FT_SIZE],  

    pub threat_weights: Vec<i8>,     

    pub phase_embeddings: Vec<f32>,  

    pub l1_weights: Vec<i8>,         
    pub l1_biases: Vec<f32>,         
    pub l1_quant: i32,               

    pub l2_weights: Vec<f32>,        
    pub l2_biases: Vec<f32>,         

    pub l3_weights: Vec<f32>,        
    pub l3_biases: Vec<f32>,         

    pub is_loaded: bool,
}

impl VortexWeights {
    pub const fn new() -> Self {
        Self {
            pst_weights: Vec::new(),
            pst_biases: [0; FT_SIZE],
            threat_weights: Vec::new(),
            phase_embeddings: Vec::new(),
            l1_weights: Vec::new(),
            l1_biases: Vec::new(),
            l1_quant: 64,
            l2_weights: Vec::new(),
            l2_biases: Vec::new(),
            l3_weights: Vec::new(),
            l3_biases: Vec::new(),
            is_loaded: false,
        }
    }
}

pub static WEIGHTS: Mutex<VortexWeights> = Mutex::new(VortexWeights::new());
pub static IS_NNUE_LOADED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
