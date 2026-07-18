<?php
// CORS pre-flight handling
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(200);
    exit;
}

// Path to data log (outside public folder, one level up)
$logFile = __DIR__ . '/../collected_data.json';

// Serve the log file when requested directly
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($uri === '/collected_data.json') {
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    if (file_exists($logFile)) {
        readfile($logFile);
    } else {
        echo '[]';
    }
    exit;
}

// Handle incoming POST data (from the Android app)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);
    if ($data === null) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid_json', 'received' => $rawInput]);
        exit;
    }
    // Determine client IP safely
    $clientIP = $_SERVER['HTTP_X_FORWARDED_FOR'] ??
                $_SERVER['HTTP_X_REAL_IP'] ??
                $_SERVER['REMOTE_ADDR'] ??
                'unknown';
    $entry = [
        'timestamp'   => date('Y-m-d H:i:s'),
        'client_ip'   => $clientIP,
        'user_agent'  => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
        'device'      => $data,
    ];
    // Append entry atomically
    file_put_contents($logFile, json_encode($entry) . "\n", FILE_APPEND | LOCK_EX);
    http_response_code(200);
    echo json_encode(['status' => 'ok']);
    exit;
}

// Fallback for simple GET health check
http_response_code(200);
echo json_encode(['status' => 'online', 'message' => 'API is running.']);
?>
