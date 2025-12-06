import { UciHandler } from './core/UciHandler';

// This is the entry point when the Worker starts
console.log("Vortex Engine v1.0 is ready.");

// Listen for messages from the Frontend (Nuxt)
self.onmessage = (event: MessageEvent) => {
    const command = event.data;
    UciHandler.parse(command);
};

// Send a message back to prove it works
postMessage("id name Vortex Chess Engine");
postMessage("id author YourName");
postMessage("uciok");
