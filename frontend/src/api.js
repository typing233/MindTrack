import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

export const diaryApi = {
  submit: async (content) => {
    const response = await api.post('/diary', { content });
    return response.data;
  },
  
  getToday: async () => {
    const response = await api.get('/diary/today');
    return response.data;
  },
  
  getAll: async (startDate, endDate) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const response = await api.get('/diaries', { params });
    return response.data;
  },
  
  updateAccess: async (id) => {
    const response = await api.put(`/diary/${id}/access`);
    return response.data;
  }
};

export const searchApi = {
  findSimilar: async (content, limit = 5, excludeId = null) => {
    const response = await api.post('/search/similar', { content, limit, excludeId });
    return response.data;
  }
};

export const configApi = {
  get: async () => {
    const response = await api.get('/config');
    return response.data;
  },
  
  update: async (configs) => {
    const response = await api.put('/config', configs);
    return response.data;
  },
  
  testConnection: async () => {
    const response = await api.post('/test-connection');
    return response.data;
  },
  
  testEmbedding: async () => {
    const response = await api.post('/test-embedding');
    return response.data;
  }
};

export const statsApi = {
  get: async () => {
    const response = await api.get('/stats');
    return response.data;
  }
};

export const analysisApi = {
  getKeywords: async (days = 7, startDate, endDate) => {
    const params = {};
    if (startDate && endDate) {
      params.startDate = startDate;
      params.endDate = endDate;
    } else {
      params.days = days;
    }
    const response = await api.get('/analysis/keywords', { params });
    return response.data;
  }
};

export default api;
