import { Pool } from 'pg';
import 'dotenv/config'; // Cargar variables de entorno

async function checkDb() {
  const connectionString = process.env.DB_CONNECTION_STRING;
  if (!connectionString) {
    console.error("DB_CONNECTION_STRING no está definida en .env");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    console.log("Conectando a la base de datos y listando tablas en el esquema 'app'...");
    const result = await pool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'app';`
    );
    
    if (result.rows.length > 0) {
      console.log("Tablas encontradas en el esquema 'app':");
      result.rows.forEach(row => console.log(`- ${row.tablename}`));
    } else {
      console.log("No se encontraron tablas en el esquema 'app'.");
    }
  } catch (error) {
    console.error("Error al verificar la base de datos:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkDb();
