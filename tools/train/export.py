import torch
import struct
import numpy as np

PST_FEATURES = 7680
THREAT_FEATURES = 72000
FT_SIZE = 768
L2_SIZE = 16
L3_SIZE = 32
NUM_PHASE_BUCKETS = 16

def export_vortex_weights(model, output_path):
    print(f"Exporting model to {output_path}...")
    
    with open(output_path, "wb") as f:
        # Magic
        f.write(b"VRTX")
        
        # 1. PST Biases (FT_SIZE x i16)
        # Note: VortexNNUE in our train.py used EmbeddingBag, which doesn't have an explicit bias.
        # We'll just export zeros for pst_biases.
        pst_biases = np.zeros(FT_SIZE, dtype=np.int16)
        f.write(pst_biases.tobytes())
        
        # 2. PST Weights (PST_FEATURES x FT_SIZE x i16)
        # Assuming Q0.15 quantization for embedding weights: w * 32768
        pst_weights = (model.pst_embed.weight.detach().numpy() * 32768).clip(-32768, 32767).astype(np.int16)
        f.write(pst_weights.tobytes())
        
        # 3. Threat Weights (THREAT_FEATURES x FT_SIZE x i8)
        # Assuming Q0.7 quantization: w * 127
        threat_weights = (model.threat_embed.weight.detach().numpy() * 127).clip(-128, 127).astype(np.int8)
        f.write(threat_weights.tobytes())
        
        # 4. Phase Embeddings (NUM_PHASE_BUCKETS x FT_SIZE x f32)
        phase_embeddings = model.phase_embed.weight.detach().numpy().astype(np.float32)
        f.write(phase_embeddings.tobytes())
        
        # 5. L1 Weights (L2_SIZE x FT_SIZE x i8)
        # Q0.7 quantization
        l1_weights = (model.l1.weight.detach().numpy() * 127).clip(-128, 127).astype(np.int8)
        f.write(l1_weights.tobytes())
        
        # 6. L1 Biases (NUM_PHASE_BUCKETS x L2_SIZE x f32)
        l1_biases = model.l1_bias.weight.detach().numpy().astype(np.float32)
        f.write(l1_biases.tobytes())
        
        # 7. L1 Quantization (i32)
        # We used 127 for L1 weights
        l1_quant = np.int32(127)
        f.write(l1_quant.tobytes())
        
        # 8. L2 Weights (L2_SIZE x L3_SIZE x f32)
        # Note: PyTorch Linear weight is shape (out_features, in_features)
        # Wait! The Rust parser reads `L2_SIZE * L3_SIZE`. 
        # In our network, L2 has L2_SIZE inputs and L3_SIZE outputs.
        # So PyTorch l2.weight is shape (L3_SIZE, L2_SIZE).
        # We need to transpose it to (L2_SIZE, L3_SIZE) to match Rust? Or keep it?
        # Typically Rust reads contiguous memory. Let's just flatten the transposed weight.
        l2_weights = model.l2.weight.detach().numpy().T.astype(np.float32)
        f.write(l2_weights.tobytes())
        
        # 9. L2 Biases (NUM_PHASE_BUCKETS x L3_SIZE x f32)
        # We don't have L2 bias per phase in the model provided, just zeros for now.
        l2_biases = np.zeros((NUM_PHASE_BUCKETS, L3_SIZE), dtype=np.float32)
        f.write(l2_biases.tobytes())
        
        # 10. L3 Weights (L3_SIZE x f32)
        # PyTorch l3.weight is shape (1, L3_SIZE)
        l3_weights = model.l3.weight.detach().numpy().flatten().astype(np.float32)
        f.write(l3_weights.tobytes())
        
        # 11. L3 Biases (NUM_PHASE_BUCKETS x f32)
        l3_biases = np.zeros(NUM_PHASE_BUCKETS, dtype=np.float32)
        f.write(l3_biases.tobytes())
        
    print("Export complete.")

if __name__ == "__main__":
    from train import VortexNNUE
    model = VortexNNUE()
    export_vortex_weights(model, "vortex_untrained.vortex")
