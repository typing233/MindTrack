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
        @input="autoResize"
        ref="textareaRef"
        :disabled="submitting"
        maxlength="500"
      ></textarea>
      <div class="char-count">{{ content.length }}/500</div>
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
  emits: ['submit'],
  setup(props, { emit }) {
    const content = ref('');
    const textareaRef = ref(null);

    const formattedDate = computed(() => {
      return dayjs().format('YYYY年MM月DD日');
    });

    const autoResize = () => {
      nextTick(() => {
        if (textareaRef.value) {
          textareaRef.value.style.height = 'auto';
          textareaRef.value.style.height = Math.min(textareaRef.value.scrollHeight, 200) + 'px';
        }
      });
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

    return {
      content,
      textareaRef,
      formattedDate,
      autoResize,
      handleSubmit
    };
  }
};
</script>
