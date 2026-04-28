<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">LLM 设置</span>
        <button class="modal-close" @click="$emit('close')">&times;</button>
      </div>
      
      <div class="settings-form">
        <div class="form-group">
          <label class="form-label">API 地址 (Base URL)</label>
          <input 
            v-model="form.openai_base_url" 
            type="text" 
            class="form-input"
            placeholder="例如: https://api.openai.com"
          />
          <div class="form-hint">OpenAI 兼容的 API 地址，不需要包含 /v1</div>
        </div>
        
        <div class="form-group">
          <label class="form-label">API Key</label>
          <input 
            v-model="form.openai_api_key" 
            type="password" 
            class="form-input"
            placeholder="输入你的 API Key"
          />
          <div class="form-hint">用于调用情绪分析和关键词提取</div>
        </div>
        
        <div class="form-group">
          <label class="form-label">模型名称 (Model)</label>
          <input 
            v-model="form.openai_model" 
            type="text" 
            class="form-input"
            placeholder="例如: gpt-3.5-turbo"
          />
          <div class="form-hint">指定要使用的模型名称</div>
        </div>
        
        <div class="divider"></div>
        
        <div style="background: #f8fafc; padding: 16px; border-radius: 8px;">
          <div style="font-weight: 500; margin-bottom: 8px; color: var(--text-primary);">
            💡 使用提示
          </div>
          <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.6;">
            <p>• 配置有效的 LLM API 可以获得更准确的情绪分析和关键词提取</p>
            <p>• 如果未配置或配置无效，系统将使用简单的关键词匹配作为备用方案</p>
            <p>• 支持所有 OpenAI 兼容的 API 接口</p>
          </div>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button class="btn btn-primary" @click="handleSave" :disabled="saving">
          {{ saving ? '保存中...' : '保存设置' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import { configApi } from '../api';

export default {
  name: 'SettingsModal',
  emits: ['close', 'saved'],
  setup(props, { emit }) {
    const form = ref({
      openai_base_url: '',
      openai_api_key: '',
      openai_model: ''
    });
    const saving = ref(false);

    const loadConfig = async () => {
      try {
        const result = await configApi.get();
        if (result.success) {
          form.value = {
            openai_base_url: result.data.openai_base_url || '',
            openai_api_key: result.data.openai_api_key || '',
            openai_model: result.data.openai_model || ''
          };
        }
      } catch (error) {
        console.error('加载配置失败:', error);
      }
    };

    const handleSave = async () => {
      saving.value = true;
      try {
        await configApi.update(form.value);
        emit('saved');
        emit('close');
      } catch (error) {
        console.error('保存配置失败:', error);
      } finally {
        saving.value = false;
      }
    };

    onMounted(() => {
      loadConfig();
    });

    return {
      form,
      saving,
      handleSave
    };
  }
};
</script>
