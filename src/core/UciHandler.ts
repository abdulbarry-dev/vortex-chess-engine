export class UciHandler {
    static parse(command: string) {
        const tokens = command.trim().split(' ');
        
        switch(tokens[0]) {
            case 'uci':
                console.log('UCI mode enabled');
                break;
            case 'isready':
                postMessage('readyok');
                break;
            case 'go':
                // TODO: Call the search function here
                console.log('Starting search...');
                break;
            default:
                console.log(`Unknown command: ${command}`);
        }
    }
}
