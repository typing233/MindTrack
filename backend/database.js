const Database = require('better-sqlite3');
const path = require('path');
const dayjs = require('dayjs');

const dbPath = path.join(__dirname, 'mindtrack.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS diaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    date TEXT NOT NULL,
    embedding TEXT,
    last_accessed TEXT
  );

  CREATE TABLE IF NOT EXISTS emotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    diary_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    score REAL NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (diary_id) REFERENCES diaries (id)
  );

  CREATE TABLE IF NOT EXISTS keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    diary_id INTEGER NOT NULL,
    keyword TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (diary_id) REFERENCES diaries (id)
  );

  CREATE TABLE IF NOT EXISTS configs (
    key TEXT PRIMARY KEY,
    value TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const checkColumnExists = (tableName, columnName) => {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some(col => col.name === columnName);
};

if (!checkColumnExists('diaries', 'embedding')) {
  db.exec(`ALTER TABLE diaries ADD COLUMN embedding TEXT`);
}

if (!checkColumnExists('diaries', 'last_accessed')) {
  db.exec(`ALTER TABLE diaries ADD COLUMN last_accessed TEXT`);
}

const insertDiary = db.prepare(`
  INSERT INTO diaries (content, created_at, date, embedding, last_accessed)
  VALUES (@content, @created_at, @date, @embedding, @last_accessed)
`);

const insertEmotion = db.prepare(`
  INSERT INTO emotions (diary_id, type, score, created_at)
  VALUES (@diary_id, @type, @score, @created_at)
`);

const insertKeywords = db.transaction((diaryId, keywords) => {
  const insert = db.prepare(`
    INSERT INTO keywords (diary_id, keyword, created_at)
    VALUES (@diary_id, @keyword, @created_at)
  `);
  const now = dayjs().toISOString();
  for (const keyword of keywords) {
    insert.run({ diary_id: diaryId, keyword, created_at: now });
  }
});

const updateDiaryEmbedding = db.prepare(`
  UPDATE diaries
  SET embedding = @embedding
  WHERE id = @id
`);

const updateDiaryLastAccessed = db.prepare(`
  UPDATE diaries
  SET last_accessed = @last_accessed
  WHERE id = @id
`);

const getDiaryById = db.prepare(`
  SELECT d.*, e.type as emotion_type, e.score as emotion_score
  FROM diaries d
  LEFT JOIN emotions e ON d.id = e.diary_id
  WHERE d.id = @id
  LIMIT 1
`);

const getAllDiariesWithEmbeddings = db.prepare(`
  SELECT d.id, d.content, d.date, d.created_at, d.last_accessed, d.embedding,
         e.type as emotion_type, e.score as emotion_score
  FROM diaries d
  LEFT JOIN emotions e ON d.id = e.diary_id
  WHERE d.embedding IS NOT NULL
  ORDER BY d.created_at DESC
`);

const getDiaryByDate = db.prepare(`
  SELECT * FROM diaries WHERE date = @date
`);

const getDiaryWithEmotionByDate = db.prepare(`
  SELECT d.*, e.type as emotion_type, e.score as emotion_score
  FROM diaries d
  LEFT JOIN emotions e ON d.id = e.diary_id
  WHERE d.date = @date
  LIMIT 1
`);

const getDiariesWithEmotions = db.prepare(`
  SELECT d.*, e.type as emotion_type, e.score as emotion_score
  FROM diaries d
  LEFT JOIN emotions e ON d.id = e.diary_id
  ORDER BY d.created_at DESC
`);

const getDiariesByDateRange = db.prepare(`
  SELECT d.*, e.type as emotion_type, e.score as emotion_score
  FROM diaries d
  LEFT JOIN emotions e ON d.id = e.diary_id
  WHERE d.date >= @startDate AND d.date <= @endDate
  ORDER BY d.created_at DESC
`);

const getKeywordsByDateRange = db.prepare(`
  SELECT k.keyword, e.type as emotion_type
  FROM keywords k
  JOIN diaries d ON k.diary_id = d.id
  JOIN emotions e ON d.id = e.diary_id
  WHERE d.date >= @startDate AND d.date <= @endDate
`);

const getConfig = db.prepare(`
  SELECT value, created_at FROM configs WHERE key = @key
`);

const setConfig = db.prepare(`
  INSERT INTO configs (key, value, created_at, updated_at)
  VALUES (@key, @value, @created_at, @updated_at)
  ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = @updated_at
`);

const getAllConfigs = db.prepare(`
  SELECT key, value FROM configs
`);

module.exports = {
  db,
  insertDiary,
  insertEmotion,
  insertKeywords,
  updateDiaryEmbedding,
  updateDiaryLastAccessed,
  getDiaryById,
  getDiaryByDate,
  getDiaryWithEmotionByDate,
  getDiariesWithEmotions,
  getDiariesByDateRange,
  getKeywordsByDateRange,
  getAllDiariesWithEmbeddings,
  getConfig,
  setConfig,
  getAllConfigs
};
