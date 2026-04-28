<template>
  <div class="card">
    <div class="card-header">
      <span class="card-title">关键词分析</span>
    </div>
    
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
    </div>
    
    <div v-else-if="keywords.length === 0" class="empty-state">
      <div class="empty-state-icon">🔍</div>
      <div class="empty-state-text">数据不足</div>
      <div class="empty-state-hint">需要至少7天的数据才能进行关键词分析</div>
    </div>
    
    <div v-else>
      <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 16px;">
        基于最近7天的记录，分析关键词与情绪的关联
      </div>
      
      <div class="keyword-analysis">
        <div class="keyword-cloud">
          <div 
            v-for="(item, index) in displayKeywords" 
            :key="item.keyword"
            class="keyword-cloud-item"
            :class="item.dominantEmotion"
            :style="{ fontSize: getFontSize(item.total) }"
            :title="`${item.keyword}: 出现${item.total}次 (积极:${item.positive}, 消极:${item.negative}, 平稳:${item.neutral})`"
          >
            {{ item.keyword }}
          </div>
        </div>
      </div>
      
      <div class="divider"></div>
      
      <div style="font-weight: 500; margin-bottom: 12px;">情绪触发词分析</div>
      
      <div style="margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="width: 8px; height: 8px; background: var(--positive-color); border-radius: 50%;"></span>
          <span style="font-weight: 500; color: var(--positive-color);">积极触发词</span>
        </div>
        <div v-if="positiveKeywords.length > 0" style="display: flex; flex-wrap: wrap; gap: 8px;">
          <span 
            v-for="item in positiveKeywords" 
            :key="item.keyword"
            class="keyword-tag"
            style="background: rgba(16, 185, 129, 0.1); color: var(--positive-color);"
          >
            {{ item.keyword }} ({{ item.positive }}次)
          </span>
        </div>
        <div v-else style="color: var(--text-secondary); font-size: 14px;">
          暂无数据
        </div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="width: 8px; height: 8px; background: var(--negative-color); border-radius: 50%;"></span>
          <span style="font-weight: 500; color: var(--negative-color);">消极触发词</span>
        </div>
        <div v-if="negativeKeywords.length > 0" style="display: flex; flex-wrap: wrap; gap: 8px;">
          <span 
            v-for="item in negativeKeywords" 
            :key="item.keyword"
            class="keyword-tag"
            style="background: rgba(239, 68, 68, 0.1); color: var(--negative-color);"
          >
            {{ item.keyword }} ({{ item.negative }}次)
          </span>
        </div>
        <div v-else style="color: var(--text-secondary); font-size: 14px;">
          暂无数据
        </div>
      </div>
      
      <div>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="width: 8px; height: 8px; background: var(--neutral-color); border-radius: 50%;"></span>
          <span style="font-weight: 500; color: var(--neutral-color);">中性触发词</span>
        </div>
        <div v-if="neutralKeywords.length > 0" style="display: flex; flex-wrap: wrap; gap: 8px;">
          <span 
            v-for="item in neutralKeywords" 
            :key="item.keyword"
            class="keyword-tag"
          >
            {{ item.keyword }} ({{ item.neutral }}次)
          </span>
        </div>
        <div v-else style="color: var(--text-secondary); font-size: 14px;">
          暂无数据
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue';

export default {
  name: 'KeywordAnalysisView',
  props: {
    keywords: {
      type: Array,
      default: () => []
    },
    loading: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    const displayKeywords = computed(() => {
      return props.keywords.slice(0, 20);
    });

    const positiveKeywords = computed(() => {
      return props.keywords
        .filter(k => k.positive > 0 && k.positive >= k.negative && k.positive >= k.neutral)
        .sort((a, b) => b.positive - a.positive)
        .slice(0, 10);
    });

    const negativeKeywords = computed(() => {
      return props.keywords
        .filter(k => k.negative > 0 && k.negative >= k.positive && k.negative >= k.neutral)
        .sort((a, b) => b.negative - a.negative)
        .slice(0, 10);
    });

    const neutralKeywords = computed(() => {
      return props.keywords
        .filter(k => k.neutral > 0 && k.neutral >= k.positive && k.neutral >= k.negative)
        .sort((a, b) => b.neutral - a.neutral)
        .slice(0, 10);
    });

    const getFontSize = (count) => {
      const minSize = 12;
      const maxSize = 24;
      const maxCount = Math.max(...props.keywords.map(k => k.total), 1);
      const size = minSize + (count / maxCount) * (maxSize - minSize);
      return size + 'px';
    };

    return {
      displayKeywords,
      positiveKeywords,
      negativeKeywords,
      neutralKeywords,
      getFontSize
    };
  }
};
</script>
