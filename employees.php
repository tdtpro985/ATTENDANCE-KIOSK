<?php
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

// Only return employees that have a matching account via log_id
$select = 'emp_id,name,role,dept_id,log_id,accounts!inner(log_id,username,qr_code,profile_picture,face),departments(name)';
$path = "rest/v1/employees?select={$select}&order=emp_id";

[$status, $data, $err] = supabase_request('GET', $path);

echo json_encode([
    'ok' => $status >= 200 && $status < 300,
    'status' => $status,
    'error' => $err,
    'data' => $data,
]);
