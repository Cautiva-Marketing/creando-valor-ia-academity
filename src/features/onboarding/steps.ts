/** Seller onboarding content (FR-034): at most 3 steps. */
export interface OnboardingStep {
  title: string;
  body: string;
  points: string[];
}

export const ONBOARDING_STEPS: readonly [OnboardingStep, OnboardingStep, OnboardingStep] = [
  {
    title: 'Te damos la bienvenida a Creando Valor IA™',
    body: 'Aquí practicas tus conversaciones de venta en un espacio seguro, antes de hacerlas con clientes reales.',
    points: [
      'Tu cuenta y tu espacio de práctica son personales.',
      'Puedes practicar a tu ritmo, desde el celular o la computadora.',
      'Nadie ve tus conversaciones de práctica.',
    ],
  },
  {
    title: 'Cómo funciona la práctica',
    body: 'Conversas con un comprador simulado por IA y, al terminar, recibes una evaluación orientativa.',
    points: [
      'Eliges un escenario y conversas como lo harías con un cliente.',
      'El comprador responde con objeciones y preguntas realistas.',
      'La evaluación te muestra fortalezas y qué mejorar; es una guía, no una calificación laboral.',
    ],
  },
  {
    title: 'Tu primer paso',
    body: 'Registra el producto o servicio que vendes: con él preparamos a tu cliente simulado.',
    points: [
      'Escribe su precio, beneficios y datos que el cliente pueda verificar.',
      'Luego agrega las objeciones que más escuchas.',
      'Con eso ya puedes hacer tu primera práctica.',
    ],
  },
];

export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;
