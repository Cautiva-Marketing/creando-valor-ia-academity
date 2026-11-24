// Deterministic server environment for unit tests. Never real secrets.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'sb_publishable_test';
process.env.NEXT_PUBLIC_SITE_URL ??= 'http://localhost:3000';
process.env.NEXT_PUBLIC_SUPPORT_EMAIL ??= 'soporte@ejemplo.test';
process.env.SUPABASE_SECRET_KEY ??= 'sb_secret_test_only';
process.env.SEND_EMAIL_HOOK_SECRET ??= 'v1,whsec_dGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQtdGVzdC1zZWM=';
process.env.SMTP_HOST ??= '127.0.0.1';
process.env.SMTP_PORT ??= '54325';
process.env.EMAIL_FROM ??= 'Creando Valor IA <no-responder@ejemplo.test>';
process.env.RATE_LIMIT_PEPPER ??= 'test-pepper-test-pepper-test-pepper';
