<template>
  <div class="card">
    <div class="card-header">
      <span class="card-title">日历视图</span>
    </div>
    
    <div class="calendar-nav">
      <button @click="prevMonth">←</button>
      <span class="calendar-month">{{ currentMonthFormat }}</span>
      <button @click="nextMonth">→</button>
    </div>
    
    <div class="calendar">
      <div class="calendar-header">日</div>
      <div class="calendar-header">一</div>
      <div class="calendar-header">二</div>
      <div class="calendar-header">三</div>
      <div class="calendar-header">四</div>
      <div class="calendar-header">五</div>
      <div class="calendar-header">六</div>
      
      <template v-for="(day, index) in calendarDays" :key="index">
        <div 
          class="calendar-day"
          :class="{
            'other-month': day.isOtherMonth,
            'has-emotion': day.hasEmotion,
            'positive': day.emotionType === 'positive',
            'negative': day.emotionType === 'negative',
            'neutral': day.emotionType === 'neutral',
            'today': day.isToday
          }"
          @click="selectDay(day)"
        >
          <span>{{ day.day }}</span>
        </div>
      </template>
    </div>
    
    <div class="divider"></div>
    
    <div style="display: flex; gap: 16px; font-size: 13px;">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="width: 12px; height: 12px; background: var(--positive-color); border-radius: 2px;"></span>
        <span>积极</span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="width: 12px; height: 12px; background: var(--negative-color); border-radius: 2px;"></span>
        <span>消极</span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="width: 12px; height: 12px; background: var(--neutral-color); border-radius: 2px;"></span>
        <span>平稳</span>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed } from 'vue';
import dayjs from 'dayjs';

export default {
  name: 'CalendarView',
  props: {
    diaries: {
      type: Array,
      default: () => []
    }
  },
  emits: ['select'],
  setup(props, { emit }) {
    const currentMonth = ref(dayjs());
    
    const currentMonthFormat = computed(() => {
      return currentMonth.value.format('YYYY年MM月');
    });

    const calendarDays = computed(() => {
      const firstDayOfMonth = currentMonth.value.startOf('month');
      const startDay = firstDayOfMonth.startOf('week');
      const days = [];
      
      for (let i = 0; i < 42; i++) {
        const currentDay = startDay.add(i, 'day');
        const dayStr = currentDay.format('YYYY-MM-DD');
        const diary = props.diaries.find(d => d.date === dayStr);
        
        days.push({
          day: currentDay.format('D'),
          date: dayStr,
          isOtherMonth: !currentDay.isSame(currentMonth.value, 'month'),
          isToday: currentDay.isSame(dayjs(), 'day'),
          hasEmotion: !!diary,
          emotionType: diary?.emotion_type || null,
          diary: diary
        });
      }
      
      return days;
    });

    const prevMonth = () => {
      currentMonth.value = currentMonth.value.subtract(1, 'month');
    };

    const nextMonth = () => {
      currentMonth.value = currentMonth.value.add(1, 'month');
    };

    const selectDay = (day) => {
      if (day.hasEmotion && day.diary) {
        emit('select', day.diary);
      }
    };

    return {
      currentMonth,
      currentMonthFormat,
      calendarDays,
      prevMonth,
      nextMonth,
      selectDay
    };
  }
};
</script>
