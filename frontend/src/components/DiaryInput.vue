<template>
  <div class="card">
    <div class="card-header">
      <span class="card-title">今日心情</span>
      <span style="font-size: 14px; color: var(--text-secondary);">
        {{ formattedDate }}
      </span>
    </div>
    
    <div v-if="todayExists && todayDiary" class="empty-state">
      <div class="empty-state-icon">✅</div>
      <div class="empty-state-text">今天已经写过日记啦</div>
      <div class="empty-state-hint">{{ todayDiary.content }}</div>
    </div>
    
    <div v-else class="input-group">
      <textarea
        v-model="content"
        class="textarea-auto"
        placeholder="今天发生了什么？用一句话记下你的心情..."
        rows="3"
        @keydown.enter.exact="handleSubmit"
        @input="onInput"
        ref="textareaRef"
        :disabled="submitting"
        maxlength="500"
      ></textarea>
      <div class="char-count">{{ content.length }}/500</div>
    </div>
    
    <div v-if="similarNotes.length > 0 && !todayExists" class="similar-notes-card">
      <div class="similar-notes-header">
        <span>🔍 发现相似的历史笔记</span>
      </div>
      <div class="similar-notes-list">
        <div 
          v-for="note in similarNotes" 
          :key="note.id" 
          class="similar-note-item"
          @click="$emit('showNote', note)"
        >
          <div class="similar-note-content">{{ note.content }}</div>
          <div class="similar-note-meta">
            <span class="similar-note-date">{{ note.date }}</span>
            <span class="emotion-badge" :class="note.emotion_type">
              {{ getEmotionLabel(note.emotion_type) }}
            </span>
            <span class="similarity-score" :class="getSimilarityClass(note.similarityPercent)">
              相似度 {{ note.similarityPercent }}%
            </span>
          </div>
        </div>
      </div>
    </div>
    
    <div v-if="!todayExists" style="margin-top: 16px; display: flex; justify-content: flex-end;">
      <button 
        class="btn btn-primary"
        @click="handleSubmit"
        :disabled="submitting || !content.trim()"
      >
        {{ submitting ? '提交中...' : '提交日记' }}
      </button>
    </div>
    
    <div v-if="!todayExists" style="margin-top: 12px; font-size: 12px; color: var(--text-secondary);">
      💡 提示：按 Enter 键快速提交
    </div>
  </div>
</template>

<script>
import { ref, computed, watch, nextTick } from 'vue';
import dayjs from 'dayjs';
import { searchApi } from '../api';

export default {
  name: 'DiaryInput',
  props: {
    todayDiary: {
      type: Object,
      default: null
    },
    todayExists: {
      type: Boolean,
      default: false
    },
    submitting: {
      type: Boolean,
      default: false
    }
  },
  emits: ['submit', 'showNote'],
  setup(props, { emit }) {
    const content = ref('');
    const textareaRef = ref(null);
    const similarNotes = ref([]);
    let searchTimeout = null;

    const formattedDate = computed(() => {
      return dayjs().format('YYYY年MM月DD日');
    });

    const getEmotionLabel = (type) => {
      const labels = {
        positive: '😊 积极',
        negative: '😔 消极',
        neutral: '😐 平稳'
      };
      return labels[type] || type;
    };

    const getSimilarityClass = (percent) => {
      if (percent >= 70) return 'high';
      if (percent >= 40) return 'medium';
      return 'low';
    };

    const autoResize = () => {
      nextTick(() => {
        if (textareaRef.value) {
          textareaRef.value.style.height = 'auto';
          textareaRef.value.style.height = Math.min(textareaRef.value.scrollHeight, 200) + 'px';
        }
      });
    };

    const searchSimilarNotes = async () => {
      if (!content.value || content.value.trim().length < 5) {
        similarNotes.value = [];
        return;
      }

      try {
        const result = await searchApi.findSimilar(content.value.trim(), 3);
        if (result.success && result.data) {
          similarNotes.value = result.data.filter(note => note.similarityPercent >= 30);
        }
      } catch (error) {
        console.error('搜索相似笔记失败:', error);
        similarNotes.value = [];
      }
    };

    const onInput = () => {
      autoResize();
      
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
      
      searchTimeout = setTimeout(() => {
        searchSimilarNotes();
      }, 500);
    };

    const handleSubmit = (event) => {
      if (event) {
        event.preventDefault();
      }
      
      if (props.submitting || !content.value.trim()) {
        return;
      }
      
      emit('submit', content.value.trim());
    };

    watch(() => props.todayExists, (exists) => {
      if (exists) {
        content.value = '';
        similarNotes.value = [];
      }
    });

    return {
      content,
      textareaRef,
      similarNotes,
      formattedDate,
      getEmotionLabel,
      getSimilarityClass,
      autoResize,
      onInput,
      handleSubmit
    };
  }
};
</script>

<style scoped>
.similar-notes-card {
  margin-top: 16px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(16, 185, 129, 0.05));
  border: 1px solid rgba(99, 102, 241, 0.1);
  border-radius: 12px;
  overflow: hidden;
}

.similar-notes-header {
  padding: 10px 14px;
  background: rgba(99, 102, 241, 0.08);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.similar-notes-list {
  padding: 8px;
}

.similar-note-item {
  padding: 10px 12px;
  background: var(--card-bg);
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.similar-note-item:last-child {
  margin-bottom: 0;
}

.similar-note-item:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);
}

.similar-note-content {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.5;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.similar-note-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.similar-note-date {
  font-size: 11px;
  color: var(--text-secondary);
}

.similarity-score {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.similarity-score.high {
  background: rgba(16, 185, 129, 0.1);
  color: var(--positive-color);
}

.similarity-score.medium {
  background: rgba(99, 102, 241, 0.1);
  color: var(--primary-color);
}

.similarity-score.low {
  background: rgba(107, 114, 128, 0.1);
  color: var(--neutral-color);
}
</style>
