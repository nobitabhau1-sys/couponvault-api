<?php
// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(200);
    exit;
}

 $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
 $logfile = __DIR__ . '/collected_data.json';

// 1. Serve the collected data file if requested
if ($uri === '/collected_data.json' || $uri === 'collected_data.json') {
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    
    if (file_exists($logfile)) {
        readfile($logfile);
    } else {
        echo '[]';
    }
    exit;
}

// 2. Handle incoming POST requests from the app
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

    $clientIP = $_SERVER['HTTP_X_FORWARDED_FOR'] 
        ?? $_SERVER['HTTP_X_REAL_IP'] 
        ?? $_SERVER['REMOTE_ADDR'] 
        ?? 'unknown';

    $entry = [
        'timestamp' => date('Y-m-d H:i:s'),
        'client_ip' => $clientIP,
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
        'device' => $data
    ];

    file_put_contents($logfile, json_encode($entry) . "\n", FILE_APPEND | LOCK_EX);

    http_response_code(200);
    echo json_encode(['status' => 'ok']);
    exit;
}

// 3. Fallback for GET requests (like visiting the URL in a browser)
http_response_code(200);
echo json_encode(['status' => 'online', 'message' => 'API is running. Send POST requests to log data.']);
?>
