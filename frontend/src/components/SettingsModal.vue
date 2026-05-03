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
          <div class="form-hint">用于调用情绪分析、关键词提取和向量搜索</div>
        </div>
        
        <div class="form-group">
          <label class="form-label">聊天模型名称 (Chat Model)</label>
          <input 
            v-model="form.openai_model" 
            type="text" 
            class="form-input"
            placeholder="例如: gpt-3.5-turbo"
          />
          <div class="form-hint">用于情绪分析和关键词提取</div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Embedding 模型名称 (可选)</label>
          <input 
            v-model="form.openai_embedding_model" 
            type="text" 
            class="form-input"
            placeholder="例如: text-embedding-3-small"
          />
          <div class="form-hint">用于向量搜索，如不填则使用聊天模型或备用方案</div>
        </div>
        
        <div class="divider"></div>
        
        <div class="connection-test-section">
          <div class="connection-test-header">
            <span style="font-weight: 500; color: var(--text-primary);">连接性测试</span>
          </div>
          <div class="test-buttons">
            <button 
              class="btn btn-secondary test-btn" 
              @click="testConnection"
              :disabled="testingConnection"
            >
              {{ testingConnection ? '测试中...' : '🔗 测试聊天模型' }}
            </button>
            <button 
              class="btn btn-secondary test-btn" 
              @click="testEmbedding"
              :disabled="testingEmbedding"
            >
              {{ testingEmbedding ? '测试中...' : '🧠 测试 Embedding' }}
            </button>
          </div>
          
          <div v-if="testResult" class="test-result" :class="testResult.success ? 'success' : 'error'">
            <span v-if="testResult.success">✅ {{ testResult.message }}</span>
            <span v-else>❌ {{ testResult.message }}</span>
          </div>
        </div>
        
        <div class="divider"></div>
        
        <div style="background: #f8fafc; padding: 16px; border-radius: 8px;">
          <div style="font-weight: 500; margin-bottom: 8px; color: var(--text-primary);">
            💡 使用提示
          </div>
          <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.6;">
            <p>• 配置有效的 LLM API 可以获得更准确的情绪分析、关键词提取和向量搜索</p>
            <p>• 如果未配置或配置无效，系统将使用简单的关键词匹配作为备用方案</p>
            <p>• 支持所有 OpenAI 兼容的 API 接口</p>
            <p>• Embedding 模型用于智能发现相似的历史笔记</p>
          </div>
        </div>
      </div>
      
      <div class="modal-footer">
        <div v-if="saveError" style="color: var(--negative-color); font-size: 13px; flex: 1;">
          {{ saveError }}
        </div>
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
      openai_model: '',
      openai_embedding_model: ''
    });
    const saving = ref(false);
    const saveError = ref('');
    const testingConnection = ref(false);
    const testingEmbedding = ref(false);
    const testResult = ref(null);

    const loadConfig = async () => {
      try {
        const result = await configApi.get();
        if (result.success) {
          form.value = {
            openai_base_url: result.data.openai_base_url || '',
            openai_api_key: result.data.openai_api_key || '',
            openai_model: result.data.openai_model || '',
            openai_embedding_model: result.data.openai_embedding_model || ''
          };
        }
      } catch (error) {
        console.error('加载配置失败:', error);
      }
    };

    const handleSave = async () => {
      saving.value = true;
      saveError.value = '';
      try {
        await configApi.update(form.value);
        emit('saved');
        emit('close');
      } catch (error) {
        console.error('保存配置失败:', error);
        saveError.value = error.response?.data?.error || '保存失败，请稍后重试';
      } finally {
        saving.value = false;
      }
    };

    const testConnection = async () => {
      testingConnection.value = true;
      testResult.value = null;
      
      try {
        const tempConfig = {
          openai_base_url: form.value.openai_base_url,
          openai_api_key: form.value.openai_api_key,
          openai_model: form.value.openai_model
        };
        
        await configApi.update(tempConfig);
        const result = await configApi.testConnection();
        
        testResult.value = {
          success: result.success,
          message: result.message || result.error || '未知结果'
        };
      } catch (error) {
        testResult.value = {
          success: false,
          message: error.message || '测试失败'
        };
      } finally {
        testingConnection.value = false;
        loadConfig();
      }
    };

    const testEmbedding = async () => {
      testingEmbedding.value = true;
      testResult.value = null;
      
      try {
        const tempConfig = {
          openai_base_url: form.value.openai_base_url,
          openai_api_key: form.value.openai_api_key,
          openai_embedding_model: form.value.openai_embedding_model
        };
        
        await configApi.update(tempConfig);
        const result = await configApi.testEmbedding();
        
        testResult.value = {
          success: result.success,
          message: result.message || result.error || '未知结果'
        };
      } catch (error) {
        testResult.value = {
          success: false,
          message: error.message || '测试失败'
        };
      } finally {
        testingEmbedding.value = false;
        loadConfig();
      }
    };

    onMounted(() => {
      loadConfig();
    });

    return {
      form,
      saving,
      saveError,
      testingConnection,
      testingEmbedding,
      testResult,
      handleSave,
      testConnection,
      testEmbedding
    };
  }
};
</script>

<style scoped>
.connection-test-section {
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
}

.connection-test-header {
  margin-bottom: 12px;
}

.test-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.test-btn {
  flex: 1;
  min-width: 120px;
}

.test-result {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
}

.test-result.success {
  background: rgba(16, 185, 129, 0.1);
  color: var(--positive-color);
}

.test-result.error {
  background: rgba(239, 68, 68, 0.1);
  color: var(--negative-color);
}
</style>
