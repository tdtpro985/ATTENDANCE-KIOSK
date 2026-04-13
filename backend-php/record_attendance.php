<?php
/**
 * Record attendance (clock-in / clock-out) into Supabase `attendance` table.
 *
 * POST JSON: { "user_id": "<log_id>", "action": "clock_in" | "clock_out" }
 * - clock_in: inserts row with emp_id, timein, date, timeout=NULL
 * - clock_out: updates today's row for emp_id (where timeout IS NULL) with timeout=now()
 *
 * GET (for clients that can't read attendance due to RLS):
 *  - ?emp_id=<emp_id> OR ?user_id=<log_id>
 *  - optional: ?since=YYYY-MM-DD (defaults to yesterday in Asia/Manila)
 *  - optional: ?limit=1..10 (defaults to 1)
 * Returns the most recent clock-in rows for the user/emp_id.
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, Accept');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/connect.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    date_default_timezone_set('Asia/Manila');

    $emp_id = null;
    if (isset($_GET['emp_id']) && trim((string)$_GET['emp_id']) !== '') {
        $emp_id = (int)$_GET['emp_id'];
    } else if (isset($_GET['user_id']) && trim((string)$_GET['user_id']) !== '') {
        $userId = trim((string)$_GET['user_id']);
        [$status, $empData, $err] = supabase_request(
            'GET',
            "rest/v1/employees?log_id=eq." . urlencode($userId) . "&select=emp_id"
        );
        if ($err) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'message' => 'Database error', 'detail' => $err]);
            exit;
        }
        if ($status !== 200 || !is_array($empData) || count($empData) === 0) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'message' => 'Employee not found for this user']);
            exit;
        }
        $emp_id = (int)$empData[0]['emp_id'];
    }

    if ($emp_id === null || $emp_id <= 0) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'message' => 'Missing emp_id or user_id']);
        exit;
    }

    $since = isset($_GET['since']) ? trim((string)$_GET['since']) : '';
    if ($since !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $since)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'message' => 'Invalid since (expected YYYY-MM-DD)']);
        exit;
    }

    $limit = 1;
    if (isset($_GET['limit'])) {
        $limit = (int)$_GET['limit'];
    }
    if ($limit < 1) $limit = 1;
    if ($limit > 50) $limit = 50; // Increased from 10 to 50 to support fetching past attendances

    // Most recent clock-ins (optionally filtered by date >= since).
    $dateFilter = $since !== '' ? "&date=gte.{$since}" : '';
    [$status, $rows, $err] = supabase_request(
        'GET',
        "rest/v1/attendance?emp_id=eq.{$emp_id}{$dateFilter}&timein=not.is.null&order=date.desc,att_id.desc&limit={$limit}&select=att_id,emp_id,timein,timeout,date"
    );
    if ($err) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'message' => 'Database error', 'detail' => $err]);
        exit;
    }
    if ($status !== 200 || !is_array($rows)) {
        http_response_code(502);
        echo json_encode(['ok' => false, 'message' => 'Unexpected response from Supabase', 'status' => $status]);
        exit;
    }

    echo json_encode(['ok' => true, 'emp_id' => $emp_id, 'since' => ($since !== '' ? $since : null), 'data' => $rows]);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'message' => 'Method not allowed']);
    exit;
}

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Invalid JSON body']);
    exit;
}

$userId = isset($body['user_id']) ? trim((string)$body['user_id']) : '';
$action = isset($body['action']) ? trim((string)$body['action']) : '';

if ($userId === '' || !in_array($action, ['clock_in', 'clock_out'], true)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Missing or invalid user_id or action (use clock_in or clock_out)']);
    exit;
}

// Resolve log_id (user_id) to emp_id via employees table
[$status, $empData, $err] = supabase_request(
    'GET',
    "rest/v1/employees?log_id=eq." . urlencode($userId) . "&select=emp_id"
);
if ($err) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => 'Database error', 'detail' => $err]);
    exit;
}
if ($status !== 200 || !is_array($empData) || count($empData) === 0) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'message' => 'Employee not found for this user']);
    exit;
}
$emp_id = (int)$empData[0]['emp_id'];
$nowTime = null;
date_default_timezone_set('Asia/Manila');
$today = date('Y-m-d');
$nowTime = date('H:i:s');

if ($action === 'clock_in') {
    // Check if already clocked in today (open session)
    [$status, $rows, $err] = supabase_request(
        'GET',
        "rest/v1/attendance?emp_id=eq.{$emp_id}&date=eq.{$today}&timeout=is.null&order=att_id.desc&limit=1&select=att_id,timein,timeout,date"
    );
    if ($err) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'message' => 'Database error', 'detail' => $err]);
        exit;
    }
    if ($status === 200 && is_array($rows) && count($rows) > 0) {
        $row = $rows[0];
        $existingTimein = $row['timein'] ?? null;
        echo json_encode([
            'ok' => true,
            'message' => 'Already clocked in',
            'emp_id' => $emp_id,
            'date' => $today,
            'timein' => $existingTimein,
        ]);
        exit;
    }

    // Allow multiple clock-ins per day - always create new record
    error_log("Attempting to insert attendance record for emp_id: {$emp_id}, timein: {$nowTime}, date: {$today}");
    [$status, $result, $err] = supabase_insert('attendance', [
        'emp_id' => $emp_id,
        'timein' => $nowTime,
        'timeout' => null,
        'date'   => $today,
    ]);
    error_log("Insert result - Status: {$status}, Error: " . ($err ?: 'none') . ", Result: " . json_encode($result));

    if ($err) {
        error_log("Database error during clock-in: {$err}");
        http_response_code(500);
        echo json_encode(['ok' => false, 'message' => 'Failed to record clock-in', 'detail' => $err]);
        exit;
    }
    if ($status < 200 || $status >= 300) {
        error_log("HTTP error during clock-in: Status {$status}, Result: " . json_encode($result));
        http_response_code($status);
        echo json_encode([
            'ok' => false,
            'message' => 'Failed to record clock-in',
            'status' => $status,
            'detail' => $result,
        ]);
        exit;
    }
    echo json_encode([
        'ok' => true,
        'message' => 'Clock-in recorded',
        'emp_id' => $emp_id,
        'date' => $today,
        'timein' => $nowTime,
    ]);
    exit;
}

// clock_out: find today's row for this emp with timeout IS NULL, then set timeout
error_log("Attempting clock-out for emp_id: {$emp_id}, date: {$today}");
[$status, $rows, $err] = supabase_request(
    'GET',
    "rest/v1/attendance?emp_id=eq.{$emp_id}&date=eq.{$today}&timeout=is.null&order=att_id.desc&limit=1&select=att_id"
);
error_log("Clock-out query result - Status: {$status}, Rows found: " . count($rows ?? []) . ", Error: " . ($err ?: 'none'));

if ($err) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => 'Database error', 'detail' => $err]);
    exit;
}
if ($status !== 200 || !is_array($rows) || count($rows) === 0) {
    error_log("No open clock-in found for clock-out - emp_id: {$emp_id}, date: {$today}");
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'No clock-in found for today to clock out']);
    exit;
}
$att_id = (int)$rows[0]['att_id'];
error_log("Found open attendance record att_id: {$att_id} for clock-out");

[$status, $result, $err] = supabase_request(
    'PATCH',
    "rest/v1/attendance?att_id=eq.{$att_id}",
    ['timeout' => $nowTime],
    ['Prefer: return=representation']
);
error_log("Clock-out update result - Status: {$status}, Error: " . ($err ?: 'none') . ", Result: " . json_encode($result));

if ($err) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => 'Failed to record clock-out', 'detail' => $err]);
    exit;
}
if ($status < 200 || $status >= 300) {
    http_response_code($status);
    echo json_encode(['ok' => false, 'message' => 'Failed to record clock-out', 'status' => $status]);
    exit;
}
echo json_encode([
    'ok' => true,
    'message' => 'Clock-out recorded',
    'emp_id' => $emp_id,
    'date' => $today,
    'timeout' => $nowTime,
]);
exit;
