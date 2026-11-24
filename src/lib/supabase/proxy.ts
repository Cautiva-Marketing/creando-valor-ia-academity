import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import type { Database } from './database.types';

/**
 * Refreshes the Supabase session inside `proxy.ts` and copies refreshed cookies to the response.
 * Returns whether the request carries an authenticated user (optimistic check only: the real
 * authorization happens in the server with getRequestContext()).
 */
export async function refreshSession(
  request: NextRequest,
  makeResponse: () => NextResponse,
): Promise<{ response: NextResponse; hasUser: boolean }> {
  let response = makeResponse();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = makeResponse();
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  return { response, hasUser: Boolean(data?.claims?.sub) };
}
