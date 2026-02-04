// src/config/database.config.ts
import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Account } from 'src/account/entities/account.entity';
import { Transaction } from 'src/account/entities/transaction.entity';

export default registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'peninsula',

    // Entities
    entities: [Account, Transaction],

    // Auto-sync (solo development/test)
    synchronize: process.env.NODE_ENV !== 'production',

    // Logging
    logging:
      process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],

    // Pool de conexiones
    extra: {
      max: 20, // Máximo de conexiones
      min: 5, // Mínimo de conexiones mantenidas
      idleTimeoutMillis: 30000, // Cerrar conexiones inactivas después de 30s
      connectionTimeoutMillis: 2000, // Timeout para establecer conexión
    },

    // Configuración adicional para performance
    poolSize: 20,
    connectTimeoutMS: 2000,

    // Retry de conexión
    retryAttempts: 10,
    retryDelay: 3000,
    autoLoadEntities: false, // Cargamos entities manualmente
  }),
);
