import mysql from 'mysql2/promise';

async function createDb() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'root123'
    });
    await connection.query("CREATE DATABASE IF NOT EXISTS vss_dc;");
    console.log("Database vss_dc created successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Error creating database:", err);
    process.exit(1);
  }
}

createDb();
