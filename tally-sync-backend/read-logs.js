const fs = require('fs');

try {
    const data = fs.readFileSync('logs.txt', 'utf8');
    const lines = data.split('\n');
    const last50 = lines.slice(-50);
    console.log(last50.join('\n'));
} catch (e) {
    console.error(e.message);
}
