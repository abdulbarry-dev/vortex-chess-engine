
// This is the entry point when the Worker starts
console.log("Vortex Engine v1.0 is ready.");

// Workaround for TypeScript not recognizing self/postMessage in Worker context
declare const self: any;
declare function postMessage(message: string): void;

// Listen for messages from the Frontend (Nuxt)
self.onmessage = (event: MessageEvent) => {
    const command = event.data;
    // TODO: Implement UCI protocol handler
    console.log('Received command:', command);
};

// Send a message back to prove it works
postMessage("id name Vortex Chess Engine");
postMessage("id author Vortex Team");
postMessage("uciok");

