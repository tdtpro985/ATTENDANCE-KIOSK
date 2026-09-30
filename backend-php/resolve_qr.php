<?php
date_default_timezone_set('Asia/Manila');
// Resolve QR data to an account (username -> log_id)

ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
ini_set('memory_limit', '512M');
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

$qr = isset($_GET['qr']) ? trim((string) $_GET['qr']) : '';
if ($qr === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Missing qr parameter']);
    exit;
}

// Expected format: LOG_ID:<id>, LOGID:<id>, USER:<username>, or TDTINTRN<id>
$logId = null;
$username = null;
if (preg_match('/TDTINTRN([0-9]+)/i', $qr, $m)) {
    $logId = 'intern_' . (int)$m[1];
} else if (preg_match('/(?:LOG_?ID|USER):([^|]+)/i', $qr, $m)) {
    $value = trim($m[1]);
    if (preg_match('/LOG_?ID:/i', $qr)) {
        $logId = $value;
    } else {
        $username = $value;
    }
}

if (!$logId && !$username) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Invalid QR!']);
    exit;
}

if ((defined('KIOSK_MODE') && KIOSK_MODE === 'intern') || strpos($logId ?? '', 'intern_') === 0 || strpos($username ?? '', 'intern_') === 0) {
    $rawIdentifier = $qr; // e.g. TDTINTRN2-2452
    $cleanIdentifier = preg_replace('/^TDTINTRN/i', '', $qr); // e.g. 2-2452
    $db = getImsConnection();
    // Search strictly by i.qr_code (matching raw or clean string)
    $stmt = $db->prepare("SELECT i.id, i.first_name, i.last_name, i.email, i.profile_photo, i.face_embedding, d.name AS dept_name
                          FROM interns i
                          LEFT JOIN departments d ON i.department_id = d.id
                          WHERE (i.qr_code = ? OR i.qr_code = ?) AND i.status = 'Active'");
    if ($stmt === false) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'message' => 'Database error: ' . $db->error]);
        exit;
    }
    $stmt->bind_param('ss', $rawIdentifier, $cleanIdentifier);
    if (!$stmt->execute()) {
        $stmt->close();
        http_response_code(500);
        echo json_encode(['ok' => false, 'message' => 'Database query execution error']);
        exit;
    }
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'message' => 'Intern not found']);
        exit;
    }

    $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http');
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $profilePhotoUrl = null;
    if (!empty($row['profile_photo'])) {
        $imsUrl = getenv('IMS_URL') ?: null;
        if (!empty($imsUrl)) {
            $profilePhotoUrl = rtrim($imsUrl, '/') . "/uploads/photos/" . $row['profile_photo'];
        } else {
            if (preg_match('/:80\d\d$/', $host)) {
                $imsHost = preg_replace('/:80\d\d$/', ':8001', $host);
                $profilePhotoUrl = "{$scheme}://{$imsHost}/uploads/photos/" . $row['profile_photo'];
            } else {
                $profilePhotoUrl = "{$scheme}://{$host}/ims/uploads/photos/" . $row['profile_photo'];
            }
        }
    }

    $faceEmbedding = null;
    if (!empty($row['face_embedding'])) {
        $faceEmbedding = json_decode($row['face_embedding'], true);
    }

    // Check for open attendance session in MySQL
    $openSession = null;
    $todayDate = date('Y-m-d');
    $attStmt = $db->prepare("SELECT id, entry_date, time_in, time_out 
                             FROM dtr_entries 
                             WHERE intern_id = ? AND entry_date = ? AND time_out IS NULL AND is_archived = 0 
                             ORDER BY id DESC LIMIT 1");
    if ($attStmt !== false) {
        $attStmt->bind_param('is', $row['id'], $todayDate);
        if ($attStmt->execute()) {
            $attRow = $attStmt->get_result()->fetch_assoc();
            if ($attRow) {
                $openSession = [
                    'att_id' => $attRow['id'],
                    'timein' => $attRow['time_in'],
                    'date' => $attRow['entry_date']
                ];
            }
        }
        $attStmt->close();
    }

    $jsonResponse = json_encode([
        'ok' => true,
        'user' => [
            'log_id' => 'intern_' . $row['id'],
            'username' => 'intern_' . $row['id'],
            'name' => $row['first_name'] . ' ' . $row['last_name'],
            'profile_picture' => $profilePhotoUrl,
            'face_embedding' => $faceEmbedding,
            'role' => 'Intern',
            'department' => $row['dept_name'] ?? 'Internship',
            'open_session' => $openSession
        ]
    ]);
    header('Content-Length: ' . strlen($jsonResponse));
    echo $jsonResponse;
    if (ob_get_level()) ob_end_flush();
    exit;
}

// Employee path: resolve via hris-system's kiosk API instead of Supabase.
$employeeNo = $logId ?: $username;

[$hStatus, $hData, $hErr] = hris_kiosk_request(
    'GET',
    '/api/kiosk/resolve?employeeNo=' . urlencode((string) $employeeNo)
);

if ($hErr) {
    http_response_code(502);
    echo json_encode(['ok' => false, 'message' => 'Failed to reach HRIS server: ' . $hErr]);
    exit;
}

if ($hStatus !== 200 || !is_array($hData) || !($hData['ok'] ?? false)) {
    http_response_code($hStatus ?: 404);
    echo json_encode(['ok' => false, 'message' => $hData['message'] ?? 'Employee not found']);
    exit;
}

// hris-system's /api/kiosk/resolve response already matches this endpoint's
// contract (ok, user.{log_id,username,name,profile_picture,face_embedding,role,department,open_session}).
$jsonResponse = json_encode($hData);
header('Content-Length: ' . strlen($jsonResponse));
echo $jsonResponse;

if (ob_get_level()) {
    ob_end_flush();
}
