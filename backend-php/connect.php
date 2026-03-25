<?php
// Supabase "database connection" helper file.
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);
// This file only contains the configuration and helper functions to talk to Supabase.

// Load backend-php/.env so Face++ keys work even when PHP is started without start-system.ps1
$envCandidates = [
    __DIR__ . '/../.env',
    __DIR__ . '/.env',
];
foreach ($envCandidates as $envFile) {
    if (is_file($envFile) && is_readable($envFile)) {
        $lines = @file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines) {
            foreach ($lines as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#') continue;
                $eq = strpos($line, '=');
                if ($eq > 0) {
                    $k = trim(substr($line, 0, $eq));
                    $v = trim(substr($line, $eq + 1));
                    if (($v !== '' && ($v[0] === '"' || $v[0] === "'")) && substr($v, -1) === $v[0]) {
                        $v = substr($v, 1, -1);
                    }
                    if ($k !== '') putenv("$k=$v");
                }
            }
        }
    }
}

// --- Supabase config (from your project) ---
define('SUPABASE_URL', 'https://cgyqweheceduyrpxqvwd.supabase.co');

// Fallback anon key (publishable; safe to commit). This lets local dev work
// even when your PHP runtime doesn't have environment variables configured.
define('SUPABASE_PUBLIC_ANON_KEY', 'sb_publishable_MJmY9d0yFuPp6KtQ62stGw_lFHMnNAK');

// Prefer service role key (server-side) when available, otherwise anon key.
// IMPORTANT: never commit service role keys.
define(
    'SUPABASE_API_KEY',
    getenv('SUPABASE_SERVICE_ROLE_KEY')
        ?: (getenv('SUPABASE_ANON_KEY') ?: SUPABASE_PUBLIC_ANON_KEY)
);

// --- Supabase helper functions (inline) ---
function supabase_request(string $method, string $path, ?array $body = null, array $extraHeaders = []): array
{
    $url = rtrim(SUPABASE_URL, '/') . '/' . ltrim($path, '/');

    // Use curl if available, otherwise fallback to file_get_contents
    if (function_exists('curl_init')) {
        $ch = curl_init($url);

        $headers = array_merge([
            'Content-Type: application/json',
            'apikey: ' . SUPABASE_API_KEY,
            'Authorization: Bearer ' . SUPABASE_API_KEY,
        ], $extraHeaders);

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => strtoupper($method),
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 20, // 20 second timeout (increased for slow connections)
            CURLOPT_CONNECTTIMEOUT => 10,  // 10 second connection timeout (increased)
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);

        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }

        $responseBody = curl_exec($ch);
        $statusCode   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr      = curl_error($ch);
        $curlErrNo    = curl_errno($ch);

        if ($curlErr) {
            // Provide more detailed error messages
            $errorMsg = $curlErr;
            if ($curlErrNo === CURLE_OPERATION_TIMEOUTED || $curlErrNo === CURLE_OPERATION_TIMEDOUT) {
                $errorMsg = "Connection to Supabase timed out. Check your internet connection.";
            } elseif ($curlErrNo === CURLE_COULDNT_CONNECT) {
                $errorMsg = "Could not connect to Supabase. Check your internet connection and Supabase URL.";
            } elseif ($curlErrNo === CURLE_SSL_CONNECT_ERROR) {
                $errorMsg = "SSL connection error. Check Supabase URL and SSL configuration.";
            }
            error_log("Supabase curl error (code $curlErrNo): $errorMsg");
            return [$statusCode ?: 0, null, $errorMsg];
        }
    } else {
        // Fallback to file_get_contents
        $headers = [
            'Content-Type: application/json',
            'apikey: ' . SUPABASE_API_KEY,
            'Authorization: Bearer ' . SUPABASE_API_KEY,
        ];
        $headers = array_merge($headers, $extraHeaders);

        $content = null;
        if ($body !== null) {
            $content = json_encode($body);
            $headers[] = 'Content-Length: ' . strlen($content);
        }

        $options = [
            'http' => [
                'method' => strtoupper($method),
                'header' => implode("\r\n", $headers),
                'ignore_errors' => true,
                'timeout' => 20, // 20 second timeout (increased for slow connections)
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
            ]
        ];

        if ($content !== null) {
            $options['http']['content'] = $content;
        }

        $context = stream_context_create($options);
        $responseBody = @file_get_contents($url, false, $context);
        
        if ($responseBody === false) {
            $lastError = error_get_last();
            $errorMsg = 'Failed to connect to Supabase';
            if ($lastError) {
                $errorMsg .= ': ' . $lastError['message'];
            }
            return [0, null, $errorMsg];
        }

        // Extract status code from response headers
        $statusCode = 200;
        if (isset($http_response_header)) {
            foreach ($http_response_header as $header) {
                if (preg_match('/^HTTP\/\d\.\d\s+(\d+)/', $header, $matches)) {
                    $statusCode = (int)$matches[1];
                    break;
                }
            }
        }
    }

    $decoded = json_decode($responseBody, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        return [$statusCode, $responseBody, null];
    }

    return [$statusCode, $decoded, null];
}

function supabase_insert(string $table, array $row): array
{
    return supabase_request('POST', "rest/v1/{$table}", $row, [
        'Prefer: return=representation',
    ]);
}

function supabase_select(string $table, array $filters = [], string $select = '*', string $orderBy = ''): array
{
    $path = "rest/v1/{$table}?select={$select}";
    
    // Add filters
    foreach ($filters as $key => $value) {
        $path .= "&{$key}=eq." . urlencode($value);
    }
    
    // Add ordering
    if ($orderBy !== '') {
        $path .= "&order={$orderBy}";
    }
    
    return supabase_request('GET', $path);
}

function supabase_select_single(string $table, array $filters = [], string $select = '*'): array
{
    $path = "rest/v1/{$table}?select={$select}";
    
    foreach ($filters as $key => $value) {
        $path .= "&{$key}=eq." . urlencode($value);
    }
    
    [$status, $data, $err] = supabase_request('GET', $path, null, [
        'Accept: application/vnd.pgrst.object+json',
    ]);
    
    return [$status, $data, $err];
}

// No endpoint / echo logic here on purpose.
// Include this file from other PHP scripts to use supabase_request() / supabase_insert().

// No endpoint / echo logic here on purpose.
// Include this file from other PHP scripts to use supabase_request() / supabase_insert().
