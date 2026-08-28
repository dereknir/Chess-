import postgres from 'postgres';
import { readFileSync } from 'fs';

// 手動讀取 .env.local
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

async function testDb() {
  try {
    console.log('測試資料庫連線...');

    // 測試 1: 檢查 players 表結構
    const columns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'players'
      ORDER BY ordinal_position
    `;
    console.log('\nplayers 表的欄位：');
    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

    // 測試 2: 查詢玩家資料
    const players = await sql`select id, display_name, board_theme from players`;
    console.log('\n玩家資料：');
    players.forEach(p => {
      console.log(`  - ${p.id} (${p.display_name}): theme = ${p.board_theme || 'null'}`);
    });

    // 測試 3: 嘗試更新主題
    console.log('\n測試更新主題...');
    const [first] = players;
    await sql`
      update players set board_theme = 'wooden' where id = ${first.id}
    `;
    console.log(`✓ 成功更新 ${first.id} 的主題為 wooden`);

    // 測試 4: 驗證更新
    const [updated] = await sql`select id, board_theme from players where id = ${first.id}`;
    console.log(`✓ 驗證結果: ${updated.id} 的主題現在是 ${updated.board_theme}`);

    console.log('\n✅ 所有測試通過！');
  } catch (err) {
    console.error('\n❌ 測試失敗:', err);
  } finally {
    await sql.end();
  }
}

testDb();
