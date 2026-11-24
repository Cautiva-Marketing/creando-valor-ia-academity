import { Bot, ClipboardCheck, MessagesSquare, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: { absolute: 'Creando Valor IA™ · Practica la venta antes de hacerla de verdad' },
  description:
    'Entrenamiento comercial con compradores simulados por IA: practica tus conversaciones de venta y recibe una evaluación orientativa.',
};

const STEPS = [
  {
    icon: MessagesSquare,
    title: 'Conversa con un comprador simulado',
    body: 'Eliges un escenario y vendes como lo harías con un cliente real, desde el celular o la computadora.',
  },
  {
    icon: Bot,
    title: 'La IA responde con realismo',
    body: 'El comprador plantea objeciones y preguntas propias de tu mercado para que practiques sin riesgo.',
  },
  {
    icon: ClipboardCheck,
    title: 'Recibe una evaluación orientativa',
    body: 'Al terminar ves tus fortalezas y qué mejorar, para llegar mejor preparado a la próxima venta.',
  },
] as const;

/** Public landing (H10, FR-046): value proposition, how it works, AI notice, request access. No images (LCP). */
export default function LandingPage() {
  return (
    <div className="flex flex-col">
      <section className="mx-auto flex w-full max-w-5xl flex-col items-start gap-6 px-4 py-12 sm:py-20">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">
          Entrenamiento comercial con IA
        </p>
        <h1 className="max-w-3xl text-4xl sm:text-5xl">
          Practica la venta antes de hacerla de verdad
        </h1>
        <p className="max-w-2xl text-lg text-text-muted">
          Ensaya tus conversaciones con compradores simulados por inteligencia artificial y mejora
          tus cierres antes de hablar con clientes reales.
        </p>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button asChild size="lg">
            <Link href="/solicitar-acceso">Solicitar acceso</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/iniciar-sesion">Iniciar sesión</Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="como-funciona" className="border-y border-border bg-surface-sunken">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-12">
          <h2 id="como-funciona" className="text-3xl">
            Cómo funciona
          </h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-6"
              >
                <step.icon className="size-8 text-primary" aria-hidden="true" />
                <h3 className="text-xl">
                  <span className="sr-only">Paso {index + 1}: </span>
                  {step.title}
                </h3>
                <p className="text-text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        aria-labelledby="aviso-ia"
        className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-12"
      >
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 size-6 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex flex-col gap-2">
            <h2 id="aviso-ia" className="text-2xl">
              Uso responsable de la IA
            </h2>
            <p className="max-w-3xl text-text-muted">
              El comprador y la evaluación son generados por inteligencia artificial: son una
              práctica y una guía, no una calificación laboral. Tus conversaciones de práctica son
              privadas.{' '}
              <Link href="/aviso-ia" className="text-primary underline underline-offset-4">
                Lee el aviso de uso de IA
              </Link>
              .
            </p>
          </div>
        </div>
        <div>
          <Button asChild>
            <Link href="/solicitar-acceso">Solicitar acceso</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
