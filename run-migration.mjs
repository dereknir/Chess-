import postgres from 'postgres';
import { readFileSync } from 'fs';

const envContent = readFileSync('.env.local', 'utf-8');
const DATABASE_URL = envContent
  .split('\n')
  .find(line => line.startsWith('DATABASE_URL='))
  ?.split('=')[1]
  ?.trim();

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL not found in .env.local');
}

const sql = postgres(DATABASE_URL, {
  max: 1,
  prepare: false,
  idle_timeout: 20,
  ssl: 'require',
});

// 用法：node run-migration.mjs migrations/<檔名>.sql
const file = process.argv[2];
if (!file) {
  console.error('請指定要跑的 migration：node run-migration.mjs migrations/xxx.sql');
  process.exit(1);
}

async function runMigration() {
  try {
    console.log(`=== 執行 ${file} ===\n`);

    await sql.unsafe(readFileSync(file, 'utf-8'));

    console.log('\n=== ✅ Migration 完成 ===');
  } catch (err) {
    console.error('\n=== ❌ 錯誤 ===');
    console.error(err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigration();
