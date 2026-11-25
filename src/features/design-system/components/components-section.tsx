'use client';

import { Inbox, MoreHorizontal, Plus, Settings, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CautivaStrip } from '@/components/ui/cautiva-strip';
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetTitle,
  BottomSheetTrigger,
} from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/chip';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Gauge } from '@/components/ui/gauge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScoreRing } from '@/components/ui/score-ring';
import { ScoreTrendChart } from '@/components/ui/score-trend-chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { Switch } from '@/components/ui/switch';
import { DataTable } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** FR-043 base components (22) + label, form-field and pagination. */
export const DOCUMENTED_COMPONENTS = [
  'button',
  'input',
  'textarea',
  'select',
  'checkbox',
  'radio',
  'switch',
  'badge',
  'card',
  'table',
  'tabs',
  'dialog',
  'sheet',
  'toast',
  'tooltip',
  'skeleton',
  'empty-state',
  'progress',
  'gauge',
  'score-ring',
  'avatar',
  'menu',
  'combobox',
] as const;

const COMBOBOX_DEMO_OPTIONS = [
  { value: 'America/Lima', label: 'America/Lima' },
  { value: 'America/Bogota', label: 'America/Bogota' },
  { value: 'America/Mexico_City', label: 'America/Mexico City' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid' },
];

function ComboboxDemo({ id }: { id: string }) {
  const [value, setValue] = useState('America/Lima');
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Zona horaria (con búsqueda)</Label>
      <Combobox
        id={id}
        options={COMBOBOX_DEMO_OPTIONS}
        value={value}
        onValueChange={setValue}
        searchPlaceholder="Buscar zona"
        className="sm:w-64"
      />
    </div>
  );
}

/** Static focus ring to show the "foco" state without moving real focus. */
const FOCUS_PREVIEW = 'outline-3 outline-offset-2 outline-focus-ring';

function Demo({
  component,
  title,
  children,
  className,
}: {
  component: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      data-component={component}
      className="flex flex-col gap-3 border-t border-border pt-4"
    >
      <h4 id={id} className="text-lg">
        {title}
      </h4>
      <div className={cn('flex flex-col gap-3', className)}>{children}</div>
    </section>
  );
}

function StateRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-24 shrink-0 text-sm text-text-muted">{label}</span>
      {children}
    </div>
  );
}

interface SampleRow {
  id: string;
  name: string;
  status: string;
  score: number;
}

const SAMPLE_ROWS: SampleRow[] = [
  { id: '1', name: 'Ana Torres', status: 'Activa', score: 86 },
  { id: '2', name: 'Bruno Díaz', status: 'Suspendida', score: 54 },
];

function ThemePanel({ theme }: { theme: 'light' | 'dark' }) {
  const label = theme === 'light' ? 'claro' : 'oscuro';
  const ids = { email: useId(), notes: useId(), switch: useId(), terms: useId() };

  return (
    <section
      aria-label={`Componentes en tema ${label}`}
      data-testid={`panel-${theme}`}
      className={cn(
        theme,
        'flex min-w-0 flex-col gap-6 rounded-xl border border-border bg-surface p-4 text-text sm:p-6',
      )}
    >
      <h3 className="text-xl">Tema {label}</h3>

      <Demo component="button" title="Botón">
        <div className="flex flex-wrap gap-2">
          <Button>Primario</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="accent">Acento</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button variant="destructive">
            <Trash2 aria-hidden="true" />
            Destructivo
          </Button>
          <Button variant="link">Enlace</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Pequeño</Button>
          <Button size="md">Mediano</Button>
          <Button size="lg">Grande</Button>
          <Button size="icon" aria-label="Agregar">
            <Plus aria-hidden="true" />
          </Button>
        </div>
        <StateRow label="Foco">
          <Button className={FOCUS_PREVIEW} tabIndex={-1}>
            Con foco
          </Button>
        </StateRow>
        <StateRow label="Deshabilitado">
          <Button disabled>No disponible</Button>
        </StateRow>
        <StateRow label="Carga">
          <Button loading loadingLabel="Guardando…">
            Guardar
          </Button>
        </StateRow>
      </Demo>

      <Demo component="input" title="Input, label y form-field">
        <FormField id={ids.email} label="Correo" description="Te escribiremos aquí." required>
          {(control) => <Input {...control} type="email" placeholder="nombre@empresa.pe" />}
        </FormField>
        <FormField
          id={`${ids.email}-error`}
          label="Correo con error"
          errors={['Escribe un correo válido.']}
        >
          {(control) => <Input {...control} defaultValue="ana@" />}
        </FormField>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids.email}-disabled`}>Deshabilitado</Label>
          <Input id={`${ids.email}-disabled`} disabled defaultValue="No editable" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids.email}-focus`}>Con foco</Label>
          <Input
            id={`${ids.email}-focus`}
            className={FOCUS_PREVIEW}
            tabIndex={-1}
            defaultValue="Foco visible"
          />
        </div>
      </Demo>

      <Demo component="textarea" title="Textarea autoajustable">
        <FormField id={ids.notes} label="Mensaje" description="Crece mientras escribes.">
          {(control) => <Textarea {...control} defaultValue={'Primera línea\nSegunda línea'} />}
        </FormField>
      </Demo>

      <Demo component="select" title="Select">
        <div className="flex flex-col gap-1.5">
          <Label id={`${ids.email}-tz`}>Zona horaria</Label>
          <Select defaultValue="lima">
            <SelectTrigger aria-labelledby={`${ids.email}-tz`} className="sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lima">América/Lima</SelectItem>
              <SelectItem value="bogota">América/Bogotá</SelectItem>
              <SelectItem value="madrid">Europa/Madrid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Demo>

      <Demo component="combobox" title="Combobox">
        <ComboboxDemo id={`${ids.email}-combobox`} />
      </Demo>

      <Demo component="checkbox" title="Checkbox">
        <div className="flex items-center gap-3">
          <Checkbox id={ids.terms} defaultChecked />
          <Label htmlFor={ids.terms}>Acepto los términos</Label>
        </div>
        <div className="flex items-center gap-3">
          <Checkbox id={`${ids.terms}-off`} disabled />
          <Label htmlFor={`${ids.terms}-off`}>Deshabilitado</Label>
        </div>
        <div className="flex items-center gap-3">
          <Checkbox id={`${ids.terms}-err`} aria-invalid />
          <Label htmlFor={`${ids.terms}-err`}>Con error</Label>
        </div>
      </Demo>

      <Demo component="radio" title="Radio">
        <RadioGroup defaultValue="mensual" aria-label="Periodo">
          {[
            ['diario', 'Diario'],
            ['mensual', 'Mensual'],
          ].map(([value, text]) => (
            <div key={value} className="flex items-center gap-3">
              <RadioGroupItem id={`${ids.terms}-${value}`} value={value!} />
              <Label htmlFor={`${ids.terms}-${value}`}>{text}</Label>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <RadioGroupItem id={`${ids.terms}-anual`} value="anual" disabled />
            <Label htmlFor={`${ids.terms}-anual`}>Anual (deshabilitado)</Label>
          </div>
        </RadioGroup>
      </Demo>

      <Demo component="switch" title="Switch">
        <div className="flex items-center gap-3">
          <Switch id={ids.switch} defaultChecked />
          <Label htmlFor={ids.switch}>Recibir avisos</Label>
        </div>
        <div className="flex items-center gap-3">
          <Switch id={`${ids.switch}-off`} disabled />
          <Label htmlFor={`${ids.switch}-off`}>Deshabilitado</Label>
        </div>
      </Demo>

      <Demo component="badge" title="Tag / badge">
        <div className="flex flex-wrap gap-2">
          {(['neutral', 'primary', 'accent', 'success', 'warning', 'danger', 'info'] as const).map(
            (variant) => (
              <Badge key={variant} variant={variant}>
                {variant}
              </Badge>
            ),
          )}
        </div>
      </Demo>

      <Demo component="card" title="Card">
        <Card>
          <CardHeader>
            <CardTitle as="h5">Simulación de venta</CardTitle>
            <CardDescription>Comprador: gerente de logística.</CardDescription>
          </CardHeader>
          <CardContent>Practica la apertura y el descubrimiento de necesidades.</CardContent>
          <CardFooter>
            <Button size="sm">Empezar</Button>
          </CardFooter>
        </Card>
      </Demo>

      <Demo component="table" title="Tabla responsive">
        <DataTable
          caption="Vendedores de ejemplo"
          rows={SAMPLE_ROWS}
          rowKey={(row) => row.id}
          mobileTitle={(row) => row.name}
          columns={[
            { key: 'name', header: 'Nombre', cell: (row) => row.name },
            {
              key: 'status',
              header: 'Estado',
              cell: (row) => (
                <Badge variant={row.status === 'Activa' ? 'success' : 'warning'}>
                  {row.status}
                </Badge>
              ),
            },
            { key: 'score', header: 'Puntaje', cell: (row) => row.score },
          ]}
        />
      </Demo>

      <Demo component="tabs" title="Tabs">
        <Tabs defaultValue="resumen">
          <TabsList aria-label="Secciones de ejemplo">
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="detalle">Detalle</TabsTrigger>
            <TabsTrigger value="off" disabled>
              Deshabilitada
            </TabsTrigger>
          </TabsList>
          <TabsContent value="resumen">Contenido del resumen.</TabsContent>
          <TabsContent value="detalle">Contenido del detalle.</TabsContent>
        </Tabs>
      </Demo>

      <Demo component="dialog" title="Diálogo">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary" className="self-start">
              Abrir diálogo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Revocar la invitación?</DialogTitle>
              <DialogDescription>El enlace dejará de funcionar.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancelar</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="destructive">Revocar</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Demo>

      <Demo component="sheet" title="Sheet / bottom-sheet móvil" className="flex-row flex-wrap">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="secondary">Abrir sheet</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
              <SheetDescription>Ajusta lo que ves en la lista.</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
        <BottomSheet>
          <BottomSheetTrigger asChild>
            <Button variant="secondary">Abrir bottom-sheet</Button>
          </BottomSheetTrigger>
          <BottomSheetContent>
            <BottomSheetTitle className="font-display text-xl font-semibold">
              Acciones
            </BottomSheetTitle>
            <BottomSheetDescription className="text-text-muted">
              Desliza hacia abajo para cerrar.
            </BottomSheetDescription>
          </BottomSheetContent>
        </BottomSheet>
      </Demo>

      <Demo component="toast" title="Toast" className="flex-row flex-wrap">
        <Button variant="secondary" onClick={() => toast.success('Invitación enviada.')}>
          Toast de éxito
        </Button>
        <Button variant="secondary" onClick={() => toast.error('No pudimos guardar los cambios.')}>
          Toast de error
        </Button>
      </Demo>

      <Demo component="tooltip" title="Tooltip">
        <Tooltip content="Configura tu cuenta">
          <Button size="icon" variant="ghost" aria-label="Configuración" className="self-start">
            <Settings aria-hidden="true" />
          </Button>
        </Tooltip>
      </Demo>

      <Demo component="skeleton" title="Skeleton">
        <div className="flex items-center gap-3" aria-hidden="true">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </Demo>

      <Demo component="empty-state" title="Empty state">
        <EmptyState
          icon={Inbox}
          title="Aún no hay solicitudes"
          description="Cuando alguien pida acceso aparecerá aquí."
          action={<Button size="sm">Ver invitaciones</Button>}
        />
      </Demo>

      <Demo component="progress" title="Barra de progreso">
        <Progress value={65} aria-label="Cuota mensual usada" />
      </Demo>

      <Demo component="gauge" title="Gauge" className="flex-row flex-wrap items-end">
        <Gauge value={72} label="Desempeño general" />
        <Gauge value={35} label="Manejo de objeciones" />
      </Demo>

      <Demo
        component="score-ring"
        title="Anillo de puntaje"
        className="flex-row flex-wrap items-center"
      >
        <ScoreRing value={88} label="Puntaje de la simulación" size="sm" />
        <ScoreRing value={64} label="Puntaje del módulo" />
        <ScoreRing value={41} label="Puntaje de práctica" size="lg" />
      </Demo>

      <Demo component="chip" title="Chip (002)" className="flex-row flex-wrap">
        <Chip>Pregunta por el plazo</Chip>
        <Chip variant="soft">Resume su necesidad</Chip>
        <Chip selected>Conoce</Chip>
        <Chip selected={false}>Aumenta</Chip>
      </Demo>

      <Demo component="score-trend-chart" title="Gráfico de evolución (002)">
        <ScoreTrendChart
          title={`Evolución de ejemplo (${label})`}
          points={[
            { label: '3 nov', score: 54, detail: 'Lote en Lurín (v1)' },
            { label: '10 nov', score: 66, detail: 'Lote en Lurín (v2)' },
            { label: '17 nov', score: 72, detail: 'Kit de herramientas (v1)' },
            { label: '24 nov', score: 81, detail: 'Lote en Lurín (v2)' },
          ]}
        />
      </Demo>

      <Demo component="cautiva-strip" title="Franja C.A.U.T.I.V.A.™ (002)">
        <CautivaStrip
          title={`Promedio por etapa (${label})`}
          stages={[
            { stage: 'conoce', label: 'Conoce', average: 82 },
            { stage: 'aumenta', label: 'Aumenta', average: 64 },
            { stage: 'une', label: 'Une', average: null },
            { stage: 'transforma', label: 'Transforma', average: 64 },
            { stage: 'innova', label: 'Innova', average: 71 },
            { stage: 'vende', label: 'Vende', average: 77 },
            { stage: 'asegura', label: 'Asegura', average: 90 },
          ]}
        />
      </Demo>

      <Demo component="highlight" title="Cita resaltada (token highlight, 002)">
        <p className="max-w-prose self-end rounded-lg rounded-br-sm bg-highlight px-4 py-2 text-on-highlight ring-2 ring-accent">
          ¿Qué es lo más importante para usted al elegir un lote?
        </p>
        <p className="text-sm text-text-muted">
          Mensaje citado como evidencia en el resultado (FR-047), con “Volver al criterio”.
        </p>
      </Demo>

      <Demo component="avatar" title="Avatar" className="flex-row flex-wrap items-center">
        {['Ana Torres', 'Ñandú Pérez', 'Óscar Ruiz', 'María José Ríos', 'Zoe'].map(
          (name, index) => (
            <div key={name} className="flex items-center gap-2">
              <Avatar userId={`ejemplo-${index}-${name}`} name={name} />
              <span className="text-sm">{name}</span>
            </div>
          ),
        )}
      </Demo>

      <Demo component="menu" title="Menú">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="self-start">
              <MoreHorizontal aria-hidden="true" />
              Acciones
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem>Reenviar</DropdownMenuItem>
            <DropdownMenuItem disabled>Duplicar</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-danger">Revocar</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Demo>

      <Demo component="pagination" title="Paginación">
        <Pagination
          page={2}
          pageCount={5}
          hrefFor={(page) => `/design?pagina=${page}`}
          label={`Paginación de ejemplo (${label})`}
        />
      </Demo>
    </section>
  );
}

export function ComponentsSection() {
  return (
    <section
      aria-labelledby="componentes"
      className="flex flex-col gap-6"
      data-testid="components-section"
    >
      <div className="flex flex-col gap-2">
        <h2 id="componentes" className="text-2xl">
          Componentes
        </h2>
        <p className="text-text-muted">
          Cada panel fuerza su tema. Los elementos superpuestos (diálogo, sheet, toast, tooltip,
          menú) se abren sobre la página con el tema activo.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <ThemePanel theme="light" />
        <ThemePanel theme="dark" />
      </div>
    </section>
  );
}
