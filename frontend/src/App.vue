<template>
  <div class="app">
    <div class="container">
      <div class="header">
        <h1>MindTrack</h1>
        <div class="header-actions">
          <button class="btn btn-text" @click="showSettings = true">
            ⚙️ 设置
          </button>
        </div>
      </div>

      <DiaryInput 
        :todayDiary="todayDiary"
        :todayExists="todayExists"
        @submitting="submitting"
        @submit="handleSubmit"
      />

      <div v-if="todayExists && todayDiary" class="card">
        <div class="card-header">
          <span class="card-title">今日分析</span>
        </div>
        <div class="score-display">
          <div class="score-value" :class="todayDiary.emotion_type">
            {{ getDisplayScore(todayDiary.emotion_type, todayDiary.emotion_score) }}
          </div>
          <div class="score-info">
            <div class="score-label">
              <span class="emotion-badge" :class="todayDiary.emotion_type">
                {{ getEmotionLabel(todayDiary.emotion_type) }}
              </span>
            </div>
            <div class="score-hint">{{ getScoreHint(todayDiary.emotion_type) }}</div>
          </div>
        </div>
        <div class="score-bar">
          <div 
            class="score-fill" 
            :class="todayDiary.emotion_type"
            :style="{ width: getScoreBarWidth(todayDiary.emotion_type, todayDiary.emotion_score) }"
          ></div>
        </div>
        <div v-if="todayDiary.keywords && todayDiary.keywords.length > 0" style="margin-top: 16px;">
          <div v-for="keyword in todayDiary.keywords" :key="keyword" class="keyword-tag">
            {{ keyword }}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">数据概览</span>
        </div>
        <div v-if="loadingStats" class="loading">
          <div class="spinner"></div>
        </div>
        <div v-else class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">{{ stats.totalDiaries }}</div>
            <div class="stat-label">总日记数</div>
          </div>
          <div class="stat-card">
            <div class="stat-value positive">{{ stats.emotionStats?.positive || 0 }}</div>
            <div class="stat-label">积极天数</div>
          </div>
          <div class="stat-card">
            <div class="stat-value negative">{{ stats.emotionStats?.negative || 0 }}</div>
            <div class="stat-label">消极天数</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ stats.recent7DaysCount || 0 }}</div>
            <div class="stat-label">近7天记录</div>
          </div>
        </div>
      </div>

      <div class="tabs">
        <button 
          class="tab" 
          :class="{ active: activeTab === 'calendar' }"
          @click="activeTab = 'calendar'"
        >
          📅 日历视图
        </button>
        <button 
          class="tab" 
          :class="{ active: activeTab === 'timeline' }"
          @click="activeTab = 'timeline'"
        >
          📊 时间轴
        </button>
        <button 
          v-if="stats.canShowKeywordAnalysis"
          class="tab" 
          :class="{ active: activeTab === 'keywords' }"
          @click="activeTab = 'keywords'"
        >
          🔍 关键词分析
        </button>
      </div>

      <CalendarView 
        v-if="activeTab === 'calendar'"
        :diaries="diaries"
        @select="showDiaryDetail"
      />

      <TimelineView 
        v-if="activeTab === 'timeline'"
        :diaries="diaries"
        :loading="loadingDiaries"
      />

      <KeywordAnalysisView 
        v-if="activeTab === 'keywords'"
        :loading="loadingKeywords"
        :keywords="keywordAnalysis"
      />

      <div v-if="selectedDiary" class="modal-overlay" @click.self="selectedDiary = null">
        <div class="modal">
          <div class="modal-header">
            <span class="modal-title">{{ selectedDiary.date }}</span>
            <button class="modal-close" @click="selectedDiary = null">&times;</button>
          </div>
          <div class="timeline-content" style="margin-bottom: 16px;">
            <div class="text">{{ selectedDiary.content }}</div>
            <div class="timeline-meta">
              <span class="emotion-badge" :class="selectedDiary.emotion_type">
                {{ getEmotionLabel(selectedDiary.emotion_type) }}
              </span>
              <span>{{ getDisplayScore(selectedDiary.emotion_type, selectedDiary.emotion_score) }}分</span>
            </div>
            <div class="score-bar">
              <div 
                class="score-fill" 
                :class="selectedDiary.emotion_type"
                :style="{ width: getScoreBarWidth(selectedDiary.emotion_type, selectedDiary.emotion_score) }"
              ></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="selectedDiary = null">关闭</button>
          </div>
        </div>
      </div>

      <SettingsModal 
        v-if="showSettings"
        @close="showSettings = false"
        @saved="loadConfig"
      />

      <div v-if="toast.message" class="toast" :class="[toast.type, { show: toast.show }]">
        {{ toast.message }}
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, watch } from 'vue';
import dayjs from 'dayjs';
import { diaryApi, statsApi, analysisApi } from './api';
import DiaryInput from './components/DiaryInput.vue';
import CalendarView from './components/CalendarView.vue';
import TimelineView from './components/TimelineView.vue';
import KeywordAnalysisView from './components/KeywordAnalysisView.vue';
import SettingsModal from './components/SettingsModal.vue';

export default {
  name: 'App',
  components: {
    DiaryInput,
    CalendarView,
    TimelineView,
    KeywordAnalysisView,
    SettingsModal
  },
  setup() {
    const todayDiary = ref(null);
    const todayExists = ref(false);
    const submitting = ref(false);
    const activeTab = ref('calendar');
    const diaries = ref([]);
    const selectedDiary = ref(null);
    const showSettings = ref(false);
    
    const stats = ref({
      totalDiaries: 0,
      emotionStats: { positive: 0, negative: 0, neutral: 0 },
      averageScore: 0,
      recent7DaysCount: 0,
      canShowKeywordAnalysis: false
    });
    const loadingStats = ref(false);
    const loadingDiaries = ref(false);
    const loadingKeywords = ref(false);
    const keywordAnalysis = ref([]);

    const toast = ref({
      message: '',
      type: 'success',
      show: false
    });

    const showToast = (message, type = 'success') => {
      toast.value.message = message;
      toast.value.type = type;
      toast.value.show = true;
      setTimeout(() => {
        toast.value.show = false;
      }, 3000);
    };

    const getEmotionLabel = (type) => {
      const labels = {
        positive: '😊 积极',
        negative: '😔 消极',
        neutral: '😐 平稳'
      };
      return labels[type] || type;
    };

    const getDisplayScore = (type, score) => {
      return Math.round(score * 100);
    };

    const getScoreBarWidth = (type, score) => {
      return Math.round(score * 100) + '%';
    };

    const getScoreHint = (type) => {
      return '心情指数，分数越高心情越好';
    };

    const loadTodayDiary = async () => {
      try {
        const result = await diaryApi.getToday();
        todayExists.value = result.exists;
        todayDiary.value = result.data;
      } catch (error) {
        console.error('加载今日日记失败:', error);
      }
    };

    const loadStats = async () => {
      loadingStats.value = true;
      try {
        const result = await statsApi.get();
        if (result.success) {
          stats.value = result.data;
        }
      } catch (error) {
        console.error('加载统计失败:', error);
      } finally {
        loadingStats.value = false;
      }
    };

    const loadDiaries = async () => {
      loadingDiaries.value = true;
      try {
        const result = await diaryApi.getAll();
        if (result.success) {
          diaries.value = result.data || [];
        }
      } catch (error) {
        console.error('加载日记列表失败:', error);
      } finally {
        loadingDiaries.value = false;
      }
    };

    const loadKeywordAnalysis = async () => {
      if (!stats.value.canShowKeywordAnalysis) return;
      
      loadingKeywords.value = true;
      try {
        const result = await analysisApi.getKeywords(7);
        if (result.success) {
          keywordAnalysis.value = result.data.keywords || [];
        }
      } catch (error) {
        console.error('加载关键词分析失败:', error);
      } finally {
        loadingKeywords.value = false;
      }
    };

    const loadConfig = async () => {
    };

    const handleSubmit = async (content) => {
      submitting.value = true;
      try {
        const result = await diaryApi.submit(content);
        if (result.success) {
          showToast('日记已保存！', 'success');
          todayDiary.value = {
            ...result.data,
            emotion_type: result.data.emotion.type,
            emotion_score: result.data.emotion.score,
            keywords: result.data.keywords
          };
          todayExists.value = true;
          await loadStats();
          await loadDiaries();
        }
      } catch (error) {
        const message = error.response?.data?.error || '保存失败';
        showToast(message, 'error');
      } finally {
        submitting.value = false;
      }
    };

    const showDiaryDetail = (diary) => {
      selectedDiary.value = diary;
    };

    watch(activeTab, (newTab) => {
      if (newTab === 'keywords' && keywordAnalysis.value.length === 0) {
        loadKeywordAnalysis();
      }
    });

    onMounted(() => {
      loadTodayDiary();
      loadStats();
      loadDiaries();
    });

    return {
      todayDiary,
      todayExists,
      submitting,
      activeTab,
      diaries,
      selectedDiary,
      showSettings,
      stats,
      loadingStats,
      loadingDiaries,
      loadingKeywords,
      keywordAnalysis,
      toast,
      showToast,
      getEmotionLabel,
      getDisplayScore,
      getScoreBarWidth,
      getScoreHint,
      loadConfig,
      handleSubmit,
      showDiaryDetail
    };
  }
};
</script>
