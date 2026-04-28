<template>
  <div class="card">
    <div class="card-header">
      <span class="card-title">时间轴</span>
    </div>
    
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
    </div>
    
    <div v-else-if="diaries.length === 0" class="empty-state">
      <div class="empty-state-icon">📝</div>
      <div class="empty-state-text">还没有日记</div>
      <div class="empty-state-hint">开始记录你的第一篇心情日记吧</div>
    </div>
    
    <div v-else class="timeline">
      <div 
        v-for="diary in displayDiaries" 
        :key="diary.id"
        class="timeline-item"
      >
        <div class="timeline-date">
          <div class="day">{{ formatDay(diary.date) }}</div>
          <div class="month">{{ formatMonth(diary.date) }}</div>
        </div>
        <div class="timeline-content">
          <div class="text">{{ diary.content }}</div>
          <div class="timeline-meta">
            <span class="emotion-badge" :class="diary.emotion_type">
              {{ getEmotionLabel(diary.emotion_type) }}
            </span>
            <span>{{ (diary.emotion_score * 100).toFixed(0) }}分</span>
          </div>
          <div class="score-bar">
            <div 
              class="score-fill" 
              :class="diary.emotion_type"
              :style="{ width: (diary.emotion_score * 100) + '%' }"
            ></div>
          </div>
        </div>
      </div>
    </div>
    
    <div v-if="diaries.length > 0" class="chart-container">
      <div class="divider"></div>
      <div style="font-weight: 500; margin-bottom: 12px;">情绪趋势图</div>
      <div class="chart-bars">
        <div 
          v-for="(item, index) in chartData" 
          :key="index"
          class="chart-bar"
        >
          <div 
            class="chart-bar-fill" 
            :class="item.emotion_type"
            :style="{ height: (item.score * 100) + '%' }"
            :title="`${item.date}: ${(item.score * 100).toFixed(0)}分`"
          ></div>
          <div class="chart-bar-label">{{ item.label }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue';
import dayjs from 'dayjs';

export default {
  name: 'TimelineView',
  props: {
    diaries: {
      type: Array,
      default: () => []
    },
    loading: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    const displayDiaries = computed(() => {
      return props.diaries.slice(0, 30);
    });

    const chartData = computed(() => {
      const recent = props.diaries.slice(0, 14).reverse();
      return recent.map(diary => ({
        date: diary.date,
        score: diary.emotion_score,
        emotion_type: diary.emotion_type,
        label: dayjs(diary.date).format('M/D')
      }));
    });

    const formatDay = (date) => {
      return dayjs(date).format('DD');
    };

    const formatMonth = (date) => {
      return dayjs(date).format('MM月');
    };

    const getEmotionLabel = (type) => {
      const labels = {
        positive: '😊 积极',
        negative: '😔 消极',
        neutral: '😐 平稳'
      };
      return labels[type] || type;
    };

    return {
      displayDiaries,
      chartData,
      formatDay,
      formatMonth,
      getEmotionLabel
    };
  }
};
</script>
