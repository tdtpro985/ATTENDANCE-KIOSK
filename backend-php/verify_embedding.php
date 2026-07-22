<?php
// Face Embedding verification endpoint with multi-angle support.

ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, Accept');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/FaceVerificationHelper.php';

$input = json_decode(file_get_contents('php://input'), true) ?? $_REQUEST;

$userId = isset($input['log_id']) ? trim((string) $input['log_id']) : null;
$liveEmbeddingRaw = $input['live_embedding'] ?? null;
$liveImageB64 = $input['live_image_b64'] ?? null;
$engine = isset($input['engine']) ? trim((string) $input['engine']) : '';
$faceServerUrl = getenv('FACE_SERVER_URL') ?: 'http://127.0.0.1:5001';
$faceServerUrl = str_replace('localhost', '127.0.0.1', $faceServerUrl); // Force IPv4 for Windows curl compatibility

if ($userId === 'warmup') {
    if ($liveImageB64) {
        $ch = curl_init($faceServerUrl . '/embed_single');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['image' => $liveImageB64, 'model' => 'buffalo_l']));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_TIMEOUT, 3);
        curl_exec($ch);
    }
    http_response_code(200);
    echo json_encode(['ok' => true, 'message' => 'Warmup completed.']);
    exit;
}

if (!$userId) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Missing parameter (log_id)']);
    exit;
}

[$faceData, $errorMsg] = fetchUserFaceData($userId, $engine);

if ($errorMsg) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => $errorMsg]);
    exit;
}

$isServerMode = !empty($liveImageB64);
$targetModel = 'buffalo_sc';
$storedEmbeddingStr = null;

if ($isServerMode) {
    // Auto-fallback: Prefer large embedding, but fallback to regular if missing
    if (!empty($faceData['face_embedding_large'])) {
        $targetModel = 'buffalo_l';
        $storedEmbeddingStr = $faceData['face_embedding_large'];
    } else if (!empty($faceData['face_embedding'])) {
        $targetModel = 'buffalo_sc';
        $storedEmbeddingStr = $faceData['face_embedding'];
    }
} else {
    // Local mode always uses regular embedding
    $storedEmbeddingStr = $faceData['face_embedding'] ?? null;
}

if (!$storedEmbeddingStr) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'message' => 'No face embedding registered for this user']);
    exit;
}

$liveEmbedding = null;
if ($liveImageB64) {
    // Forward crop base64 to local Python ML server
    $ch = curl_init($faceServerUrl . '/embed_single');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['image' => $liveImageB64, 'model' => $targetModel]));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    $errorMsg = 'Server-side face extraction failed.';
    if ($response) {
        $resData = json_decode($response, true);
        if ($httpCode === 200 && isset($resData['ok']) && $resData['ok'] && isset($resData['embedding'])) {
            $liveEmbedding = $resData['embedding'];
        } else if (isset($resData['error'])) {
            $errorMsg = $resData['error'];
        }
    }
    
    if (!$liveEmbedding) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'message' => $errorMsg]);
        exit;
    }
} else if ($liveEmbeddingRaw) {
    if (is_array($liveEmbeddingRaw)) {
        $liveEmbedding = $liveEmbeddingRaw;
    } else if (is_string($liveEmbeddingRaw)) {
        $liveEmbedding = json_decode($liveEmbeddingRaw, true);
    }
}

if (!is_array($liveEmbedding) || count($liveEmbedding) === 0) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Invalid live_embedding format (must be array of numbers)']);
    exit;
}

$storedEmbedding = json_decode($storedEmbeddingStr, true);
if (!is_array($storedEmbedding)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => 'Stored embedding corrupted.']);
    exit;
}

// Detect format: flat [512] or multi-angle [[512], [512], ...]
$isMultiAngle = count($storedEmbedding) > 0 && is_array($storedEmbedding[0]);
$angleEmbeddings = $isMultiAngle ? $storedEmbedding : [$storedEmbedding];

// Only the frontal pose (index 0 — "Look Straight", the same pose used for the
// profile picture) is used for matching. The other captured angles (far/left/
// right/up) are intentionally off-axis for liveness/enrollment purposes and are
// not comparable to a frontal live capture, so they are not used as a match gate.
$frontalEmbedding = $angleEmbeddings[0] ?? null;

$maxSimilarity = -1;
$bestAngleIndex = -1;
$perAngleScores = [];

if (is_array($frontalEmbedding) && count($frontalEmbedding) === count($liveEmbedding)) {
    $dot = 0;
    $normA = 0;
    $normB = 0;
    for ($i = 0; $i < count($liveEmbedding); $i++) {
        $dot += $liveEmbedding[$i] * $frontalEmbedding[$i];
        $normA += $liveEmbedding[$i] * $liveEmbedding[$i];
        $normB += $frontalEmbedding[$i] * $frontalEmbedding[$i];
    }

    $denom = sqrt($normA) * sqrt($normB);
    $maxSimilarity = $denom === 0.0 ? 0 : $dot / $denom;
    $bestAngleIndex = 0;
}
$perAngleScores[] = $maxSimilarity;

$matchThreshold = 0.52;

$isMatch = $maxSimilarity >= $matchThreshold;

$message = null;
$hint = null;
if (!$isMatch) {
    $message = "Verification failed.";
    $hint = "Please try again.";
}

echo json_encode([
    'ok' => $isMatch,
    'log_id' => $userId,
    'username' => $faceData['username'],
    'similarity' => $maxSimilarity,
    'threshold' => $matchThreshold,
    'is_match' => $isMatch,
    'verified' => $isMatch,
    'message' => $message,
    'hint' => $hint,
    'decision' => $isMatch ? 'PASS' : 'FAIL',
    'angle_count' => 1,
    'best_angle_index' => $bestAngleIndex,
    'per_angle_scores' => $perAngleScores,
    'agreeing_angles' => $isMatch ? 1 : 0,
    'model_used' => $isServerMode ? $targetModel : 'local_buffalo_sc'
]);
