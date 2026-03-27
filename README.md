# HRIS Attendance App

This project contains the Expo frontend and PHP backend for QR-based attendance with face verification.

## Render Environment Setup

Do not commit your real `backend-php/.env` file.

Use [backend-php/.env.example](c:\Users\DJ\Downloads\NEW\tdt\myApp\backend-php\.env.example) as the template, then add the real values in your Render service environment variables:

- `FACE_VERIFY_MODE`
- `FACEPP_API_KEY`
- `FACEPP_API_SECRET`
- `LUXAND_API_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`

## Why Face Scan Fails On Production

If you see:

`No face recognition provider configured on server`

that means the backend is running, but Render does not yet have the required face-recognition environment variables.

## Render Steps

1. Open your Render service dashboard.
2. Go to `Environment`.
3. Add the variables listed above using the real values from your local `backend-php/.env`.
4. Save changes.
5. Redeploy or restart the service.

## Frontend Backend URL

The frontend backend base URL is configured in:

- [backend.ts](c:\Users\DJ\Downloads\NEW\tdt\myApp\src\config\backend.ts)
