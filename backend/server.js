require('dotenv').config();
const express = require('express');
const cors = require('cors');
const dayjs = require('dayjs');
const {
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

    const [sentimentResult, keywords, embedding] = await Promise.all([
      nlpService.analyzeSentiment(content),
      nlpService.extractKeywords(content),
      nlpService.generateEmbedding(content)
    ]);

    const diaryResult = insertDiary.run({
      content: content.trim(),
      created_at: isoString,
      date: today,
      embedding: JSON.stringify(embedding),
      last_accessed: isoString
    });

    const diaryId = diaryResult.lastInsertRowid;

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

app.post('/api/search/similar', async (req, res) => {
  try {
    const { content, limit = 5, excludeId } = req.body;
    
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: '搜索内容不能为空' });
    }

    const queryEmbedding = await nlpService.generateEmbedding(content);
    const allDiaries = getAllDiariesWithEmbeddings.all();

    if (!allDiaries || allDiaries.length === 0) {
      return res.json({
        success: true,
        data: []
      });
    }

    const similarDiaries = allDiaries
      .filter(diary => {
        if (!diary.embedding) return false;
        if (excludeId && diary.id === excludeId) return false;
        return true;
      })
      .map(diary => {
        let diaryEmbedding;
        try {
          diaryEmbedding = JSON.parse(diary.embedding);
        } catch (e) {
          return null;
        }
        
        const similarity = nlpService.cosineSimilarity(queryEmbedding, diaryEmbedding);
        
        return {
          ...diary,
          embedding: undefined,
          similarity,
          similarityPercent: Math.round(similarity * 100)
        };
      })
      .filter(item => item !== null)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, parseInt(limit));

    res.json({
      success: true,
      data: similarDiaries
    });
  } catch (error) {
    console.error('相似搜索失败:', error);
    res.status(500).json({ error: '搜索失败，请稍后重试' });
  }
});

app.put('/api/diary/:id/access', (req, res) => {
  try {
    const { id } = req.params;
    const now = dayjs().toISOString();
    
    updateDiaryLastAccessed.run({
      id: parseInt(id),
      last_accessed: now
    });
    
    const updatedDiary = getDiaryById.get({ id: parseInt(id) });
    
    res.json({
      success: true,
      data: {
        id: updatedDiary?.id,
        last_accessed: now
      }
    });
  } catch (error) {
    console.error('更新访问时间失败:', error);
    res.status(500).json({ error: '更新失败，请稍后重试' });
  }
});

app.post('/api/test-connection', async (req, res) => {
  try {
    const config = await nlpService.getConfig();
    
    if (!config.openai_api_key || !config.openai_base_url || !config.openai_model) {
      return res.json({
      success: false,
      error: '配置不完整，请检查 API 地址、Key 和模型名称'
    });
    }

    const axios = require('axios');
    
    try {
      const response = await axios.post(
        `${config.openai_base_url}/v1/chat/completions`,
        {
          model: config.openai_model,
          messages: [
            { role: 'user', content: 'Hi' }
          ],
          max_tokens: 5
        },
        {
          headers: {
            'Authorization': `Bearer ${config.openai_api_key}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );
      
      if (response.data && response.data.choices) {
        res.json({
          success: true,
          message: '连接成功！API 配置有效',
          model: config.openai_model,
          baseUrl: config.openai_base_url
        });
      } else {
        res.json({
          success: false,
          error: 'API 响应格式异常'
        });
      }
    } catch (apiError) {
      const errorMessage = apiError.response?.data?.error?.message || apiError.message || '未知错误';
      res.json({
        success: false,
        error: `连接失败: ${errorMessage}`
      });
    }
  } catch (error) {
    console.error('连接测试失败:', error);
    res.status(500).json({ 
      success: false, 
      error: '测试失败，请稍后重试' 
    });
  }
});

app.post('/api/test-embedding', async (req, res) => {
  try {
    const config = await nlpService.getConfig();
    
    if (!config.openai_api_key || !config.openai_base_url) {
      return res.json({
        success: false,
        error: '配置不完整，请检查 API 地址和 Key'
      });
    }

    const axios = require('axios');
    const embeddingModel = config.openai_embedding_model || 'text-embedding-3-small';
    
    try {
      const response = await axios.post(
        `${config.openai_base_url}/v1/embeddings`,
        {
          model: embeddingModel,
          input: 'test',
          encoding_format: 'float'
        },
        {
          headers: {
            'Authorization': `Bearer ${config.openai_api_key}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );
      
      if (response.data && response.data.data && response.data.data[0]) {
        const embedding = response.data.data[0].embedding;
        res.json({
          success: true,
          message: 'Embedding API 连接成功！',
          model: embeddingModel,
          dimensions: embedding.length
        });
      } else {
        res.json({
          success: false,
          error: 'Embedding API 响应格式异常'
        });
      }
    } catch (apiError) {
      const errorMessage = apiError.response?.data?.error?.message || apiError.message || '未知错误';
      res.json({
        success: false,
        error: `Embedding 连接失败: ${errorMessage}`
      });
    }
  } catch (error) {
    console.error('Embedding 测试失败:', error);
    res.status(500).json({ 
      success: false, 
      error: '测试失败，请稍后重试' 
    });
  }
});

app.listen(PORT, () => {
  console.log(`MindTrack 后端服务运行在 http://localhost:${PORT}`);
});
