<?php
// Increase memory limit for large datasets (e.g. many base64 images)
ini_set('memory_limit', '512M');
// Enable errors temporarily to catch fatal crashes in the output
ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

require_once __DIR__ . '/connect.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization, apikey');
header('Access-Control-Allow-Methods: GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['ok' => true]);
    exit;
}

// Return all employees and their associated account/dept data
$page = isset($_GET['page']) ? (int)$_GET['page'] : 0;
$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 1000;
$offset = $page * $limit;

$select = 'emp_id,name,role,dept_id,log_id,accounts(log_id,username,qr_code,profile_picture),departments(name)';
$path = "rest/v1/employees?select={$select}&order=emp_id&limit={$limit}&offset={$offset}";

[$status, $data, $err] = supabase_request('GET', $path);

// Compress profile pictures to save mobile storage
if (is_array($data)) {
    foreach ($data as &$employee) {
        if (isset($employee['accounts'])) {
            // Handle both object and array formats
            if (isset($employee['accounts']['profile_picture'])) {
                $img = $employee['accounts']['profile_picture'];
                if ($img && strlen($img) > 100) {
                    // Extreme compression for list view: 80px width, 15% quality
                    // This keeps each entry ~1.5KB, allowing 10k+ employees in 20MB cache.
                    $employee['accounts']['profile_picture'] = compress_base64_image($img, 80, 15);
                }
            } else if (is_array($employee['accounts'])) {
                foreach ($employee['accounts'] as &$account) {
                    if (isset($account['profile_picture'])) {
                        $img = $account['profile_picture'];
                        if ($img && strlen($img) > 100) {
                            $account['profile_picture'] = compress_base64_image($img, 80, 15);
                        }
                    }
                }
            }
        }
    }
}

echo json_encode([
    'ok' => $status >= 200 && $status < 300,
    'status' => $status,
    'error' => $err,
    'data' => $data,
]);
