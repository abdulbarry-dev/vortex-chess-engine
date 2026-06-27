const { VortexCore } = require('./vortex-core/pkg/vortex_core.js');

console.log('Testing WASM bridge...');
const core = new VortexCore();
console.log('Version from Rust:', core.get_version());
