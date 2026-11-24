import { Forbidden } from '@/components/states/forbidden';

export const metadata = { title: 'Sin permiso' };

/**
 * Rendered with HTTP 403 by `forbidden()` (guards.ts). Guards only run inside the `(app)` group, and
 * Next renders this boundary inside that layout, so the app shell already provides `<main>`: adding
 * another one would duplicate the landmark and the `#contenido` id.
 */
export default function ForbiddenPage() {
  return <Forbidden homeHref="/" />;
}
