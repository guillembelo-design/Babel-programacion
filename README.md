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

3. Si vas a usar Supabase, rellena:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

4. Crea las tablas en Supabase ejecutando el SQL de:

```bash
supabase/schema.sql
```

5. Arranca la aplicacion:

```bash
pnpm dev
```

La pantalla principal se abre directamente en `/`.

## Modo local

Si las variables de Supabase no estan configuradas, la V1 funciona igualmente usando `localStorage`.
Esto permite probar la programacion, peliculas, solapes y duplicado de dias sin backend.

## Modelo minimo

- `rooms`: salas de cine. La V1 crea Sala 1, Sala 2, Sala 3, Sala 4 y Sala 5.
- `movies`: titulo, duracion y cartel.
- `screenings`: semana, dia, sala, pelicula y hora de inicio.

La semana empieza siempre en viernes y se muestra de viernes a jueves.
