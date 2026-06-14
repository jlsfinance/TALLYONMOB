import { NextResponse } from 'next/server';

export function success(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function error(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

export function forbidden(message = 'Forbidden') {
  return NextResponse.json({ ok: false, error: message }, { status: 403 });
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ ok: false, error: message }, { status: 404 });
}

export function serverError(message = 'Internal server error') {
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}
