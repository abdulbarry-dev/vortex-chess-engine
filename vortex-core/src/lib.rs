use wasm_bindgen::prelude::*;

// This #[wasm_bindgen] macro exposes the struct to JavaScript
#[wasm_bindgen]
pub struct VortexCore {
    // We will hold our 12 bitboards here eventually
    version: String,
}

#[wasm_bindgen]
impl VortexCore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> VortexCore {
        VortexCore {
            version: String::from("2.0.0-rust-alpha"),
        }
    }

    #[wasm_bindgen]
    pub fn get_version(&self) -> String {
        self.version.clone()
    }
}
