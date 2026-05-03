const axios = require('axios');
const { getConfig, getAllConfigs, getKeywordsByDateRange } = require('./database');
const dayjs = require('dayjs');

class NLPService {
  constructor() {
    this.config = null;
  }

  async getConfig() {
    if (this.config) return this.config;
    
    const configs = getAllConfigs.all();
    this.config = {};
    configs.forEach(row => {
      this.config[row.key] = row.value;
    });
    
    return this.config;
  }

  async analyzeSentiment(text) {
    const config = await this.getConfig();
    
    if (!config.openai_api_key || !config.openai_base_url || !config.openai_model) {
      const fallbackResult = this.fallbackSentimentAnalysis(text);
      return fallbackResult;
    }

    try {
      const response = await axios.post(
        `${config.openai_base_url}/v1/chat/completions`,
        {
          model: config.openai_model,
          messages: [
            {
              role: 'system',
              content: `你是一个情绪分析专家。请分析用户输入文本的情绪倾向。
输出格式要求（JSON）：
{
  "type": "positive/negative/neutral",
  "score": 0.0-1.0,
  "reason": "简短解释"
}

情绪类型说明：
- positive: 积极、开心、满足、期待等正面情绪
- negative: 消极、难过、焦虑、愤怒等负面情绪
- neutral: 平静、陈述事实、无明显情绪倾向

情绪分值说明：
- 0.0-0.3: 消极程度高
- 0.3-0.7: 中性或情绪不明显
- 0.7-1.0: 积极程度高`
            },
            {
              role: 'user',
              content: `请分析以下文本的情绪："${text}"`
            }
          ],
          temperature: 0.1,
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${config.openai_api_key}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const content = response.data.choices[0].message.content;
      let result;
      
      try {
        result = JSON.parse(content);
      } catch (e) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          return this.fallbackSentimentAnalysis(text);
        }
      }

      return {
        type: result.type || 'neutral',
        score: result.score || 0.5,
        reason: result.reason || ''
      };
    } catch (error) {
      console.error('NLP API调用失败:', error.message);
      return this.fallbackSentimentAnalysis(text);
    }
  }

  async extractKeywords(text) {
    const config = await this.getConfig();
    
    if (!config.openai_api_key || !config.openai_base_url || !config.openai_model) {
      return this.fallbackKeywordExtraction(text);
    }

    try {
      const response = await axios.post(
        `${config.openai_base_url}/v1/chat/completions`,
        {
          model: config.openai_model,
          messages: [
            {
              role: 'system',
              content: `你是一个关键词提取专家。请从用户输入文本中提取核心实体和关键词。
输出格式要求（JSON数组）：
["关键词1", "关键词2", "关键词3"]

要求：
1. 提取3-8个核心关键词
2. 关键词应该是有意义的实体、名词或动词短语
3. 排除无意义的虚词和助词
4. 关键词要简洁，通常2-4个字`
            },
            {
              role: 'user',
              content: `请从以下文本中提取关键词："${text}"`
            }
          ],
          temperature: 0.1,
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${config.openai_api_key}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const content = response.data.choices[0].message.content;
      let keywords;
      
      try {
        keywords = JSON.parse(content);
      } catch (e) {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          keywords = JSON.parse(jsonMatch[0]);
        } else {
          return this.fallbackKeywordExtraction(text);
        }
      }

      return Array.isArray(keywords) ? keywords : this.fallbackKeywordExtraction(text);
    } catch (error) {
      console.error('NLP API调用失败:', error.message);
      return this.fallbackKeywordExtraction(text);
    }
  }

  fallbackSentimentAnalysis(text) {
    const positiveWords = ['开心', '快乐', '高兴', '好', '棒', '优秀', '喜欢', '爱', '期待', '满足', '成功', '进步', '希望', '顺利', '美好', '幸福', '愉快', '兴奋', '感激', '感谢'];
    const negativeWords = ['难过', '伤心', '失望', '不好', '糟糕', '生气', '愤怒', '焦虑', '压力', '累', '疲惫', '失败', '困难', '麻烦', '担心', '害怕', '痛苦', '郁闷', '不开心'];
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    for (const word of positiveWords) {
      if (text.includes(word)) positiveCount++;
    }
    for (const word of negativeWords) {
      if (text.includes(word)) negativeCount++;
    }
    
    let type = 'neutral';
    let score = 0.5;
    
    if (positiveCount > negativeCount) {
      type = 'positive';
      score = 0.5 + Math.min(positiveCount * 0.1, 0.4);
    } else if (negativeCount > positiveCount) {
      type = 'negative';
      score = 0.5 - Math.min(negativeCount * 0.1, 0.4);
    }
    
    return { type, score, reason: '简单关键词匹配（备用分析）' };
  }

  fallbackKeywordExtraction(text) {
    const stopWords = ['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '她', '他', '它', '们', '这个', '那个', '什么', '怎么', '为什么', '哪', '谁', '多少', '几', '啊', '吧', '呢', '吗', '呀', '哦', '嗯', '哈'];
    
    const keywords = [];
    
    for (let i = 0; i < text.length - 1; i++) {
      for (let len = 4; len >= 2; len--) {
        if (i + len <= text.length) {
          const word = text.substring(i, i + len);
          if (!stopWords.some(sw => word.includes(sw)) && word.length >= 2) {
            if (!keywords.includes(word)) {
              keywords.push(word);
            }
          }
        }
      }
    }
    
    return keywords.slice(0, 8);
  }

  async analyzeKeywordAssociation(startDate, endDate) {
    const keywords = getKeywordsByDateRange.all({ startDate, endDate });
    
    const keywordEmotionMap = {};
    
    keywords.forEach(item => {
      if (!keywordEmotionMap[item.keyword]) {
        keywordEmotionMap[item.keyword] = {
          positive: 0,
          negative: 0,
          neutral: 0,
          total: 0
        };
      }
      
      const entry = keywordEmotionMap[item.keyword];
      if (item.emotion_type === 'positive') entry.positive++;
      else if (item.emotion_type === 'negative') entry.negative++;
      else entry.neutral++;
      entry.total++;
    });
    
    const result = Object.entries(keywordEmotionMap)
      .map(([keyword, data]) => ({
        keyword,
        ...data,
        dominantEmotion: this.getDominantEmotion(data)
      }))
      .sort((a, b) => b.total - a.total);
    
    return result;
  }

  getDominantEmotion(data) {
    const { positive, negative, neutral } = data;
    if (positive >= negative && positive >= neutral) return 'positive';
    if (negative >= positive && negative >= neutral) return 'negative';
    return 'neutral';
  }

  async generateEmbedding(text) {
    const config = await this.getConfig();
    
    if (!config.openai_api_key || !config.openai_base_url || !config.openai_model) {
      return this.fallbackEmbeddingGeneration(text);
    }

    try {
      const embeddingModel = config.openai_embedding_model || 'text-embedding-3-small';
      
      const response = await axios.post(
        `${config.openai_base_url}/v1/embeddings`,
        {
          model: embeddingModel,
          input: text,
          encoding_format: 'float'
        },
        {
          headers: {
            'Authorization': `Bearer ${config.openai_api_key}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.data && response.data.data[0]) {
        return response.data.data[0].embedding;
      }
      
      return this.fallbackEmbeddingGeneration(text);
    } catch (error) {
      console.error('Embedding API调用失败:', error.message);
      return this.fallbackEmbeddingGeneration(text);
    }
  }

  fallbackEmbeddingGeneration(text) {
    const stopWords = ['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '她', '他', '它', '们', '这个', '那个', '什么', '怎么', '为什么', '哪', '谁', '多少', '几', '啊', '吧', '呢', '吗', '呀', '哦', '嗯', '哈'];
    
    const wordFreq = {};
    const totalChars = text.length;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (stopWords.includes(char)) continue;
      
      wordFreq[char] = (wordFreq[char] || 0) + 1;
      
      if (i < text.length - 1) {
        const bigram = text.substring(i, i + 2);
        if (!stopWords.some(sw => bigram.includes(sw))) {
          wordFreq[bigram] = (wordFreq[bigram] || 0) + 1;
        }
      }
    }
    
    const sortedWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(entry => entry[0]);
    
    const embedding = [];
    const vecSize = 128;
    
    for (let i = 0; i < vecSize; i++) {
      let value = 0;
      
      if (i < sortedWords.length) {
        const word = sortedWords[i];
        const freq = wordFreq[word];
        value = freq / Math.max(1, text.length);
      }
      
      for (let j = 0; j < text.length; j++) {
        const char = text.charCodeAt(j);
        const seed = (char * (j + 1) * (i + 1)) % 1000;
        const noise = (seed / 1000 - 0.5) * 0.01;
        value += noise;
      }
      
      value = Math.tanh(value);
      embedding.push(value);
    }
    
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    const normalized = embedding.map(val => val / (magnitude || 1));
    
    return normalized;
  }

  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      magA += vecA[i] * vecA[i];
      magB += vecB[i] * vecB[i];
    }
    
    const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }
}

module.exports = new NLPService();
