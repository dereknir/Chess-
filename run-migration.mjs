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

async function runMigration() {
  try {
    console.log('=== 執行 move_analysis 資料表建立 ===\n');

    const migrationSQL = readFileSync('migrations/add-move-analysis.sql', 'utf-8');

    await sql.unsafe(migrationSQL);

    console.log('✅ move_analysis 表建立成功！\n');

    // 驗證表結構
    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'move_analysis'
      ORDER BY ordinal_position
    `;

    console.log('表結構：');
    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });

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
