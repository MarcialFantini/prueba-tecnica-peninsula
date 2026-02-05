# Peninsula - Servicio de Transacciones Bancarias

Proyecto NestJS optimizado para alta concurrencia con soporte para **Bloqueo Optimista** y **Transacciones Atómicas SQL**.

## Cómo Levantar el Proyecto

### 1. Variables de Entorno (`.env`)
Antes de empezar, asegúrate de tener configurado tu archivo `.env`. Puedes usar `.env.example` como referencia.

**Variables críticas:**
- `PORT`: Puerto de la aplicación (default: 3000).
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: Conexión a la DB de desarrollo.
- `DB_TEST_PORT`, `DB_TEST_NAME`: Conexión separada para los tests.

---

### 2. Infraestructura con Docker

El proyecto usa `docker-compose.yml` con **Profiles** para separar entornos:

#### Modo Desarrollo (Base de datos + pgAdmin)
Esto levanta PostgreSQL en el puerto **5432** y pgAdmin en el **5050**.
```bash
docker compose --profile dev up -d
```

#### Modo Test (Base de datos de testing)
Levanta una instancia de PostgreSQL en el puerto **5433** (aislada para no borrar tus datos de dev).
```bash
docker compose --profile test up -d postgres-test
```

#### Limpiar todo
```bash
docker compose --profile dev --profile test down
```

---

### 3. Modos de Ejecución

#### Desarrollo (Watch Mode)
Levanta la app y recarga automáticamente al hacer cambios.
```bash
npm install
npm run start:dev
```

#### Build (Producción)
Compila el código TypeScript a JavaScript optimizado.
```bash
npm run build
npm run start:prod
```

#### Testing
Este proyecto tiene tests especiales de concurrencia.

**Correr todos los tests:**
```bash
npm run test
```

**Correr tests de Concurrencia (requiere DB de Test arriba):**
```bash
npm run test:concurrency
```

---

## Arquitectura de Transacciones

El proyecto implementa dos estrategias de seguridad:
1.  **Idempotencia:** Evita que una misma petición se ejecute dos veces (clauve `idempotencyKey`).
2.  **Atomicidad SQL:** Las validaciones de saldo y actualizaciones se hacen en una sola query atómica para evitar " race conditions".

## Herramientas Útiles
- **pgAdmin:** `http://localhost:5050` (User/Pass en el `.env`)
- **API Base URL:** `http://localhost:3000`
- **Docs de Endpoints:** `/accounts`, `/accounts/:id/balance`, etc.
