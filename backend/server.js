require('dotenv').config();
const express = require('express');
const cors = require('cors');
const dayjs = require('dayjs');
const {
  db,
  insertDiary,
  insertEmotion,
  insertKeywords,
  getDiaryByDate,
  getDiaryWithEmotionByDate,
  getDiariesWithEmotions,
  getDiariesByDateRange,
  getKeywordsByDateRange,
  getConfig,
  setConfig,
  getAllConfigs
} = require('./database');
const nlpService = require('./nlpService');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: dayjs().toISOString() });
});

app.post('/api/diary', async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: '内容不能为空' });
    }

    const now = dayjs();
    const today = now.format('YYYY-MM-DD');
    const isoString = now.toISOString();

    const existingDiary = getDiaryByDate.get({ date: today });
    if (existingDiary) {
      return res.status(400).json({ error: '今天已经写过日记了' });
    }

    const diaryResult = insertDiary.run({
      content: content.trim(),
      created_at: isoString,
      date: today
    });

    const diaryId = diaryResult.lastInsertRowid;

    const [sentimentResult, keywords] = await Promise.all([
      nlpService.analyzeSentiment(content),
      nlpService.extractKeywords(content)
    ]);

    insertEmotion.run({
      diary_id: diaryId,
      type: sentimentResult.type,
      score: sentimentResult.score,
      created_at: isoString
    });

    if (keywords && keywords.length > 0) {
      insertKeywords(diaryId, keywords);
    }

    res.json({
      success: true,
      data: {
        id: diaryId,
        content: content.trim(),
        date: today,
        emotion: {
          type: sentimentResult.type,
          score: sentimentResult.score,
          reason: sentimentResult.reason
        },
        keywords
      }
    });
  } catch (error) {
    console.error('保存日记失败:', error);
    res.status(500).json({ error: '保存失败，请稍后重试' });
  }
});

app.get('/api/diary/today', (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const diary = getDiaryWithEmotionByDate.get({ date: today });
    
    if (diary) {
      const keywords = getKeywordsByDateRange.all({ 
        startDate: today, 
        endDate: today 
      }).filter(k => k.keyword);
      
      const uniqueKeywords = [...new Set(keywords.map(k => k.keyword))];
      
      res.json({
        exists: true,
        data: {
          ...diary,
          keywords: uniqueKeywords
        }
      });
    } else {
      res.json({ exists: false, data: null });
    }
  } catch (error) {
    console.error('获取今日日记失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

app.get('/api/diaries', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let diaries;
    
    if (startDate && endDate) {
      diaries = getDiariesByDateRange.all({ startDate, endDate });
    } else {
      diaries = getDiariesWithEmotions.all();
    }
    
    res.json({
      success: true,
      data: diaries
    });
  } catch (error) {
    console.error('获取日记列表失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

app.get('/api/analysis/keywords', async (req, res) => {
  try {
    const { startDate, endDate, days } = req.query;
    
    let start, end;
    
    if (startDate && endDate) {
      start = startDate;
      end = endDate;
    } else if (days) {
      end = dayjs().format('YYYY-MM-DD');
      start = dayjs().subtract(parseInt(days), 'day').format('YYYY-MM-DD');
    } else {
      end = dayjs().format('YYYY-MM-DD');
      start = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
    }

    const keywordAnalysis = await nlpService.analyzeKeywordAssociation(start, end);
    
    res.json({
      success: true,
      data: {
        dateRange: { start, end },
        keywords: keywordAnalysis
      }
    });
  } catch (error) {
    console.error('获取关键词分析失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

app.get('/api/config', (req, res) => {
  try {
    const configs = getAllConfigs.all();
    const result = {};
    configs.forEach(row => {
      result[row.key] = row.value;
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取配置失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

app.put('/api/config', (req, res) => {
  try {
    const configs = req.body;
    const now = dayjs().toISOString();
    
    for (const [key, value] of Object.entries(configs)) {
      if (value === null || value === undefined) continue;
      
      const existing = getConfig.get({ key });
      
      if (existing) {
        setConfig.run({
          key,
          value: String(value),
          created_at: existing.created_at || now,
          updated_at: now
        });
      } else {
        setConfig.run({
          key,
          value: String(value),
          created_at: now,
          updated_at: now
        });
      }
    }
    
    nlpService.config = null;
    
    res.json({
      success: true,
      message: '配置已更新'
    });
  } catch (error) {
    console.error('更新配置失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    
    const totalDiaries = db.prepare('SELECT COUNT(*) as count FROM diaries').get().count;
    const emotionCounts = db.prepare(`
      SELECT type, COUNT(*) as count 
      FROM emotions 
      GROUP BY type
    `).all();
    
    const emotionStats = {
      positive: 0,
      negative: 0,
      neutral: 0
    };
    emotionCounts.forEach(item => {
      emotionStats[item.type] = item.count;
    });
    
    const averageScore = db.prepare(`
      SELECT AVG(score) as avg FROM emotions
    `).get().avg || 0;
    
    const recent7Days = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
    const recentDiaries = db.prepare(`
      SELECT COUNT(*) as count FROM diaries WHERE date >= ?
    `).get(recent7Days).count;
    
    res.json({
      success: true,
      data: {
        totalDiaries,
        emotionStats,
        averageScore: parseFloat(averageScore.toFixed(2)),
        recent7DaysCount: recentDiaries,
        canShowKeywordAnalysis: totalDiaries >= 7
      }
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

app.listen(PORT, () => {
  console.log(`MindTrack 后端服务运行在 http://localhost:${PORT}`);
});
