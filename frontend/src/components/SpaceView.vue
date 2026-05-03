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
        <button class="control-btn" @click="reclustering" title="重新聚类">
          🔀 重新聚类
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
        
        <div v-if="similarToSelected.length > 0" class="similar-notes-section">
          <div class="similar-notes-header">📝 相似笔记</div>
          <div class="similar-notes-list">
            <div 
              v-for="note in similarToSelected" 
              :key="note.id" 
              class="similar-note-item"
              @click="jumpToNode(note.id)"
            >
              <div class="similar-note-preview">{{ note.content.substring(0, 30) }}...</div>
              <div class="similar-note-info">
                <span class="similar-note-date">{{ note.date }}</span>
                <span class="similarity-badge" :class="getSimilarityClass(note.similarityPercent)">
                  {{ note.similarityPercent }}%
                </span>
              </div>
            </div>
          </div>
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
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
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
    const similarToSelected = ref([]);

    let scene, camera, renderer, controls;
    let nodeMeshes = [];
    let connectionLines = [];
    let labelSprites = [];
    let raycaster, mouse;
    let isDragging = false;
    let draggedNode = null;
    let animationFrameId = null;
    let physicsEnabled = true;
    let diaryEmbeddings = {};

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
        neutral: new THREE.Color(0x6366f1)
      };
      return colors[type] || colors.neutral;
    };

    const getBrightnessFactor = (diary) => {
      const now = dayjs();
      const lastAccessed = diary.last_accessed ? dayjs(diary.last_accessed) : dayjs(diary.created_at);
      const daysDiff = now.diff(lastAccessed, 'day');
      
      const minBrightness = 0.25;
      const maxBrightness = 1.0;
      const maxDays = 30;
      
      const factor = maxBrightness - (Math.min(daysDiff, maxDays) / maxDays) * (maxBrightness - minBrightness);
      return Math.max(factor, minBrightness);
    };

    const getSimilarityClass = (percent) => {
      if (percent >= 70) return 'high';
      if (percent >= 40) return 'medium';
      return 'low';
    };

    const parseEmbedding = (embeddingStr) => {
      if (!embeddingStr) return null;
      try {
        return JSON.parse(embeddingStr);
      } catch (e) {
        return fallbackEmbedding(embeddingStr);
      }
    };

    const fallbackEmbedding = (text) => {
      const vecSize = 64;
      const embedding = new Array(vecSize).fill(0);
      
      for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        for (let j = 0; j < vecSize; j++) {
          const seed = (charCode * (i + 1) * (j + 1)) % 1000;
          embedding[j] += Math.sin(seed / 100) * 0.01;
        }
      }
      
      const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      return magnitude > 0 ? embedding.map(v => v / magnitude) : embedding;
    };

    const cosineSimilarity = (vecA, vecB) => {
      if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
      
      let dotProduct = 0;
      let magA = 0;
      let magB = 0;
      
      for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magA += vecA[i] * vecA[i];
        magB += vecB[i] * vecB[i];
      }
      
      const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
      return magnitude === 0 ? 0 : Math.max(0, Math.min(1, (dotProduct / magnitude + 1) / 2));
    };

    const buildSimilarityMatrix = (diaries) => {
      const matrix = {};
      const embeddings = {};
      
      diaries.forEach(diary => {
        if (diary.embedding) {
          embeddings[diary.id] = parseEmbedding(diary.embedding);
        } else {
          embeddings[diary.id] = fallbackEmbedding(diary.content || '');
        }
        matrix[diary.id] = {};
      });
      
      diaries.forEach(d1 => {
        diaries.forEach(d2 => {
          if (d1.id === d2.id) {
            matrix[d1.id][d2.id] = 1;
          } else {
            matrix[d1.id][d2.id] = cosineSimilarity(embeddings[d1.id], embeddings[d2.id]);
          }
        });
      });
      
      return { matrix, embeddings };
    };

    const kMeansClustering = (diaries, similarityMatrix, k = 3) => {
      if (diaries.length <= k) {
        return diaries.map((d, i) => ({ ...d, cluster: i }));
      }
      
      const shuffled = [...diaries].sort(() => Math.random() - 0.5);
      let centroids = shuffled.slice(0, k).map(d => d.id);
      let assignments = {};
      
      for (let iteration = 0; iteration < 20; iteration++) {
        const newAssignments = {};
        
        diaries.forEach(diary => {
          let bestCluster = 0;
          let bestSimilarity = -1;
          
          centroids.forEach((centroidId, clusterIdx) => {
            const sim = similarityMatrix[diary.id][centroidId];
            if (sim > bestSimilarity) {
              bestSimilarity = sim;
              bestCluster = clusterIdx;
            }
          });
          
          newAssignments[diary.id] = bestCluster;
        });
        
        let changed = false;
        for (const id of Object.keys(newAssignments)) {
          if (assignments[id] !== newAssignments[id]) {
            changed = true;
            break;
          }
        }
        
        assignments = newAssignments;
        
        if (!changed) break;
        
        const clusters = Array.from({ length: k }, () => []);
        diaries.forEach(d => clusters[assignments[d.id]].push(d));
        
        centroids = clusters.map(cluster => {
          if (cluster.length === 0) return centroids[0];
          
          let bestId = cluster[0].id;
          let bestAvgSim = -1;
          
          cluster.forEach(d1 => {
            let totalSim = 0;
            cluster.forEach(d2 => {
              totalSim += similarityMatrix[d1.id][d2.id];
            });
            const avgSim = totalSim / cluster.length;
            if (avgSim > bestAvgSim) {
              bestAvgSim = avgSim;
              bestId = d1.id;
            }
          });
          
          return bestId;
        });
      }
      
      return diaries.map(d => ({
        ...d,
        cluster: assignments[d.id] || 0
      }));
    };

    const generateInitialPositions = (clusteredDiaries) => {
      const clusterCount = Math.max(...clusteredDiaries.map(d => d.cluster)) + 1;
      const clusterCenters = [];
      
      const angleStep = (Math.PI * 2) / Math.max(clusterCount, 1);
      const radius = 12;
      
      for (let i = 0; i < clusterCount; i++) {
        const angle = angleStep * i - Math.PI / 2;
        clusterCenters.push(new THREE.Vector3(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius * 0.6,
          (Math.random() - 0.5) * 4
        ));
      }
      
      const positions = [];
      const clusterSizes = {};
      clusteredDiaries.forEach(d => {
        clusterSizes[d.cluster] = (clusterSizes[d.cluster] || 0) + 1;
      });
      
      const clusterIndices = {};
      clusteredDiaries.forEach(diary => {
        const cluster = diary.cluster;
        const idx = clusterIndices[cluster] || 0;
        clusterIndices[cluster] = idx + 1;
        
        const center = clusterCenters[cluster] || new THREE.Vector3();
        const size = clusterSizes[cluster] || 1;
        const clusterRadius = Math.max(2, Math.sqrt(size) * 1.5);
        
        const phi = Math.acos(-1 + (2 * idx) / Math.max(1, size));
        const theta = Math.sqrt(Math.max(1, size) * Math.PI) * phi;
        
        const offset = new THREE.Vector3(
          Math.cos(theta) * Math.sin(phi) * clusterRadius,
          Math.sin(theta) * Math.sin(phi) * clusterRadius,
          Math.cos(phi) * clusterRadius
        );
        
        const randomOffset = new THREE.Vector3(
          (Math.random() - 0.5) * 1,
          (Math.random() - 0.5) * 1,
          (Math.random() - 0.5) * 1
        );
        
        positions.push({
          diary,
          position: center.clone().add(offset).add(randomOffset),
          velocity: new THREE.Vector3()
        });
      });
      
      return positions;
    };

    const createNodeMesh = (diary, position) => {
      const color = getEmotionColor(diary.emotion_type);
      const brightness = getBrightnessFactor(diary);
      
      const adjustedColor = color.clone().multiplyScalar(brightness);
      
      const size = 0.5 + (diary.content?.length || 0) / 500;
      const geometry = new THREE.SphereGeometry(Math.min(size, 1.2), 24, 24);
      const material = new THREE.MeshPhongMaterial({
        color: adjustedColor,
        emissive: adjustedColor.clone().multiplyScalar(0.2),
        shininess: 80,
        transparent: true,
        opacity: 0.9
      });
      
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.copy(position);
      sphere.userData = { 
        diaryId: diary.id,
        diary,
        velocity: new THREE.Vector3(),
        acceleration: new THREE.Vector3(),
        cluster: diary.cluster
      };
      
      const ringGeometry = new THREE.RingGeometry(1.0, 1.3, 32);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: adjustedColor,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      sphere.add(ring);
      
      const glowGeometry = new THREE.SphereGeometry(1.5, 32, 32);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: adjustedColor,
        transparent: true,
        opacity: 0.05 * brightness
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
      
      context.fillStyle = 'rgba(0, 0, 0, 0.8)';
      context.beginPath();
      context.roundRect(0, 0, 256, 64, 8);
      context.fill();
      
      context.font = 'bold 12px Arial';
      context.fillStyle = 'white';
      context.textAlign = 'center';
      context.fillText(diary.date, 128, 18);
      
      context.font = '10px Arial';
      context.fillStyle = 'rgba(255, 255, 255, 0.7)';
      const preview = diary.content?.length > 20 ? diary.content.substring(0, 20) + '...' : diary.content;
      context.fillText(preview || '', 128, 36);
      
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true,
        opacity: 0.1
      });
      
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(position);
      sprite.position.y += 1.8;
      sprite.scale.set(2.5, 0.6, 1);
      sprite.userData = { diaryId: diary.id };
      
      return sprite;
    };

    const createConnectionLines = (meshes, similarityMatrix, similarityThreshold = 0.5) => {
      const lines = [];
      
      for (let i = 0; i < meshes.length; i++) {
        for (let j = i + 1; j < meshes.length; j++) {
          const mesh1 = meshes[i];
          const mesh2 = meshes[j];
          
          const id1 = mesh1.userData.diaryId;
          const id2 = mesh2.userData.diaryId;
          
          const similarity = similarityMatrix[id1]?.[id2] || 0;
          
          if (similarity >= similarityThreshold) {
            const points = [
              mesh1.position.clone(),
              mesh2.position.clone()
            ];
            
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            
            const lineColor = new THREE.Color();
            const diary1 = mesh1.userData.diary;
            const diary2 = mesh2.userData.diary;
            
            if (diary1.cluster === diary2.cluster) {
              lineColor.copy(getEmotionColor(diary1.emotion_type));
            } else {
              lineColor.set(0x6366f1);
            }
            
            const material = new THREE.LineBasicMaterial({
              color: lineColor,
              transparent: true,
              opacity: similarity * 0.4
            });
            
            const line = new THREE.Line(geometry, material);
            line.userData = { id1, id2, similarity };
            lines.push(line);
          }
        }
      }
      
      return lines;
    };

    const updatePhysics = (meshes, similarityMatrix, deltaTime) => {
      if (!physicsEnabled) return;
      
      const dt = Math.min(deltaTime, 0.033);
      const damping = 0.95;
      const similarityForce = 0.5;
      const repulsionForce = 2.0;
      const centerAttraction = 0.02;
      
      for (let i = 0; i < meshes.length; i++) {
        const mesh1 = meshes[i];
        const force = new THREE.Vector3();
        
        const toCenter = new THREE.Vector3(0, 0, 0).sub(mesh1.position);
        force.add(toCenter.multiplyScalar(centerAttraction));
        
        for (let j = 0; j < meshes.length; j++) {
          if (i === j) continue;
          
          const mesh2 = meshes[j];
          const diff = mesh2.position.clone().sub(mesh1.position);
          const distance = diff.length();
          
          if (distance < 0.1) continue;
          
          const id1 = mesh1.userData.diaryId;
          const id2 = mesh2.userData.diaryId;
          const similarity = similarityMatrix[id1]?.[id2] || 0.3;
          
          const minDistance = 1.5 + similarity * 1.5;
          
          if (distance < minDistance) {
            const repulsion = diff.clone().normalize().multiplyScalar(
              -repulsionForce * (1 - distance / minDistance)
            );
            force.add(repulsion);
          }
          
          if (similarity > 0.3 && distance > minDistance) {
            const attraction = diff.clone().normalize().multiplyScalar(
              similarityForce * similarity * Math.min(1, (distance - minDistance) / 10)
            );
            force.add(attraction);
          }
        }
        
        mesh1.userData.velocity.add(force.multiplyScalar(dt));
        mesh1.userData.velocity.multiplyScalar(damping);
        mesh1.position.add(mesh1.userData.velocity.clone().multiplyScalar(dt));
      }
    };

    const updateConnectionLines = () => {
      connectionLines.forEach(line => {
        const { id1, id2 } = line.userData;
        const mesh1 = nodeMeshes.find(m => m.userData.diaryId === id1);
        const mesh2 = nodeMeshes.find(m => m.userData.diaryId === id2);
        
        if (mesh1 && mesh2) {
          const positions = new Float32Array([
            mesh1.position.x, mesh1.position.y, mesh1.position.z,
            mesh2.position.x, mesh2.position.y, mesh2.position.z
          ]);
          line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          line.geometry.attributes.position.needsUpdate = true;
        }
      });
    };

    const updateLabels = () => {
      labelSprites.forEach(label => {
        const mesh = nodeMeshes.find(m => m.userData.diaryId === label.userData.diaryId);
        if (mesh) {
          label.position.copy(mesh.position);
          label.position.y += 1.8;
        }
      });
    };

    const findSimilarNotes = (diaryId, limit = 5) => {
      if (!diaryId) return [];
      
      const results = [];
      const currentDiary = props.diaries.find(d => d.id === diaryId);
      if (!currentDiary) return [];
      
      const currentEmbedding = currentDiary.embedding 
        ? parseEmbedding(currentDiary.embedding)
        : fallbackEmbedding(currentDiary.content);
      
      props.diaries.forEach(diary => {
        if (diary.id === diaryId) return;
        
        const embedding = diary.embedding 
          ? parseEmbedding(diary.embedding)
          : fallbackEmbedding(diary.content);
        
        const similarity = cosineSimilarity(currentEmbedding, embedding);
        const similarityPercent = Math.round(similarity * 100);
        
        if (similarityPercent >= 30) {
          results.push({
            ...diary,
            similarityPercent
          });
        }
      });
      
      return results.sort((a, b) => b.similarityPercent - a.similarityPercent).slice(0, limit);
    };

    const jumpToNode = (diaryId) => {
      const mesh = nodeMeshes.find(m => m.userData.diaryId === diaryId);
      if (!mesh) return;
      
      const targetPosition = mesh.position.clone();
      const offset = new THREE.Vector3(5, 3, 5);
      const cameraTarget = targetPosition.clone().add(offset);
      
      const startPosition = camera.position.clone();
      const startLookAt = new THREE.Vector3();
      controls.target.clone(startLookAt);
      
      let progress = 0;
      const animateCamera = () => {
        progress += 0.03;
        if (progress >= 1) {
          camera.position.copy(targetPosition.clone().add(offset));
          controls.target.copy(targetPosition);
          return;
        }
        
        const t = progress;
        camera.position.lerpVectors(startPosition, cameraTarget, t);
        controls.target.lerpVectors(startLookAt, targetPosition, t);
        controls.update();
        
        requestAnimationFrame(animateCamera);
      };
      
      animateCamera();
      
      const diary = props.diaries.find(d => d.id === diaryId);
      if (diary) {
        selectedNode.value = { ...diary };
        similarToSelected.value = findSimilarNotes(diaryId);
      }
    };

    const initScene = () => {
      const container = canvasContainer.value;
      if (!container) return;
      
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0a1a);
      
      const width = container.clientWidth;
      const height = container.clientHeight;
      
      camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
      camera.position.set(0, 0, 35);
      
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      container.appendChild(renderer.domElement);
      
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.screenSpacePanning = true;
      controls.minDistance = 8;
      controls.maxDistance = 80;
      controls.autoRotate = false;
      controls.autoRotateSpeed = 0.3;
      
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
      scene.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
      directionalLight.position.set(10, 20, 10);
      scene.add(directionalLight);
      
      const pointLight1 = new THREE.PointLight(0x6366f1, 0.4, 60);
      pointLight1.position.set(-20, 0, -20);
      scene.add(pointLight1);
      
      const pointLight2 = new THREE.PointLight(0x10b981, 0.3, 60);
      pointLight2.position.set(20, 10, 10);
      scene.add(pointLight2);
      
      const starGeometry = new THREE.BufferGeometry();
      const starCount = 3000;
      const positions = new Float32Array(starCount * 3);
      
      for (let i = 0; i < starCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 300;
        positions[i + 1] = (Math.random() - 0.5) * 300;
        positions[i + 2] = (Math.random() - 0.5) * 300;
      }
      
      starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      
      const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.15,
        transparent: true,
        opacity: 0.7
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

    let lastTime = Date.now();
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      
      const now = Date.now();
      const deltaTime = (now - lastTime) / 1000;
      lastTime = now;
      
      if (!isDragging && nodeMeshes.length > 0) {
        updatePhysics(nodeMeshes, window.similarityMatrix || {}, deltaTime);
        
        if (showConnections.value) {
          updateConnectionLines();
        }
        if (showLabels.value) {
          updateLabels();
        }
      }
      
      nodeMeshes.forEach(mesh => {
        const time = now * 0.001;
        const floatY = Math.sin(time + mesh.userData.diaryId * 0.5) * 0.002;
        mesh.position.y += floatY;
        
        if (mesh.material) {
          const pulseIntensity = 0.98 + Math.sin(time * 1.5 + mesh.userData.diaryId) * 0.02;
          mesh.scale.setScalar(pulseIntensity);
        }
        
        if (mesh.children && mesh.children[0]) {
          const glowIntensity = 0.8 + Math.sin(time * 2) * 0.2;
          mesh.children[0].material.opacity = 0.12 * glowIntensity;
        }
      });
      
      if (!isDragging) {
        controls.update();
      }
      
      controls.autoRotate = autoRotate.value;
      
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
        let mesh = intersects[0].object;
        while (mesh.parent && mesh.parent !== scene && mesh.parent.type !== 'Scene') {
          mesh = mesh.parent;
        }
        
        if (mesh.userData && mesh.userData.diary) {
          const diary = mesh.userData.diary;
          selectedNode.value = { ...diary };
          similarToSelected.value = findSimilarNotes(diary.id);
          
          nodeMeshes.forEach(m => {
            if (m.material) {
              m.material.emissiveIntensity = 0.1;
            }
          });
          
          if (mesh.material) {
            mesh.material.emissiveIntensity = 0.6;
          }
        }
      } else {
        selectedNode.value = null;
        similarToSelected.value = [];
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
        
        const planeNormal = camera.getWorldDirection(new THREE.Vector3()).negate();
        const plane = new THREE.Plane(planeNormal, 0);
        plane.constant = -planeNormal.dot(camera.position) - 5;
        
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersectPoint);
        
        if (intersectPoint) {
          draggedNode.position.copy(intersectPoint);
          draggedNode.userData.velocity.set(0, 0, 0);
        }
      }
      
      if (!isDragging) {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(nodeMeshes, true);
        
        document.body.style.cursor = intersects.length > 0 ? 'pointer' : 'auto';
        
        if (showLabels.value) {
          labelSprites.forEach(label => {
            const isHovered = intersects.some(intersect => {
              let targetMesh = intersect.object;
              while (targetMesh.parent && targetMesh.parent !== scene) {
                targetMesh = targetMesh.parent;
              }
              return targetMesh.userData && targetMesh.userData.diaryId === label.userData.diaryId;
            });
            
            label.material.opacity = isHovered ? 0.9 : 0.1;
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
        let mesh = intersects[0].object;
        while (mesh.parent && mesh.parent !== scene && mesh.parent.type !== 'Scene') {
          mesh = mesh.parent;
        }
        draggedNode = mesh;
        controls.enabled = false;
        physicsEnabled = false;
      }
    };

    const onMouseUp = () => {
      if (isDragging && draggedNode) {
        draggedNode.userData.velocity.set(0, 0, 0);
        setTimeout(() => {
          physicsEnabled = true;
        }, 100);
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
      camera.position.set(0, 0, 35);
      camera.lookAt(0, 0, 0);
      controls.reset();
    };

    const toggleAutoRotate = () => {
      autoRotate.value = !autoRotate.value;
    };

    const reclustering = () => {
      if (props.diaries && props.diaries.length > 0) {
        nextTick(() => {
          updateNodes(props.diaries);
        });
      }
    };

    const reviewNode = () => {
      if (selectedNode.value) {
        emit('review', selectedNode.value.id);
        selectedNode.value = null;
        similarToSelected.value = [];
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
      
      if (!scene || !diaries || diaries.length === 0) return;
      
      const { matrix, embeddings } = buildSimilarityMatrix(diaries);
      window.similarityMatrix = matrix;
      diaryEmbeddings = embeddings;
      
      const clusterCount = Math.min(3, Math.max(1, Math.floor(diaries.length / 5) + 1));
      const clusteredDiaries = kMeansClustering(diaries, matrix, Math.max(1, clusterCount));
      
      const positions = generateInitialPositions(clusteredDiaries);
      
      positions.forEach(item => {
        const mesh = createNodeMesh(item.diary, item.position);
        scene.add(mesh);
        nodeMeshes.push(mesh);
        
        if (showLabels.value) {
          const label = createLabelSprite(item.diary, item.position);
          scene.add(label);
          labelSprites.push(label);
        }
      });
      
      if (showConnections.value) {
        connectionLines = createConnectionLines(nodeMeshes, matrix, 0.4);
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
      if (value && window.similarityMatrix) {
        connectionLines = createConnectionLines(nodeMeshes, window.similarityMatrix, 0.4);
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
      similarToSelected,
      getEmotionLabel,
      getDisplayScore,
      getSimilarityClass,
      resetCamera,
      toggleAutoRotate,
      reclustering,
      reviewNode,
      jumpToNode
    };
  }
};
</script>

<style scoped>
.space-view-container {
  position: relative;
  width: 100%;
  height: 550px;
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
  padding: 8px 14px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 8px;
  color: #e2e8f0;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  backdrop-filter: blur(4px);
}

.control-btn:hover {
  background: rgba(30, 41, 59, 0.95);
  border-color: rgba(148, 163, 184, 0.5);
}

.control-btn.active {
  background: rgba(99, 102, 241, 0.35);
  border-color: rgba(99, 102, 241, 0.5);
  color: #818cf8;
}

.control-label {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: rgba(15, 23, 42, 0.85);
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
  background: rgba(15, 23, 42, 0.85);
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
  background: #6366f1;
  box-shadow: 0 0 6px rgba(99, 102, 241, 0.5);
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
  width: 320px;
  max-height: calc(100% - 32px);
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 12px;
  overflow: hidden;
  backdrop-filter: blur(12px);
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

.similar-notes-section {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.similar-notes-header {
  font-size: 13px;
  font-weight: 500;
  color: #94a3b8;
  margin-bottom: 10px;
}

.similar-notes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.similar-note-item {
  padding: 10px 12px;
  background: rgba(30, 41, 59, 0.6);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.similar-note-item:hover {
  background: rgba(51, 65, 85, 0.8);
  border-color: rgba(99, 102, 241, 0.3);
}

.similar-note-preview {
  font-size: 12px;
  color: #cbd5e1;
  line-height: 1.5;
  margin-bottom: 6px;
}

.similar-note-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.similar-note-date {
  font-size: 11px;
  color: #64748b;
}

.similarity-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.similarity-badge.high {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.similarity-badge.medium {
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
}

.similarity-badge.low {
  background: rgba(107, 114, 128, 0.15);
  color: #9ca3af;
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
