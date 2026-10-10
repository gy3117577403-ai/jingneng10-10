@extends('adminlte::page')

@section('title', __('general_content.calendar_trans_key'))

@section('content_header')
  <h1>{{ __('general_content.calendar_trans_key') }}</h1>
@stop

@section('content')
<div class="card">
  <div class="card-body">
    <div id="calendar"></div>
  </div>
</div>
@stop

@section('css')
  <link href='https://cdn.jsdelivr.net/npm/fullcalendar@6.1.9/index.global.min.css' rel='stylesheet'>
@stop

@section('js')
  <script src='https://cdn.jsdelivr.net/npm/fullcalendar@6.1.9/index.global.min.js'></script>
  <script>
    document.addEventListener('DOMContentLoaded', function () {
      const calendarEl = document.getElementById('calendar');
      const eventsUrl  = '{{ $eventType === 'orders'
          ? route('production.calendar.orders.events')
          : route('production.calendar.tasks.events') }}';

      const calendar = new FullCalendar.Calendar(calendarEl, {
        height: 800,
        themeSystem: 'bootstrap',
        headerToolbar: {
          left:   'prev,next today',
          center: 'title',
          right:  'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
        },
        locale: '{{ config('app.locale') }}',
        buttonText: {today: '今天', month: '月', week: '周', day: '日', list: '列表'},
        allDayText: '全天', noEventsText: '暂无日程',
        moreLinkText: n => `还有 ${n} 项`,
        events: function (info, successCallback, failureCallback) {
          fetch(eventsUrl, { headers: { 'Accept': 'application/json' } })
            .then(r => r.json())
            .then(successCallback)
            .catch(failureCallback);
        },
      });

      calendar.render();
    });
  </script>
@stop
