# Babel Programacion

Aplicacion web para gestionar la programacion semanal de Cines Babel.

## Stack

- Next.js con App Router
- React
- TypeScript
- Tailwind CSS
- Supabase
- Preparada para Vercel

## Ejecutar en local

1. Instala dependencias:

```bash
pnpm install
```

2. Crea el archivo de entorno:

```bash
cp .env.example .env.local
```

3. Configura Supabase:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

La app requiere Supabase Auth con un usuario interno para poder acceder.

4. Crea las tablas en Supabase ejecutando el SQL de:

```bash
supabase/schema.sql
```

5. Activa las politicas de seguridad ejecutando en Supabase SQL Editor:

```bash
supabase/rls-policies.sql
```

6. Arranca la aplicacion:

```bash
pnpm dev
```

La pantalla principal se abre directamente en `/`.

## Acceso

Babel Programacion requiere login con Supabase Auth. Crea los usuarios del equipo desde el panel de Supabase; la app no permite registro publico.

## Modelo minimo

- `rooms`: salas de cine. La V1 crea Sala 1, Sala 2, Sala 3, Sala 4 y Sala 5.
- `movies`: titulo, duracion y cartel.
- `screenings`: semana, dia, sala, pelicula y hora de inicio.

La semana empieza siempre en viernes y se muestra de viernes a jueves.
