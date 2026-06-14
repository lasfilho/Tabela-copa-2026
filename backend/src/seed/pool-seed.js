import { query } from '../db.js';
import { hashPassword } from '../auth.js';
import { DEFAULT_SCORE_RULES } from '../pool/pool-rules.js';
import { recalculatePoolRanking, recalculateAllPools } from '../pool/pool-ranking.js';

export async function seedPoolData() {
  const { rows: existing } = await query(`SELECT id FROM pools LIMIT 1`);
  if (existing.length) {
    console.log('Bolões já existem — seed de bolão ignorado.');
    return;
  }

  const { rows: adminRows } = await query(
    `SELECT id FROM users WHERE role = 'admin' LIMIT 1`
  );
  if (!adminRows.length) return;
  const adminId = adminRows[0].id;

  const demoUsers = [
    { name: 'João Silva', email: 'joao@demo.local', password: 'demo1234' },
    { name: 'Maria Santos', email: 'maria@demo.local', password: 'demo1234' },
  ];

  const userIds = [adminId];
  for (const u of demoUsers) {
    const hash = await hashPassword(u.password);
    const ins = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'user') ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [u.name, u.email, hash]
    );
    userIds.push(ins.rows[0].id);
  }

  const rulesIns = await query(
    `INSERT INTO pool_score_rules (name, description, rules, is_default)
     VALUES ($1, $2, $3, true) ON CONFLICT (name) DO UPDATE SET
       rules = EXCLUDED.rules,
       description = EXCLUDED.description,
       is_default = true RETURNING id`,
    ['Padrão Copa 2026', 'Pontuação recreativa padrão', JSON.stringify(DEFAULT_SCORE_RULES)]
  );
  const rulesId = rulesIns.rows[0].id;

  const matchIds = ['GA-3', 'GA-4', 'GA-5', 'GA-6'];
  const { rows: matchRows } = await query(
    `SELECT match_date, match_time FROM matches WHERE id = $1`,
    [matchIds[0]]
  );
  const firstDate = matchRows[0]?.match_date;
  const joinDeadline = firstDate
    ? new Date(`${firstDate.toISOString().slice(0, 10)}T21:30:00-03:00`)
    : new Date('2026-06-18T21:30:00-03:00');

  const poolIns = await query(
    `INSERT INTO pools (name, slug, description, creator_id, visibility, status, score_rules_id,
                        join_deadline, allow_public_listing, show_participants)
     VALUES ($1, $2, $3, $4, 'public', 'open', $5, $6, true, true) RETURNING id`,
    [
      'Bolão Demo Grupo A',
      'bolao-demo-grupo-a',
      'Bolão recreativo de demonstração — Grupo A, rodada 2 e 3. Sem premiação pelo sistema.',
      adminId,
      rulesId,
      joinDeadline,
    ]
  );
  const poolId = poolIns.rows[0].id;

  for (let i = 0; i < matchIds.length; i++) {
    await query(
      `INSERT INTO pool_matches (pool_id, match_id, sort_order) VALUES ($1, $2, $3)`,
      [poolId, matchIds[i], i]
    );
  }

  const participantIds = [];
  for (const uid of userIds) {
    const p = await query(
      `INSERT INTO pool_participants (pool_id, user_id) VALUES ($1, $2) RETURNING id`,
      [poolId, uid]
    );
    participantIds.push(p.rows[0].id);
  }

  const predictions = [
    { matchId: 'GA-3', scores: [[2, 1], [1, 1], [3, 0]] },
    { matchId: 'GA-4', scores: [[0, 0], [1, 2], [2, 2]] },
    { matchId: 'GA-5', scores: [[2, 0], [1, 0], [2, 1]] },
    { matchId: 'GA-6', scores: [[1, 1], [0, 2], [3, 1]] },
  ];

  for (let pi = 0; pi < participantIds.length; pi++) {
    for (const pred of predictions) {
      const [h, a] = pred.scores[pi] ?? [0, 0];
      await query(
        `INSERT INTO pool_predictions (pool_id, participant_id, match_id, home_score, away_score)
         VALUES ($1, $2, $3, $4, $5)`,
        [poolId, participantIds[pi], pred.matchId, h, a]
      );
    }
  }

  await recalculatePoolRanking(poolId);
  console.log(`Seed bolão: "Bolão Demo Grupo A" (id=${poolId}), ${userIds.length} participantes.`);
}

export async function runPoolMigrations() {
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema-pools.sql'), 'utf8');
  await query(sql);

  await query(
    `UPDATE pool_score_rules SET rules = $1::jsonb, description = $2
     WHERE is_default = true OR name = 'Padrão Copa 2026'`,
    [JSON.stringify(DEFAULT_SCORE_RULES), 'Pontuação recreativa padrão (v2)']
  );
}
