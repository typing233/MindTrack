<template>
  <div class="space-view-container">
    <div ref="canvasContainer" class="canvas-container"></div>
    <div class="space-controls">
      <div class="control-group">
        <button class="control-btn" @click="resetCamera" title="重置视角">
          🔄 重置
        </button>
        <button class="control-btn" @click="toggleAutoRotate" :class="{ active: autoRotate }" title="自动旋转">
          🎡 {{ autoRotate ? '停止旋转' : '自动旋转' }}
        </button>
      </div>
      <div class="control-group">
        <label class="control-label">
          <input type="checkbox" v-model="showConnections" /> 显示关联线
        </label>
        <label class="control-label">
          <input type="checkbox" v-model="showLabels" /> 显示标签
        </label>
      </div>
    </div>
    <div v-if="selectedNode" class="node-detail-panel">
      <div class="node-detail-header">
        <span class="node-detail-date">{{ selectedNode.date }}</span>
        <button class="node-detail-close" @click="selectedNode = null">&times;</button>
      </div>
      <div class="node-detail-content">
        <p>{{ selectedNode.content }}</p>
        <div class="node-detail-meta">
          <span class="emotion-badge" :class="selectedNode.emotion_type">
            {{ getEmotionLabel(selectedNode.emotion_type) }}
          </span>
          <span>{{ getDisplayScore(selectedNode.emotion_score) }}分</span>
        </div>
        <div v-if="selectedNode.keywords && selectedNode.keywords.length > 0" class="node-detail-keywords">
          <span v-for="kw in selectedNode.keywords" :key="kw" class="keyword-tag">{{ kw }}</span>
        </div>
      </div>
      <div class="node-detail-footer">
        <button class="btn btn-primary" @click="reviewNode">标记为已回顾</button>
      </div>
    </div>
    <div class="space-legend">
      <div class="legend-item">
        <span class="legend-dot positive"></span> 积极情绪
      </div>
      <div class="legend-item">
        <span class="legend-dot negative"></span> 消极情绪
      </div>
      <div class="legend-item">
        <span class="legend-dot neutral"></span> 平稳情绪
      </div>
      <div class="legend-item legend-brightness">
        <span class="legend-brightness-bar">
          <span class="brightness-dim"></span>
          <span class="brightness-bright"></span>
        </span>
        <span class="legend-brightness-label">越暗表示越久未访问</span>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import dayjs from 'dayjs';

export default {
  name: 'SpaceView',
  props: {
    diaries: {
      type: Array,
      default: () => []
    }
  },
  emits: ['review'],
  setup(props, { emit }) {
    const canvasContainer = ref(null);
    const selectedNode = ref(null);
    const autoRotate = ref(false);
    const showConnections = ref(true);
    const showLabels = ref(true);

    let scene, camera, renderer, controls;
    let nodes = [];
    let nodeMeshes = [];
    let connectionLines = [];
    let labelSprites = [];
    let raycaster, mouse;
    let isDragging = false;
    let draggedNode = null;
    let animationFrameId = null;

    const getEmotionLabel = (type) => {
      const labels = {
        positive: '😊 积极',
        negative: '😔 消极',
        neutral: '😐 平稳'
      };
      return labels[type] || type;
    };

    const getDisplayScore = (score) => {
      return Math.round(score * 100);
    };

    const getEmotionColor = (type) => {
      const colors = {
        positive: new THREE.Color(0x10b981),
        negative: new THREE.Color(0xef4444),
        neutral: new THREE.Color(0x6b7280)
      };
      return colors[type] || colors.neutral;
    };

    const getBrightnessFactor = (diary) => {
      const now = dayjs();
      const lastAccessed = diary.last_accessed ? dayjs(diary.last_accessed) : dayjs(diary.created_at);
      const daysDiff = now.diff(lastAccessed, 'day');
      
      const minBrightness = 0.2;
      const maxBrightness = 1.0;
      const maxDays = 30;
      
      const factor = maxBrightness - (Math.min(daysDiff, maxDays) / maxDays) * (maxBrightness - minBrightness);
      return Math.max(factor, minBrightness);
    };

    const createNodeMesh = (diary, position) => {
      const color = getEmotionColor(diary.emotion_type);
      const brightness = getBrightnessFactor(diary);
      
      const adjustedColor = color.clone().multiplyScalar(brightness);
      
      const geometry = new THREE.SphereGeometry(0.8, 32, 32);
      const material = new THREE.MeshPhongMaterial({
        color: adjustedColor,
        emissive: adjustedColor.clone().multiplyScalar(0.3),
        shininess: 100,
        transparent: true,
        opacity: 0.9
      });
      
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.copy(position);
      sphere.userData = { 
        diary, 
        originalPosition: position.clone(),
        targetPosition: position.clone(),
        velocity: new THREE.Vector3()
      };
      
      const glowGeometry = new THREE.SphereGeometry(1.2, 32, 32);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: adjustedColor,
        transparent: true,
        opacity: 0.1 * brightness
      });
      
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      sphere.add(glow);
      
      return sphere;
    };

    const createLabelSprite = (diary, position) => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = 256;
      canvas.height = 64;
      
      context.fillStyle = 'rgba(0, 0, 0, 0.7)';
      context.beginPath();
      context.roundRect(0, 0, 256, 64, 8);
      context.fill();
      
      context.font = 'bold 12px Arial';
      context.fillStyle = 'white';
      context.textAlign = 'center';
      context.fillText(diary.date, 128, 18);
      
      context.font = '10px Arial';
      context.fillStyle = 'rgba(255, 255, 255, 0.7)';
      const preview = diary.content.length > 15 ? diary.content.substring(0, 15) + '...' : diary.content;
      context.fillText(preview, 128, 36);
      
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true,
        opacity: 0.1
      });
      
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(position);
      sprite.position.y += 1.5;
      sprite.scale.set(2, 0.5, 1);
      sprite.userData = { originalOpacity: 0.1, visible: false };
      
      return sprite;
    };

    const createConnectionLines = (nodePositions) => {
      const lines = [];
      
      if (nodePositions.length < 2) return lines;
      
      const positionsByEmotion = {
        positive: [],
        negative: [],
        neutral: []
      };
      
      nodePositions.forEach((item) => {
        if (item.diary.emotion_type) {
          positionsByEmotion[item.diary.emotion_type].push(item);
        }
      });
      
      const center = new THREE.Vector3(0, 0, 0);
      
      for (const [emotion, items] of Object.entries(positionsByEmotion)) {
        if (items.length < 2) continue;
        
        const groupCenter = new THREE.Vector3();
        items.forEach(item => groupCenter.add(item.position));
        groupCenter.divideScalar(items.length);
        
        items.forEach(item => {
          const geometry = new THREE.BufferGeometry().setFromPoints([
            item.position.clone(),
            groupCenter.clone()
          ]);
          
          const color = getEmotionColor(emotion);
          const material = new THREE.LineBasicMaterial({ 
            color: color,
            transparent: true,
            opacity: 0.15
          });
          
          const line = new THREE.Line(geometry, material);
          line.userData = { emotion };
          lines.push(line);
        });
      }
      
      return lines;
    };

    const generatePositions = (diaries) => {
      const positions = [];
      const count = diaries.length;
      
      const groups = {
        positive: [],
        negative: [],
        neutral: []
      };
      
      diaries.forEach((diary) => {
        const emotion = diary.emotion_type || 'neutral';
        groups[emotion].push(diary);
      });
      
      const groupCenters = {
        positive: new THREE.Vector3(-8, 0, 0),
        negative: new THREE.Vector3(8, 0, 0),
        neutral: new THREE.Vector3(0, 5, 0)
      };
      
      for (const [emotion, group] of Object.entries(groups)) {
        const center = groupCenters[emotion];
        const radius = Math.max(1.5, Math.sqrt(group.length) * 1.5);
        
        group.forEach((diary, index) => {
          const phi = Math.acos(-1 + (2 * index) / Math.max(1, group.length));
          const theta = Math.sqrt(Math.max(1, group.length) * Math.PI) * phi;
          
          const x = center.x + radius * Math.cos(theta) * Math.sin(phi);
          const y = center.y + radius * Math.sin(theta) * Math.sin(phi);
          const z = center.z + radius * Math.cos(phi);
          
          const noise = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
          );
          
          positions.push({
            diary,
            position: new THREE.Vector3(x, y, z).add(noise)
          });
        });
      }
      
      return positions;
    };

    const initScene = () => {
      const container = canvasContainer.value;
      if (!container) return;
      
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0a1a);
      
      const width = container.clientWidth;
      const height = container.clientHeight;
      
      camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
      camera.position.set(0, 0, 30);
      
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      container.appendChild(renderer.domElement);
      
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.screenSpacePanning = true;
      controls.minDistance = 10;
      controls.maxDistance = 100;
      controls.autoRotate = false;
      controls.autoRotateSpeed = 0.5;
      
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
      scene.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
      directionalLight.position.set(10, 20, 10);
      scene.add(directionalLight);
      
      const pointLight1 = new THREE.PointLight(0x10b981, 0.3, 50);
      pointLight1.position.set(-15, 0, 0);
      scene.add(pointLight1);
      
      const pointLight2 = new THREE.PointLight(0xef4444, 0.3, 50);
      pointLight2.position.set(15, 0, 0);
      scene.add(pointLight2);
      
      const pointLight3 = new THREE.PointLight(0x6366f1, 0.2, 50);
      pointLight3.position.set(0, 10, -15);
      scene.add(pointLight3);
      
      const starGeometry = new THREE.BufferGeometry();
      const starCount = 2000;
      const positions = new Float32Array(starCount * 3);
      
      for (let i = 0; i < starCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 200;
        positions[i + 1] = (Math.random() - 0.5) * 200;
        positions[i + 2] = (Math.random() - 0.5) * 200;
      }
      
      starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      
      const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.1,
        transparent: true,
        opacity: 0.6
      });
      
      const stars = new THREE.Points(starGeometry, starMaterial);
      scene.add(stars);
      
      raycaster = new THREE.Raycaster();
      mouse = new THREE.Vector2();
      
      renderer.domElement.addEventListener('click', onMouseClick);
      renderer.domElement.addEventListener('mousemove', onMouseMove);
      renderer.domElement.addEventListener('mousedown', onMouseDown);
      renderer.domElement.addEventListener('mouseup', onMouseUp);
      window.addEventListener('resize', onResize);
      
      animate();
    };

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      
      nodeMeshes.forEach(mesh => {
        const time = Date.now() * 0.001;
        const originalPos = mesh.userData.originalPosition;
        
        mesh.position.x += Math.sin(time + mesh.position.x * 0.1) * 0.001;
        mesh.position.y += Math.cos(time + mesh.position.y * 0.1) * 0.001;
        mesh.position.z += Math.sin(time * 0.7 + mesh.position.z * 0.1) * 0.001;
        
        if (mesh.material) {
          const pulseIntensity = 0.95 + Math.sin(time * 2) * 0.05;
          mesh.scale.setScalar(pulseIntensity);
        }
        
        if (mesh.children && mesh.children[0]) {
          const glowIntensity = 0.8 + Math.sin(time * 1.5) * 0.2;
          mesh.children[0].material.opacity = 0.08 * glowIntensity;
        }
      });
      
      if (!isDragging) {
        controls.update();
      }
      
      if (autoRotate.value) {
        controls.autoRotate = true;
      } else {
        controls.autoRotate = false;
      }
      
      renderer.render(scene, camera);
    };

    const onMouseClick = (event) => {
      if (isDragging) return;
      
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(nodeMeshes, true);
      
      if (intersects.length > 0) {
        const mesh = intersects[0].object;
        const targetMesh = mesh.type === 'Mesh' ? mesh : mesh.parent;
        
        if (targetMesh.userData && targetMesh.userData.diary) {
          selectedNode.value = { ...targetMesh.userData.diary };
          
          nodeMeshes.forEach(m => {
            if (m.material) {
              m.material.emissiveIntensity = 0.1;
            }
          });
          
          if (targetMesh.material) {
            targetMesh.material.emissiveIntensity = 0.5;
          }
        }
      } else {
        selectedNode.value = null;
        nodeMeshes.forEach(m => {
          if (m.material) {
            m.material.emissiveIntensity = 0.1;
          }
        });
      }
    };

    const onMouseMove = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      if (isDragging && draggedNode) {
        raycaster.setFromCamera(mouse, camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersectPoint);
        
        if (intersectPoint) {
          const screenFactor = camera.position.z / 25;
          const offsetX = (mouse.x - mouse.startX) * screenFactor * 10;
          const offsetY = (mouse.y - mouse.startY) * screenFactor * 10;
          
          draggedNode.position.x = draggedNode.userData.originalPosition.x + offsetX;
          draggedNode.position.y = draggedNode.userData.originalPosition.y + offsetY;
        }
        
        if (showLabels.value) {
          const label = labelSprites.find(l => 
            l.userData.diaryId === draggedNode.userData.diary.id
          );
          if (label) {
            label.position.copy(draggedNode.position);
            label.position.y += 1.5;
          }
        }
      }
      
      if (!isDragging) {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(nodeMeshes, true);
        
        document.body.style.cursor = intersects.length > 0 ? 'pointer' : 'auto';
        
        if (showLabels.value) {
          labelSprites.forEach(label => {
            const isHovered = intersects.some(intersect => {
              const targetMesh = intersect.object.type === 'Mesh' ? intersect.object : intersect.object.parent;
              return targetMesh.userData && targetMesh.userData.diary && 
                     targetMesh.userData.diary.id === label.userData.diaryId;
            });
            
            if (isHovered) {
              label.material.opacity = 0.9;
            } else {
              label.material.opacity = 0.1;
            }
          });
        }
      }
    };

    const onMouseDown = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      mouse.startX = mouse.x;
      mouse.startY = mouse.y;
      
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(nodeMeshes, true);
      
      if (intersects.length > 0) {
        isDragging = true;
        const mesh = intersects[0].object;
        draggedNode = mesh.type === 'Mesh' ? mesh : mesh.parent;
        controls.enabled = false;
      }
    };

    const onMouseUp = () => {
      if (isDragging && draggedNode) {
        draggedNode.userData.originalPosition.copy(draggedNode.position);
      }
      isDragging = false;
      draggedNode = null;
      controls.enabled = true;
    };

    const onResize = () => {
      const container = canvasContainer.value;
      if (!container) return;
      
      const width = container.clientWidth;
      const height = container.clientHeight;
      
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const resetCamera = () => {
      camera.position.set(0, 0, 30);
      camera.lookAt(0, 0, 0);
      controls.reset();
    };

    const toggleAutoRotate = () => {
      autoRotate.value = !autoRotate.value;
    };

    const reviewNode = () => {
      if (selectedNode.value) {
        emit('review', selectedNode.value.id);
        selectedNode.value = null;
      }
    };

    const clearScene = () => {
      nodeMeshes.forEach(mesh => {
        scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
      });
      nodeMeshes = [];
      
      connectionLines.forEach(line => {
        scene.remove(line);
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
      });
      connectionLines = [];
      
      labelSprites.forEach(sprite => {
        scene.remove(sprite);
        if (sprite.material) {
          if (sprite.material.map) sprite.material.map.dispose();
          sprite.material.dispose();
        }
      });
      labelSprites = [];
    };

    const updateNodes = (diaries) => {
      clearScene();
      
      if (!scene) return;
      
      const positions = generatePositions(diaries);
      
      positions.forEach(item => {
        const mesh = createNodeMesh(item.diary, item.position);
        scene.add(mesh);
        nodeMeshes.push(mesh);
        
        if (showLabels.value) {
          const label = createLabelSprite(item.diary, item.position);
          label.userData.diaryId = item.diary.id;
          scene.add(label);
          labelSprites.push(label);
        }
      });
      
      if (showConnections.value) {
        connectionLines = createConnectionLines(positions);
        connectionLines.forEach(line => scene.add(line));
      }
    };

    watch(() => props.diaries, (newDiaries) => {
      if (scene && newDiaries) {
        nextTick(() => {
          updateNodes(newDiaries);
        });
      }
    }, { deep: true });

    watch(showConnections, (value) => {
      if (value) {
        const positions = nodeMeshes.map(mesh => ({
          diary: mesh.userData.diary,
          position: mesh.position
        }));
        connectionLines = createConnectionLines(positions);
        connectionLines.forEach(line => scene.add(line));
      } else {
        connectionLines.forEach(line => scene.remove(line));
        connectionLines = [];
      }
    });

    watch(showLabels, (value) => {
      if (value) {
        nodeMeshes.forEach(mesh => {
          const label = createLabelSprite(mesh.userData.diary, mesh.position);
          label.userData.diaryId = mesh.userData.diary.id;
          scene.add(label);
          labelSprites.push(label);
        });
      } else {
        labelSprites.forEach(sprite => scene.remove(sprite));
        labelSprites = [];
      }
    });

    onMounted(() => {
      nextTick(() => {
        initScene();
        if (props.diaries && props.diaries.length > 0) {
          updateNodes(props.diaries);
        }
      });
    });

    onUnmounted(() => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      
      if (renderer.domElement) {
        renderer.domElement.removeEventListener('click', onMouseClick);
        renderer.domElement.removeEventListener('mousemove', onMouseMove);
        renderer.domElement.removeEventListener('mousedown', onMouseDown);
        renderer.domElement.removeEventListener('mouseup', onMouseUp);
      }
      window.removeEventListener('resize', onResize);
      
      clearScene();
      
      if (renderer) {
        renderer.dispose();
      }
      if (canvasContainer.value && renderer.domElement) {
        canvasContainer.value.removeChild(renderer.domElement);
      }
    });

    return {
      canvasContainer,
      selectedNode,
      autoRotate,
      showConnections,
      showLabels,
      getEmotionLabel,
      getDisplayScore,
      resetCamera,
      toggleAutoRotate,
      reviewNode
    };
  }
};
</script>

<style scoped>
.space-view-container {
  position: relative;
  width: 100%;
  height: 500px;
  border-radius: 16px;
  overflow: hidden;
  background: #0a0a1a;
  box-shadow: var(--shadow-lg);
}

.canvas-container {
  width: 100%;
  height: 100%;
}

.space-controls {
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 10;
}

.control-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.control-btn {
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 8px;
  color: #e2e8f0;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  backdrop-filter: blur(4px);
}

.control-btn:hover {
  background: rgba(30, 41, 59, 0.9);
  border-color: rgba(148, 163, 184, 0.5);
}

.control-btn.active {
  background: rgba(99, 102, 241, 0.3);
  border-color: rgba(99, 102, 241, 0.5);
  color: #818cf8;
}

.control-label {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  color: #94a3b8;
  font-size: 12px;
  backdrop-filter: blur(4px);
}

.control-label input {
  width: 14px;
  height: 14px;
  accent-color: #6366f1;
}

.space-legend {
  position: absolute;
  bottom: 16px;
  left: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  backdrop-filter: blur(4px);
  z-index: 10;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #cbd5e1;
  font-size: 12px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.legend-dot.positive {
  background: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
}

.legend-dot.negative {
  background: #ef4444;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
}

.legend-dot.neutral {
  background: #6b7280;
  box-shadow: 0 0 6px rgba(107, 114, 128, 0.5);
}

.legend-brightness {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  flex-direction: column;
  gap: 4px;
}

.legend-brightness-bar {
  display: flex;
  width: 100%;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
}

.brightness-dim {
  flex: 1;
  background: linear-gradient(to right, #1f2937, #4b5563);
}

.brightness-bright {
  flex: 1;
  background: linear-gradient(to right, #4b5563, #e5e7eb);
}

.legend-brightness-label {
  font-size: 10px;
  color: #64748b;
}

.node-detail-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 300px;
  max-height: calc(100% - 32px);
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 12px;
  overflow: hidden;
  backdrop-filter: blur(8px);
  z-index: 20;
  display: flex;
  flex-direction: column;
}

.node-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.node-detail-date {
  font-weight: 600;
  color: #f8fafc;
  font-size: 14px;
}

.node-detail-close {
  background: none;
  border: none;
  font-size: 20px;
  color: #94a3b8;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.node-detail-close:hover {
  background: rgba(148, 163, 184, 0.1);
  color: #e2e8f0;
}

.node-detail-content {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

.node-detail-content p {
  color: #e2e8f0;
  font-size: 14px;
  line-height: 1.7;
  margin-bottom: 12px;
}

.node-detail-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  color: #94a3b8;
  font-size: 12px;
}

.node-detail-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.node-detail-footer {
  padding: 12px 16px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

@media (max-width: 640px) {
  .space-view-container {
    height: 400px;
  }
  
  .space-controls {
    top: 8px;
    left: 8px;
  }
  
  .control-group {
    flex-direction: column;
  }
  
  .node-detail-panel {
    width: calc(100% - 16px);
    top: 8px;
    right: 8px;
    max-height: 50%;
  }
  
  .space-legend {
    bottom: 8px;
    left: 8px;
  }
}
</style>
