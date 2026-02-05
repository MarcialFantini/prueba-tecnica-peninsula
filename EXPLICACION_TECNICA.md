# Memoria Técnica y Guía de Ejecución

Este documento detalla el razonamiento técnico, las decisiones de arquitectura y las instrucciones para ejecutar y probar la solución entregada para la prueba técnica.

## 📋 Índice

- [1. Razonamiento Técnico y Decisiones de Diseño](#1-razonamiento-técnico-y-decisiones-de-diseño)
  - [1.1. Enfoque de Concurrencia: Optimistic Locking](#11-enfoque-de-concurrencia-optimistic-locking)
  - [1.2. Lenguaje y Framework: TypeScript & NestJS](#12-lenguaje-y-framework-typescript--nestjs)
- [2. Arquitectura de Servicios y Flujo de Datos](#2-arquitectura-de-servicios-y-flujo-de-datos)
  - [2.1. AccountService (Fachada)](#21-accountservice-fachada)
  - [2.2. TransactionExecutorService (Core Lógico)](#22-transactionexecutorservice-core-lógico)
  - [2.3. RetryStrategyService (Manejo de Resiliencia)](#23-retrystrategyservice-manejo-de-resiliencia)
- [3. Diseño de Base de Datos](#3-diseño-de-base-de-datos)
  - [3.1. Entidades Principales](#31-entidades-principales)
- [4. Manejo de Errores](#4-manejo-de-errores)
- [5. Validación y Cobertura de Tests](#5-validación-y-concurrencia-y-estrés)
  - [5.1. Pruebas de Concurrencia y Estrés](#51-pruebas-de-concurrencia-y-estrés)
  - [5.2. Pruebas Funcionales y Unitarias](#52-pruebas-funcionales-y-unitarias)
- [6. Instrucciones de Ejecución y Entorno](#6-instrucciones-de-ejecución-y-entorno)
  - [6.1. Requisitos del Sistema](#61-requisitos-del-sistema)
  - [6.2. Variables de Entorno](#62-variables-de-entorno)
  - [6.3. Comandos de Gestión (Docker + App)](#63-comandos-de-gestión-docker--app)
- [7. Documentación de API (Swagger) 🌊](#7-documentación-de-api-swagger-)
- [8. Referencia Rápida de API](#8-referencia-rápida-de-api)

---

## 1. Razonamiento Técnico y Decisiones de Diseño

### 1.1. Enfoque de Concurrencia: Optimistic Locking
Para resolver el desafío de las transacciones bancarias concurrentes y evitar inconsistencias (*Race Conditions* y *Lost Updates*), se optó por una estrategia de **Control de Concurrencia Optimista (Optimistic Locking)**.

**Justificación vs. Event Sourcing:**
Si bien *Event Sourcing* permite una trazabilidad perfecta mediante un log de inserciones (append-only), introduce una complejidad de infraestructura considerable. Para esta prueba, el enfoque híbrido de **Actualizaciones Atómicas con Versionado** ofrece el mejor balance entre robustez, consistencia de datos y simplicidad de implementación.

**Mecanismo Implementado:**
1.  **Versionado**: Cada cuenta tiene una columna `version` que actúa como guardián de consistencia.
2.  **Atomicidad**: Las actualizaciones se ejecutan solo explícitamente si la versión en la base de datos coincide con la leída previamente (`UPDATE ... WHERE version = X`).
3.  **Resiliencia**: En caso de colisión (dos transacciones intentando modificar la misma versión), el sistema aplica una estrategia de **Reintento con Backoff Exponencial**, garantizando que la operación se procese eventualmente sin error para el usuario.

### 1.2. Lenguaje y Framework: TypeScript & NestJS
**TypeScript** fue seleccionado para garantizar la seguridad de tipos, crítica en sistemas donde el manejo de dinero requiere precisión decimal y estructuras de datos estrictas.

Se utilizó **NestJS** por su arquitectura modular y sus patrones de diseño incorporados:
-   **Inyección de Dependencias (DI)**: Facilita el desacoplamiento y mejora la testabilidad unitaria.
-   **Separación de Responsabilidades**:
    -   `Controller`: Capa de entrada/salida HTTP.
    -   `Service`: Lógica pura de negocio.
    -   `Repository`: Abstracción de persistencia (TypeORM).

---

## 2. Arquitectura de Servicios y Flujo de Datos

El sistema descompone la lógica de negocio en tres capas de responsabilidad, pasando datos tipados (DTOs) para asegurar la integridad de la operación.

### 2.1. AccountService (Fachada)
**Responsabilidad**: Punto de entrada principal. Recibe la petición HTTP, valida parámetros básicos y delega la ejecución compleja.

*   **Método Principal**: `updateBalance(accountId: string, dto: UpdateBalanceDto)`
    *   **Input**:
        *   `accountId`: UUID de la cuenta.
        *   `dto.amount`: Decimal positivo (ej: 100.50).
        *   `dto.type`: Enum (`'deposit'` | `'withdraw'`).
    *   **Acción**: Loguea la intención de la operación y llama a `TransactionExecutor`.
    *   **Output**: Retorna `UpdateBalanceResponseDto` (nuevo saldo, transactionId) al controlador.

### 2.2. TransactionExecutorService (Core Lógico)
**Responsabilidad**: Normalización de datos y ejecución atómica. Garantiza que los retiros se conviertan a valores negativos y los depósitos a positivos antes de tocar la DB.

*   **Método**: `executeWithRetry(accountId, dto)`
    *   **Normalización**:
        *   Si `type == withdraw` → `amount = -100`
        *   Si `type == deposit` → `amount = +100`
    *   **Ejecución**: Envuelve la operación en un bloque `RetryStrategy`.
    *   **Atomicidad**: Dentro de la transacción SQL, verifica `(balance + amount) >= 0` usando la versión actual para bloqueo optimista.

### 2.3. RetryStrategyService (Manejo de Resiliencia)
**Responsabilidad**: Ejecutar una función anónima (la transacción) y reintentarla si falla por concurrencia.

*   **Flujo**:
    1.  Ejecuta la operación enviada por `TransactionExecutor`.
    2.  **Catch**: Si recibe `ConcurrencyException` (versión cambió), espera `X` ms (Backoff Exponencial).
    3.  **Retry**: Vuelve a intentar la operación hasta agotar `maxRetries`.
    4.  **Fail Fast**: Si recibe `InsufficientFundsException` o `AccountNotFoundException`, aborta inmediatamente (no tiene sentido reintentar un error de lógica de negocio).

## 3. Diseño de Base de Datos

Se utiliza **PostgreSQL** para garantizar la robustez y concurrencia real del sistema. La infraestructura se gestiona mediante **Docker**.

### 3.1. Entidades Principales
### Entidad: Account
| Propiedad | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID | Identificador único. |
| `balance` | Decimal | Saldo actual. Constraint `CHECK (balance >= 0)` para integridad a nivel de DB. |
| `version` | Int | Control de concurrencia. |

### Entidad: Transaction
Diseñada como un log inmutable de operaciones (Audit Log).
-   Registra el saldo "antes" (`balanceBefore`) y "después" (`balanceAfter`).
-   Vincula cada transacción a la versión específica de la cuenta que modificó.

---

## 4. Manejo de Errores

El sistema implementa excepciones de dominio para mapear errores lógicos a respuestas HTTP claras:
-   `InsufficientFundsException`: Retorna **409 Conflict** (o 400) cuando no hay saldo.
-   `AccountNotFoundException`: Retorna **404 Not Found**.
-   `ConcurrencyException`: Error interno que dispara el mecanismo de reintento automático.

---

## 5. Validación y Cobertura de Tests

Se ha implementado una suite exhaustiva de pruebas para validar tanto la lógica de negocio como la robustez ante concurrencia.

### 5.1. Pruebas de Concurrencia y Estrés
Estas pruebas simulan condiciones de alto tráfico para garantizar la integridad de los datos.
*   **Alta Concurrencia**: Ejecución de 100+ operaciones simultáneas sobre una misma cuenta, verificando que el saldo final sea matemáticamente exacto.
*   **Integridad de Datos**: Verificación de que no existen "Lost Updates" (actualizaciones perdidas) incluso bajo carga extrema.
*   **Prevención de Sobregiros**: Validación de que múltiples retiros simultáneos no logren dejar el saldo en negativo.

### 5.2. Pruebas Funcionales y Unitarias
*   **Operaciones Básicas**: Depósitos, retiros e historial de transacciones.
*   **Manejo de Errores**: Verificación de respuestas ante fondos insuficientes o cuentas inexistentes.
*   **Unitarias**: Mocks de repositorios para aislar la lógica de los servicios (`AccountService`, `RetryStrategy`).

---

## 6. Instrucciones de Ejecución y Entorno

### 6.1. Requisitos del Sistema
*   Node.js (v18+)
*   Docker & Docker Compose (para bases de datos)
*   pnpm (`npm install -g pnpm`)

### 6.2. Variables de Entorno
El proyecto requiere configuraciones clave. Utilice `.env.example` como base para crear su `.env`:
*   `PORT`: Puerto del servicio (Default: 3000).
*   `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: Credenciales para la **DB de Desarrollo**.
*   `DB_TEST_PORT`, `DB_TEST_NAME`: Credenciales para la **DB de Test**.

### 6.3. Comandos de Gestión (Docker + App)

El sistema distingue entre entornos de **Desarrollo** y **Test** para evitar corrupción de datos.

#### Levantar Entorno de Desarrollo
Inicia PostgreSQL y la aplicación en modo watch (recarga automática).
```bash
# 1. Instalar dependencias
pnpm install

# 2. Levantar DB de Desarrollo
pnpm db:start   # (Alias de: docker-compose up -d postgres)

# 3. Iniciar Aplicación
pnpm start:dev
```

#### Ejecutar Pruebas (Automático)
El comando de tests se encarga de levantar la base de datos de pruebas, ejecutar toda la suite y apagarlo al finalizar.
```bash
# Levanta DB Test -> Ejecuta Tests -> Apaga DB Test
pnpm test
```

#### Generar Ejecutable (Producción)
Para desplegar la solución optimizada:
```bash
pnpm build
node dist/main
```

#### Limpieza
Para detener y limpiar contenedores:
```bash
pnpm db:stop  # Detiene los contenedores
pnpm db:reset # Pelirogre: Borra y reinicia datos de desarrollo
```

---

## 7. Documentación de API (Swagger) 🌊

El proyecto cuenta con documentación interactiva generada con Swagger. Esta es la forma recomendada de probar los endpoints de manera visual.

*   **URL**: `http://localhost:3000/api` (con la aplicación corriendo).
*   **Características**:
    *   **Guía Rápida**: Incluye instrucciones de uso directamente en la interfaz.
    *   **Pruebas en Vivo**: Botón "Try it out" para ejecutar peticiones reales.
    *   **Esquemas (DTOs)**: Visualización automática de los modelos de datos y validaciones.
    *   **CORS**: Habilitado para permitir pruebas desde el navegador.

---

## 8. Referencia Rápida de API

La aplicación expone endpoints REST para la gestión de cuentas. Para ver el detalle técnico completo (ejemplos, modelos de datos, códigos de error), consulte la [Documentación Swagger](#7-documentación-de-api-swagger).

| Método | Endpoint | Descripción | Body (JSON) |
| :--- | :--- | :--- | :--- |
| `POST` | `/accounts` | Crea una nueva cuenta (UUID auto-generado). | `{ "initialBalance": 1000 }` |
| `GET` | `/accounts` | Lista todas las cuentas. | - |
| `GET` | `/accounts/:id/balance` | Consulta saldo actual. | - |
| `POST` | `/accounts/:id/balance` | Ejecuta un depósito o retiro. | `{ "type": "deposit", "amount": 150 }` |
| `GET` | `/accounts/:id/transactions` | Historial de movimientos. | - |