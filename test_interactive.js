const { spawn } = require('child_process');
const cp = spawn('node', ['dist/cli.js']);

cp.stdout.on('data', d => console.log('STDOUT:', d.toString()));
cp.stderr.on('data', d => console.log('STDERR:', d.toString()));

cp.stdin.write("uci\nucinewgame\nposition startpos moves e2e4 c7c5\ngo movetime 100\n");
setTimeout(() => cp.kill(), 1000);
