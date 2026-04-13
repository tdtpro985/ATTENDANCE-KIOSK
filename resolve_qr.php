<?php
// Resolve QR data to an account (username -> log_id)

ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);
ob_start();

register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        if (ob_get_length()) {
            ob_end_clean();
        }
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode([
            'ok' => false,
            'message' => 'Server error',
            'detail' => $err['message'],
        ]);
    }
});

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, Accept');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'message' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/connect.php';

$qr = isset($_GET['qr']) ? trim((string)$_GET['qr']) : '';
if ($qr === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Missing qr parameter']);
    exit;
}

// Expected format: LOG_ID:<id> or USER:<username>|HASH:<...>|TIME:<...>
$logId = null;
$username = null;
if (preg_match('/LOG_ID:([0-9]+)/', $qr, $m)) {
    $logId = trim($m[1]);
}
if (!$logId && preg_match('/USER:([^|]+)/', $qr, $m)) {
    $username = trim($m[1]);
}

if (!$logId && !$username) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Invalid QR format (missing LOG_ID or USER)']);
    exit;
}

if ($logId) {
    [$status, $data, $err] = supabase_request(
        'GET',
        "rest/v1/accounts?log_id=eq." . urlencode($logId) . "&select=log_id,username"
    );
} else {
    [$status, $data, $err] = supabase_request(
        'GET',
        "rest/v1/accounts?username=eq." . urlencode($username) . "&select=log_id,username"
    );
}

if ($err) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => 'Database error', 'detail' => $err]);
    exit;
}

if ($status !== 200 || !is_array($data) || count($data) === 0) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'message' => 'Account not found']);
    exit;
}

$resolvedLogId = $data[0]['log_id'] ?? null;
$resolvedUsername = $data[0]['username'] ?? $username;

function normalize_value($value) {
    if ($value === null || $value === false || $value === '') {
        return null;
    }
    $text = trim((string)$value);
    return $text === '' ? null : $text;
}

$displayName = null;
$profilePicture = null;
$role = null;
$gender = null;
$birthday = null;
$address = null;
$phone = null;
$email = null;
$department = null;

if ($resolvedLogId) {
    [$s2, $empRows, $e2] = supabase_request(
        'GET',
        "rest/v1/employees?log_id=eq." . urlencode($resolvedLogId) . "&select=emp_id,name,role,gender,birthday,address,phone,email,dept_id,accounts!inner(log_id,username,profile_picture),departments(name)"
    );

    error_log("resolve_qr.php: Query result - Status: $s2, Error: " . ($e2 ?: 'none') . ", Rows: " . count($empRows ?? []));

    if (!$e2 && is_array($empRows) && count($empRows) > 0) {
        $employee = $empRows[0];
        error_log("resolve_qr.php: Employee data: " . json_encode($employee));
        $displayName = normalize_value($employee['name'] ?? null);
        $role = normalize_value($employee['role'] ?? null);
        $gender = normalize_value($employee['gender'] ?? null);
        $birthday = normalize_value($employee['birthday'] ?? null);
        $address = normalize_value($employee['address'] ?? null);
        $phone = normalize_value($employee['phone'] ?? null);
        $email = normalize_value($employee['email'] ?? null);
        $profilePicture = normalize_value($employee['accounts']['profile_picture'] ?? null);
        $department = normalize_value($employee['departments']['name'] ?? null);
    } else {
        error_log("resolve_qr.php: No employee data found for log_id: $resolvedLogId");
    }
}

echo json_encode([
    'ok' => true,
    'user' => [
        'log_id' => $resolvedLogId,
        'username' => $resolvedUsername,
        'name' => $displayName,
        'profile_picture' => $profilePicture,
        'role' => $role,
        'gender' => $gender,
        'birthday' => $birthday,
        'address' => $address,
        'phone' => $phone,
        'email' => $email,
        'department' => $department,
    ],
]);

error_log("resolve_qr.php: Final response: " . json_encode([
    'ok' => true,
    'user' => [
        'log_id' => $resolvedLogId,
        'username' => $resolvedUsername,
        'name' => $displayName,
        'profile_picture' => $profilePicture,
        'role' => $role,
        'gender' => $gender,
        'birthday' => $birthday,
        'address' => $address,
        'phone' => $phone,
        'email' => $email,
        'department' => $department,
    ],
]));

if (ob_get_level()) {
    ob_end_flush();
}
