import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Legend, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ArrowLeft, Heart, Cpu, CheckCircle, Wifi, WifiOff, Battery, Server } from 'lucide-react';
import patientImg from './patient.webp';
import './style.css';


//admin
//AegisCare@2026
export const API_URL = import.meta.env.VITE_CARDIO_API_URL || 'http://127.0.0.1:5052';
const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws/client';   //http ->ws add it to /ws/client

async function getJSON(path) {              //when send data to backend,backend connectivity check
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return res.json();
}

async function postJSON(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return res.json();
}

// Created once to every sample: format time
const FMT = new Intl.DateTimeFormat('en-US', {
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});


/*-----------------------------------------Live PPG Chart-----------------------------------------------------------*/
const MAX_LIVE_POINTS = 150;   // live chart max points 
const FLUSH_MS = 200;          // state update eka 200ms ekakata parak (5 Hz): 5s updatate

/*  Live PPG charts (memo: only re-renders when "data" changes)        */
const LiveCharts = memo(function LiveCharts(
  { data, anomalyProb, riskLevel, riskColor, telemetryText, telemetryColor }) {
  // index -> real time label
  const idxToTime = (idx) => {
    if (!data.length) return '';
    const p = data[Math.round(idx) - data[0].ts];
    return p ? FMT.format(new Date(p.wall)) : '';
  };

  const xAxisProps = {
    dataKey: 'ts',
    type: 'number',
    scale: 'time',
    domain: ['dataMin', 'dataMax'],
    tickFormatter: idxToTime,    //convert no to time
    stroke: '#64748b',
    height: 38,
    tickCount: 5,
    minTickGap: 40,
    fontSize: 10,
    tickMargin: 4,

  };
  return (
    <div className="cardio-card" style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <h4 style={{ margin: '0 0 10px 0', fontSize: '30px' }}>Advanced PPG Waveforms</h4>

      <span style={{ fontSize: '20px', color: '#0a0a0a' }}>Real-time Heart Rate</span>
      <div style={{ height: '250px', backgroundColor: '#f8fafc', borderRadius: '6px', marginTop: '5px', border: '1px solid #e2e8f0', marginBottom: '15px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              {...xAxisProps}
              label={{ value: 'Time', position: 'insideBottom', offset: -2, fontSize: '11px', fill: '#64748b' }}
            />

            <YAxis
              domain={['auto', 'auto']}
              stroke="#64748b"
              fontSize={10}
              width={55}
              tickFormatter={(v) => Math.round(v)}
              label={{ value: 'IR Signal', angle: -90, position: 'insideLeft', offset: 5, fontSize: '11px', fill: '#64748b', style: { textAnchor: 'middle' } }}
            />

            <YAxis yAxisId="hr" hide domain={['auto', 'auto']} />

            <Tooltip
              labelFormatter={idxToTime}
              formatter={(value) => [`${Math.round(value)} bpm`, 'Heart Rate']}
              contentStyle={{ backgroundColor: '#ced5e7', borderColor: '#dae3f0', color: '#0a0a0a', borderRadius: '6px' }}
              itemStyle={{ color: '#0f0f0f', fontSize: '12px' }}
            />

            <Line type="monotone" dataKey="ir" stroke="#252926" strokeWidth={2} dot={false} isAnimationActive={false} tooltipType="none" />

            <Line yAxisId="hr" dataKey="hr" name="Heart Rate" stroke="transparent" dot={false} activeDot={false} isAnimationActive={false} />

            {/*<Line type="monotone" tension={0.5} dataKey="ir" stroke="#252926" strokeWidth={2} dot={false} isAnimationActive={false} />
          */}
          </LineChart>
        </ResponsiveContainer>
      </div>

{/*----------------------------------------- End of Live PPG Chart-----------------------------------------------------------*/}


      {/*----------------------------------- AI Risk & Anomaly Assessment Card---------------------------------------------------------- */}
      <div className="cardio-card" style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginTop: '50px' }}>
        <h4 style={{ margin: '0 0 15px 0', fontSize: '22px' }}>AI Health Risk Analysis</h4>
        <p style={{ margin: '0 0 15px 0', fontSize: '15px', color: '#64748b' }}>
          Real-time anomaly detection based on PPG & vitals telemetry.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <span>Anomaly Probability:</span>
            <span style={{ fontWeight: 'bold', color: riskColor }}>
              {anomalyProb}% ({riskLevel})
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <span>Telemetry Status:</span>
            <span style={{ fontWeight: 'bold', color: telemetryColor }}>
              {telemetryText}
            </span>
          </div>
        </div>
      </div>
    </div>

  );
});


/*---------------------------------------------------------------  Historical trends card (memo: not affected by live updates)        */
const HistoryCard = memo(function HistoryCard({ longTermData, timeframe, summaryStats, onTimeframeChange }) {
  return (
    <div className="cardio-card" style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <h4 style={{ margin: '0 0 10px 0', fontSize: '30px' }}>Historical Vitals Trends</h4>
      <span style={{ fontSize: '20px', fontWeight: '600' }}>Recent Vitals Trend ({timeframe.toUpperCase()})</span>

      <div style={{ height: '360px', backgroundColor: '#f8fafc', borderRadius: '6px', marginTop: '5px', border: '1px solid #e2e8f0', marginBottom: '15px' }}>
        {longTermData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={longTermData} margin={{ top: 10, right: 10, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="name"
                stroke="#64748b"
                fontSize={10}
                interval="preserveStartEnd"
                minTickGap={30}
                tickMargin={4}
                height={38}
                label={{ value: timeframe === 'daily' ? 'Time (hourly avg)' : 'Date (daily avg)', position: 'insideBottom', offset: -2, fontSize: '11px', fill: '#64748b' }}
              />
              <YAxis
                domain={['auto', 'auto']}
                stroke="#64748b"
                fontSize={10}
                width={55}
                label={{ value: 'Average Value', angle: -90, position: 'insideLeft', offset: 5, fontSize: '11px', fill: '#64748b', style: { textAnchor: 'middle' } }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#ced5e7', borderColor: '#dae3f0', color: '#070707', borderRadius: '6px' }}
                itemStyle={{ color: '#0f0f0f', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '10px', paddingTop: 10 }} />
              <Line type="natural" dataKey="hr" name="Heart Rate (BPM)" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
              <Line type="natural" dataKey="sys" name="Systolic BP" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
              <Line type="natural" dataKey="dia" name="Diastolic BP" stroke="#38bdf8" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ textAlign: 'center', fontSize: '20px', color: '#94a3b8', paddingTop: '60px' }}>No data for selected timeframe.</p>
        )}
      </div>

      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '20px', fontWeight: 'bold' }}>Vitals Summary Range</span>
          {/*<select value={timeframe} onChange={(e) => onTimeframeChange(e.target.value)} style={{ fontSize: '20px', padding: '2px 4px' }}>
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
          </select> */}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '10px', fontSize: '20px' }}>
          <div>
            <span style={{ color: '#0d0d0e', fontWeight: '500' }}>Heart Rate</span>
            <p style={{ margin: 0, fontWeight: 'bold', color: '#ef4444' }}>{summaryStats.hrRange} bpm</p>
          </div>
          <div>
            <span style={{ color: '#0d0d0e', fontWeight: '500' }}>Blood Pressure</span>
            <p style={{ margin: 0, fontWeight: 'bold', color: '#2563eb' }}>{summaryStats.bpRange} mmHg</p>
          </div>
          <div>
            <span style={{ color: '#0d0d0e', fontWeight: '500' }}>Pulse Interval</span>
            <p style={{ margin: 0, fontWeight: 'bold' }}>{summaryStats.piRange}</p>
          </div>
        </div>

        <p style={{ fontSize: '15px', margin: '10px 0 0 0', color: '#64748b' }}>
          Status: <strong>{summaryStats.status}</strong>
        </p>
      </div>
    </div>
  );
});
/*--------------------------------------------------------------- End of Historical trends card (memo: not affected by live updates)        */


/*------------------------------------------------------------Historical trends Bucket-wise average calculator (pure function, outside component)  */
const buildAveragedChartData = (logs, tf) => {
  // DAILY / LAST20: raw points
  if (tf === 'daily' || tf === 'last20') {
    const raw = logs.slice().reverse().map((item) => ({
      name: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      hr: Number(item.heart_rate) || null,
      sys: Number(item.systolic_bp) || null,
      dia: Number(item.diastolic_bp) || null,
    }));

    // large no of records canslow chart. souse max~300 points then get only 150 points
    const step = Math.ceil(raw.length / 300);
    const reduced = step > 1 ? raw.filter((_, i) => i % step === 0) : raw;
    return reduced.slice(-150);
  }

  // MONTHLY day-wise average
  const buckets = {};
  logs.forEach((item) => {
    const d = new Date(item.created_at);
    if (isNaN(d.getTime())) return;
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);

    const key = start.getTime();
    if (!buckets[key]) buckets[key] = { start, hr: [], sys: [], dia: [] };

    const hr = Number(item.heart_rate);
    const sys = Number(item.systolic_bp);
    const dia = Number(item.diastolic_bp);
    if (hr) buckets[key].hr.push(hr);
    if (sys) buckets[key].sys.push(sys);
    if (dia) buckets[key].dia.push(dia);
  });

  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

  return Object.keys(buckets)
    .sort((a, b) => a - b)
    .map((key) => {
      const b = buckets[key];
      return {
        name: b.start.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        hr: avg(b.hr),
        sys: avg(b.sys),
        dia: avg(b.dia),
      };
    });
};

/*------------------------------------------------------------Historical trends Bucket-wise average calculator (pure function, outside component)  */


/*  Main page                                                          */
export default function Cardiovascular() {
  // --- WebSocket & Real-time State ---
  const [data, setData] = useState([]);
  const [realtimeData, setRealtimeData] = useState({
    inst_hr: 0,
    avg_hr: 0,
    bp_sys: 120,
    bp_dia: 80,
    pulse_interval: 0,
    db_avg_status: 'Normal',
    status: 'Disconnected',
    battery_level: null,
    is_charging: false,
    timestamp: null,
  });

  const [recentLogs, setRecentLogs] = useState([]);
  const [isServerConnected, setIsServerConnected] = useState(false);
  const [isEsp32Active, setIsEsp32Active] = useState(false);

  // Refs: WebSocket messages  buffer wenawa, stop re-rendering
  const lastMsgTimeRef = useRef(Date.now());
  const pendingRef = useRef([]);   // chart points store buffer
  const latestRef = useRef(null);  // latest payload (for  cards )
  const dcRef = useRef(null);   // baseline
  const lpRef = useRef(0);      // smoothed value
  const idxRef = useRef(0);     // sample index

  // --- Trends & Data States ---
  const [longTermData, setLongTermData] = useState([]);   //trends chart
  const [timeframe, setTimeframe] = useState('daily');

  // --- Patient Analytics & Annotations State ---
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [vitalsData, setVitalsData] = useState([]);
  const [eventsData, setEventsData] = useState([]);
  const [activityType, setActivityType] = useState('Medication');
  const [eventTime, setEventTime] = useState('14:02');
  const [notes, setNotes] = useState('');


  //------------------------------------------------------------------------------ Dynamic AI Risk calculations based on real-time data:hr,bp
  const anomalyProb = useMemo(() => {
    if (!isEsp32Active || realtimeData.avg_hr === 0) return 2.4;
    // based on Heart rate deviation & BP values dunamically  risk probability change: substract 75 from real hr value. it give how much diference real,predicted value
    const hrDeviation = Math.abs(realtimeData.avg_hr - 75);
    const bpFactor = realtimeData.bp_sys > 130 || realtimeData.bp_dia > 85 ? 15.0 : 0.0;
    return Math.min(99.9, Math.max(1.2, hrDeviation * 0.4 + bpFactor)).toFixed(1);
  }, [isEsp32Active, realtimeData]);

  const riskLevel = anomalyProb > 50 ? 'High' : anomalyProb > 15 ? 'Moderate' : 'Low';
  const riskColor = anomalyProb > 50 ? '#ef4444' : anomalyProb > 15 ? '#f59e0b' : '#22c55e';

  const telemetryText = !isEsp32Active
    ? 'Disconnected'
    : realtimeData.status === 'Measuring'
      ? 'Stable Stream'
      : 'Sensor Idle (No Finger)';
  const telemetryColor = !isEsp32Active ? '#ef4444' : realtimeData.status === 'Measuring' ? '#22c55e' : '#d97706';
    //---------------------------------------------------------------End of  Dynamic AI Risk calculations based on real-time data:hr,bp


  // 1. WebSocket Setup:keep websocket connection with backend (buffer only -no setState here,noreload)
  //fingr detect
  //try to connect backend
  useEffect(() => {
    let ws;
    let retryTimer;
    let closedByUs = false;
    //strart web sockt connection
    const connect = () => {                     
      ws = new WebSocket(WS_URL);

      ws.onopen = () => setIsServerConnected(true);
 
      {/*run when recieve new msg from backend */}
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);                {/*json -> js*/}
          latestRef.current = payload;
          lastMsgTimeRef.current = Date.now();

          const nowMs = Date.now();
          const pi = payload.pulse_interval || 0;
          {/*}
          if (Array.isArray(payload.samples) && payload.samples.length) {
            // ESP32 timestamp = device millis, so wall-clock ekata convert karanawa
            const offset = payload.timestamp ? nowMs - payload.timestamp : 0;
            for (const [ts, ir] of payload.samples) {
              if (ir > 70000) {
                pendingRef.current.push({ ts: ts + offset, ir, pulse_interval: pi });
              }
            }
          } else if (payload.ir > 70000) {
            // fallback: old backend (samples nathi)
            pendingRef.current.push({ ts: nowMs, ir: payload.ir, pulse_interval: pi });
          }
            */}
            //---------------------------------------------------------------------------------clean data for graph
          if (payload.status === 'Measuring' && payload.ir) {
            const ir = payload.ir;

            if (dcRef.current === null) dcRef.current = ir;
            dcRef.current = 0.98 * dcRef.current + 0.02 * ir;   // baseline (drift) track 
            const hp = ir - dcRef.current;                       // drift rempvr
            lpRef.current += 0.3 * (hp - lpRef.current);         // smooth 

            pendingRef.current.push({
              ts: idxRef.current++,      //  index 
              wall: nowMs,
              ir: -lpRef.current,        // minus: PPG peaks get to up
              hr: payload.avg_hr,
              pulse_interval: pi,
            });
          } else {
            dcRef.current = null;        // finger remove -> reset
            lpRef.current = 0;
          }
        } catch (err) {
          console.error('Error parsing WS data:', err);
        }
      };

      ws.onclose = () => {
        setIsServerConnected(false);
        setIsEsp32Active(false);
        if (!closedByUs) retryTimer = setTimeout(connect, 2000); // try after 2 sec
      };
      ws.onerror = () => ws.close();
    };

    connect();

    const timeoutCheck = setInterval(() => {
      if (Date.now() - lastMsgTimeRef.current > 30000) setIsEsp32Active(false);
    }, 2000);

    return () => {
      closedByUs = true;
      clearTimeout(retryTimer);
      if (ws) ws.close();
      clearInterval(timeoutCheck);
    };
  }, []);

  // 1b. Flush: every 200ms update frontend data
  useEffect(() => {
    const id = setInterval(() => {
      if (latestRef.current) {
        setRealtimeData(latestRef.current);
        setIsEsp32Active(true);
        latestRef.current = null;
      }
      if (pendingRef.current.length) {
        const batch = pendingRef.current;
        pendingRef.current = [];
        setData((prev) => [...prev, ...batch].slice(-MAX_LIVE_POINTS));
      }
    }, FLUSH_MS);
    return () => clearInterval(id);
  }, []);

  // 2. Fetch Log Data   ased on time frame  :research trends
  const fetchLogsByTimeframe = async (selectedTimeframe) => {
    try {
      const res = await getJSON(`/api/vital-logs/filtered?timeframe=${selectedTimeframe}`);

      if (Array.isArray(res) && res.length > 0) {
        setRecentLogs(res);
        setLongTermData(buildAveragedChartData(res, selectedTimeframe));
      } else {
        setRecentLogs([]);
        setLongTermData([]);
      }
    } catch (error) {
      setRecentLogs([]);
      setLongTermData([]);
    }
  };

  useEffect(() => {
    fetchLogsByTimeframe(timeframe);
    const interval = setInterval(() => fetchLogsByTimeframe(timeframe), 30000);
    return () => clearInterval(interval);
  }, [timeframe]);


  // 3. Analytics & Event Data  : annotations
  const fetchAnalyticsData = async (date) => {
    try {
      const res = await getJSON(`/api/patient-activity-analytics?selected_date=${date}`);
      const rawVitals = res.vitals || [];
      const rawEvents = res.events || [];

      const formattedVitals = rawVitals.map((v) => ({ ...v, timestampMs: new Date(v.created_at).getTime() }));
      const mappedVitals = formattedVitals.map((v) => {
        const matchedEvents = rawEvents.filter((ev) => Math.abs(new Date(ev.event_time).getTime() - v.timestampMs) < 60000);
        return { ...v, events: matchedEvents.length > 0 ? matchedEvents : null };
      });

      console.log('analytics response:', res);
      //setVitalsData(mappedVitals.slice(-300));
      setVitalsData(mappedVitals);
      setEventsData(rawEvents.slice(-50));
    } catch (err) {
      console.error('Analytics Error:', err);
    }
  };

  useEffect(() => {
    fetchAnalyticsData(selectedDate);
    const id = setInterval(() => fetchAnalyticsData(selectedDate), 30000);
    return () => clearInterval(id);
  }, [selectedDate]);

  //add patient event in annotation
  const handleAddEvent = async (e) => {
    e.preventDefault();
    const localDateTime = new Date(`${selectedDate}T${eventTime}:00`);
    try {
      await postJSON('/api/patient-events', {
        event_time: localDateTime.toISOString(),
        activity_type: activityType,
        notes: notes,
      });
      setNotes('');
      fetchAnalyticsData(selectedDate);
    } catch (err) {
      console.error('Save Event Error:', err);
    }
  };

  //----------------------------------------------------------- Vitals Summary Calculations
  const summaryStats = useMemo(() => {
    if (!recentLogs.length) return { hrRange: '0.0 - 0.0', bpRange: '0/0 - 0/0', piRange: 'N/A', status: 'No Data' };
    const hrs = recentLogs.map((l) => Number(l.heart_rate)).filter(Boolean);
    const sysBps = recentLogs.map((l) => Number(l.systolic_bp)).filter(Boolean);
    const diaBps = recentLogs.map((l) => Number(l.diastolic_bp)).filter(Boolean);
    const pis = recentLogs.map((l) => Number(l.pulse_interval)).filter(Boolean);

    //get averagevalues:gel all value/length
    const avgHr = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : 0;
    const avgSys = sysBps.length ? sysBps.reduce((a, b) => a + b, 0) / sysBps.length : 0;
    const avgDia = diaBps.length ? diaBps.reduce((a, b) => a + b, 0) / diaBps.length : 0;
    const avgPi = pis.length ? pis.reduce((a, b) => a + b, 0) / pis.length : 0;
    //remove 20 to create range for avrage
    return {
      hrRange: `${Math.max(0, avgHr - 10).toFixed(1)} - ${(avgHr + 10).toFixed(1)}`,
      bpRange: `${Math.max(0, Math.round(avgSys - 10))}/${Math.max(0, Math.round(avgDia - 10))} - ${Math.round(avgSys + 10)}/${Math.round(avgDia + 10)}`,
      piRange: `${Math.max(0, Math.round(avgPi - 10))} - ${Math.round(avgPi + 10)}`,
      status: recentLogs.some((l) => l.patient_status === 'Critical') ? 'Critical Warning' : 'Normal',
    };
  }, [recentLogs]);
    //-----------------------------------------------------------End of  Vitals Summary Calculations


  const getActivityColor = (type) => {
    switch (type) {
      case 'Exercise': return '#ef4444';
      case 'Medication': return '#2563eb';
      case 'Meditation': return '#10b981';
      case 'Sleep': return '#8b5cf6';
      default: return '#f59e0b';
    }
  };
  /*
    const annotationChartData = useMemo(() => {
      const BUCKET = 5 * 60 * 1000; // 5 min average
      const GAP = 15 * 60 * 1000;   // meke wadi gap ekak unoth line eka kapanawa
      const buckets = {};
  
  
      vitalsData.forEach((v) => {
        const hr = Number(v.heart_rate);
        // created_at එක Date object එකක් ලෙස ගෙන timestampMs සාදා ගන්න
        const tsMs = v.timestampMs || (v.created_at ? new Date(v.created_at).getTime() : NaN);
  
        if (!hr || isNaN(tsMs)) return;
  
        const key = Math.floor(tsMs / BUCKET) * BUCKET;
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(hr);
      });
      const points = Object.keys(buckets)
        .map(Number)
        .sort((a, b) => a - b)
        .map((key) => ({
          ts: key,
          hr: Math.round(buckets[key].reduce((a, b) => a + b, 0) / buckets[key].length),
        }));
  
      const result = [];
      points.forEach((p, i) => {
        if (i > 0 && p.ts - points[i - 1].ts > GAP) {
          result.push({ ts: points[i - 1].ts + BUCKET, hr: null });
        }
        result.push(p);
      });
      return result;
    }, [vitalsData]);
  
    */


/*-----------------------------------------------------------------------Annotation---------------------------------------------------------*/
  const annotationChartData = useMemo(() => {
    const BUCKET = 5 * 60 * 1000;      // 5 min average in ms
    const GAP = 3 * 60 * 60 * 1000;    // 3 hours gap:if more than 3 hr gap line not connect
    const SMOOTH = 3;                  // moving average window (3 buckets)
    const buckets = {};              ///store data object

    vitalsData.forEach((v) => {
      const hr = Number(v.heart_rate);
      const tsMs = v.timestampMs || (v.created_at ? new Date(v.created_at).getTime() : NaN);
      if (!hr || isNaN(tsMs)) return;
      const key = Math.floor(tsMs / BUCKET) * BUCKET;
      (buckets[key] ||= []).push(hr);
    });

    // bucket average
    const points = Object.keys(buckets)   //get timestmps
      .map(Number)
      .sort((a, b) => a - b)    //time otfrt -old to new
      .map((key) => ({
        ts: key,
        hr: buckets[key].reduce((a, b) => a + b, 0) / buckets[key].length,       //get avg hr value
      }));

    // moving average (smooth)
    const smoothed = points.map((p, i) => {
      const from = Math.max(0, i - Math.floor(SMOOTH / 2));
      const to = Math.min(points.length, i + Math.floor(SMOOTH / 2) + 1);
      const slice = points.slice(from, to);
      return { ts: p.ts, hr: Math.round(slice.reduce((a, b) => a + b.hr, 0) / slice.length) };    // add values to p array
    });

    // big gaps -> null (line cut)
    const result = [];
    smoothed.forEach((p, i) => {
      if (i > 0 && p.ts - smoothed[i - 1].ts > GAP) {
        result.push({ ts: smoothed[i - 1].ts + BUCKET, hr: null }); //gap more than 3 hr line brake
      }
      result.push(p);               //add to p
    });
    return result;
  }, [vitalsData]);               //when chnge vital data do this again


  const annotationDomain = useMemo(() => {
    const times = [
      ...annotationChartData.map((d) => d.ts),
      ...eventsData.map((e) => new Date(e.event_time).getTime()),
    ].filter((t) => !isNaN(t));
    return times.length ? [Math.min(...times), Math.max(...times)] : ['auto', 'auto'];
  }, [annotationChartData, eventsData]);

  const patientStatus = isEsp32Active ? realtimeData.db_avg_status : summaryStats.status;
  const statusIsCritical = patientStatus === 'Critical' || patientStatus === 'Critical Warning';



  /*---------------------------------------------------------End of Annotation---------------------------------------------------------*/

  return (
    <div className="cardio-root" style={{ display: 'flex', backgroundColor: '#e2e8f0', minHeight: '100vh', paddingTop: '84px', fontFamily: 'Segoe UI, sans-serif', color: '#1e293b' }}>
      {/* the site's CSS reset removes default heading weight - restore it for this page */}
      <style>{`.cardio-root h2, .cardio-root h3, .cardio-root h4 { font-weight: 700; } @media (max-width: 1100px) { .cardio-grid { grid-template-columns: 1fr !important; } }`}</style>

      {/* Main Workspace */}
      <div style={{ flex: 1, padding: '20px 30px', overflowY: 'auto' }}>

        {/* header */}
        <div style={{
          backgroundColor: '#346086',
          backgroundImage: `
    linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px)
  `,
          backgroundSize: '30px 30px',
          padding: '24px 32px',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}>
          {/* Back/End Session Link */}
          <Link to="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '15px', fontWeight: 500, color: '#ffff', textDecoration: 'none', paddingLeft: '100px' }}>
            <ArrowLeft size={18} /> Back to Dashbord
          </Link>

          {/* Top Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px', paddingLeft: '100px' }}>
            <div>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#e2e6e7' }}>Module 03 · Owner: Hirushi Divyanjalie</p>
              <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Heart Rate & Blood Pressure Monitoring Dashboard</h2>
            </div>

            <div style={{ flex: 1, height: '70px', overflow: 'hidden', display: 'flex', alignItems: 'center', position: 'relative' }}>
              <svg width="100%" height="65" viewBox="0 0 600 65" preserveAspectRatio="none">
                {/* Background Glowing Heart */}
                <path
                  d="M300,52 C275,38 220,24 220,12 C220,4 230,0 242,0 C256,0 275,10 300,28 C325,10 344,0 358,0 C370,0 380,4 380,12 C380,24 325,38 300,52 Z"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeOpacity="0.5"
                  filter="drop-shadow(0px 0px 6px rgba(56, 189, 248, 0.6))"
                />
                {/* Animated EKG Line passing through the heart */}
                <path
                  className="ekg-animated-path"
                  d="M0,32 L200,32 L215,18 L230,48 L245,10 L260,52 L275,32 L325,32 L340,18 L355,48 L370,10 L385,52 L400,32 L600,32"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="drop-shadow(0px 0px 8px rgba(56, 189, 248, 0.9))"
                />
              </svg>
            </div>

            {/* connectivity badges */}
            <div style={{ display: 'flex', gap: '10px' }}>
              {/* backend connectivity */}
              <span style={{ backgroundColor: '#e2e8f0', padding: '6px 12px', borderRadius: '15px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #cbd5e1' }}>
                <Server size={18} color={isServerConnected ? '#22c55e' : '#ef4444'} />
                <span style={{ fontWeight: 700, color: '#0f0f0f', fontSize: '17px' }}>Backend: {isServerConnected ? 'Online' : 'Offline'}</span>
              </span>

              {/* esp32 connectivity */}
              <span style={{ backgroundColor: '#f7f7f7', padding: '6px 12px', borderRadius: '15px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #0d0d0e' }}>
                {isEsp32Active ? (
                  <>
                    <Wifi size={14} color="#22c55e" />
                    <span style={{ fontWeight: 700, color: '#ef4444', fontSize: '17px' }}>ESP32: Active</span>
                  </>
                ) : (
                  <>
                    <WifiOff size={18} color="#ef4444" />
                    <span style={{ fontWeight: 700, color: '#0f0f0f', fontSize: '17px' }}>ESP32: Disconnected</span>
                  </>
                )}
              </span>

              <span style={{ backgroundColor: '#e2e8f0', padding: '6px 12px', borderRadius: '15px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #cbd5e1' }}>
                <p style={{ margin: 0, fontSize: '17px', color: '#0f0f0f', fontWeight: 700 }}>
                  Patient Status:{' '}
                  <span style={{ color: statusIsCritical ? '#ef4444' : '#22c55e', fontWeight: 'bold' }}>
                    {patientStatus}
                  </span>
                </p>
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>

          {/* ── TOP ROW ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '0.6fr 1.5fr', gap: '20px' }}>

            {/* card 1: Patient Overview */}
            <div className="cardio-card" style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <h4 style={{ margin: '0 0 15px 0', color: '#1e293b', fontSize: '30px' }}>Patient Overview</h4>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '15px' }}>
                <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
                  <img src={patientImg} alt="Patient" style={{ width: '100%', height: '100%' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '20px' }}>Hirushi Divyanjalie</h3>
                  <p style={{ margin: '2px 0', fontSize: '17px', color: '#1a212c', fontWeight: '500' }}>User Age: 24 | Blood Group: O+</p>
                  <p style={{ margin: 0, fontSize: '17px', color: '#1a212c', fontWeight: '500' }}>Patient Status: <span style={{ color: '#22c55e', fontWeight: '700', fontSize: '17px' }}>Normal</span></p>
                </div>
              </div>
            </div>

            {/* card: Real-time Vitals Summary */}
            <div className="cardio-card" style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '30px', color: '#1e293b' }}>Real-time Vitals Summary</h4>
              <p style={{ margin: '0 0 15px 0', fontSize: '20px', color: '#151616', fontWeight: '700' }}>
                Live tracking for instantaneous heart rate, blood pressure, and pulse interval.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '10px' }}>
                <div style={{ backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div>
                    <span style={{ fontSize: '20px', color: '#070707', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' }}><Heart size={20} color="#ef4444" className="beating-heart" />  Heart Rate</span>
                    <p style={{ margin: '4px 0 0 0', fontWeight: 'bold', fontSize: '18px' }}>{isEsp32Active ? realtimeData.avg_hr : 0} <span style={{ fontSize: '12px' }}>BPM</span></p>
                  </div>
                </div>

                <div style={{ backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '20px', color: '#070707', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' }}>
                    <span className="pulsing-gauge" style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 15a9 9 0 1 1 18 0" />
                        <line className="gauge-needle" x1="12" y1="15" x2="12" y2="10" />
                      </svg>
                    </span>
                    Blood Pressure
                  </span>
                  <p style={{ margin: '4px 0 0 0', fontWeight: 'bold', fontSize: '18px' }}>{isEsp32Active ? `${realtimeData.bp_sys}/${realtimeData.bp_dia}` : '120/80'} <span style={{ fontSize: '12px' }}>mmHg</span></p>
                </div>

                <div style={{ backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '20px', color: '#070707', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <svg width="30" height="25" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path className="ecg-live-line" d="M2 12h5l2-5 3 10 3-7 2 2h5" />
                      </svg>
                    </span>
                    Pulse Interval
                  </span>
                  <p style={{ margin: '4px 0 0 0', fontWeight: 'bold', fontSize: '18px' }}>{isEsp32Active ? realtimeData.pulse_interval : 0} <span style={{ fontSize: '12px' }}>ms</span></p>
                </div>
              </div>
            </div>
          </div>

          {/* ── BOTTOM ROW: 3 columns ── */}
          <div className="cardio-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1.5fr', gap: '20px', alignItems: 'start' }}>

            {/* COLUMN 1: Annotations + Device Health */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* card 2: annotations */}
              <div className="cardio-card" style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <h4 style={{ margin: '0 0 15px 0', fontSize: '30px' }}> Annotations</h4>
                <form onSubmit={handleAddEvent} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '20px' }} />
                    <select value={activityType} onChange={(e) => setActivityType(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '20px' }}>
                      <option value="Medication">Medication</option>
                      <option value="Exercise">Exercise</option>
                      <option value="Sleep">Sleep</option>
                    </select>
                    <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '20px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" placeholder="Notes..." value={notes} onChange={(e) => setNotes(e.target.value)} style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '20px' }} />
                    <button type="submit" style={{ backgroundColor: '#1d6fe0', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 12px', fontSize: '20px', cursor: 'pointer' }}>Add Event</button>
                  </div>
                </form>
                <div style={{ height: '200px', backgroundColor: '#f8fafc', borderRadius: '6px', marginTop: '10px', border: '1px solid #e2e8f0' }}>
                  {annotationChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={annotationChartData} margin={{ top: 20, right: 15, left: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                          dataKey="ts"
                          type="number"
                          scale="time"
                          domain={annotationDomain}
                          tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                          stroke="#64748b"
                          fontSize={10}
                          tickCount={5}
                          height={38}
                          label={{ value: 'Time', position: 'insideBottom', offset: -2, fontSize: '11px', fill: '#64748b' }}
                        />
                        <YAxis
                          domain={['auto', 'auto']}
                          stroke="#64748b"
                          fontSize={10}
                          width={55}
                          label={{ value: 'Heart Rate (BPM)', angle: -90, position: 'insideLeft', offset: 5, fontSize: '11px', fill: '#64748b', style: { textAnchor: 'middle' } }}
                        />
                        <Tooltip
                          labelFormatter={(t) => new Date(t).toLocaleTimeString()}
                          contentStyle={{ backgroundColor: '#ced5e7', borderColor: '#dae3f0', color: '#0c0c0c', borderRadius: '6px' }}
                          itemStyle={{ color: '#0c0b0b', fontSize: '12px' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="hr"
                          name="Heart Rate (BPM)"
                          stroke="#252926"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                          isAnimationActive={false}
                        />
                        {eventsData.map((ev, i) => (
                          <ReferenceLine
                            key={ev.id || i}
                            x={new Date(ev.event_time).getTime()}
                            stroke={getActivityColor(ev.activity_type)}
                            strokeWidth={2}
                            strokeDasharray="4 3"
                            label={{ value: ev.activity_type, position: 'top', fontSize: '10px', fill: getActivityColor(ev.activity_type) }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p style={{ textAlign: 'center', fontSize: '20px', color: '#94a3b8', paddingTop: '80px' }}>
                      No vitals data for {selectedDate}.
                    </p>
                  )}
                </div>
              </div>

              {/* Module 5: Device Health & Management */}
              <div className="cardio-card" style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '30px' }}>Device Health</h4>
                <p style={{ fontWeight: 'bold', margin: '0 0 10px 0', fontSize: '20px' }}>Device & Sensor Diagnostics</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '17px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Cpu size={14} /> ESP32: <span style={{ color: isEsp32Active ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>{isEsp32Active ? 'Active' : 'Offline'}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle size={14} /> MAX30102: <span style={{ color: isEsp32Active && realtimeData.status === 'Measuring' ? '#22c55e' : '#d97706', fontWeight: 'bold' }}>{!isEsp32Active ? 'Offline' : realtimeData.status === 'Measuring' ? 'Measuring' : 'No finger'}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Battery size={14} /> Battery: <span style={{ fontWeight: 'bold' }}>{isEsp32Active && realtimeData.battery_level != null ? `${realtimeData.battery_level}%${realtimeData.is_charging ? ' (charging)' : ''}` : 'N/A'}</span></div>
                </div>
              </div>
            </div>

            {/* COLUMN 2: Live PPG charts (memo) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <LiveCharts data={data}
                isEsp32Active={isEsp32Active}
                realtimeData={realtimeData}
                anomalyProb={anomalyProb}
                riskLevel={riskLevel}
                riskColor={riskColor}
                telemetryText={telemetryText}
                telemetryColor={telemetryColor} />
            </div>


            {/* COLUMN 3: Historical trends (memo) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <HistoryCard
                longTermData={longTermData}
                timeframe={timeframe}
                summaryStats={summaryStats}
                onTimeframeChange={setTimeframe}
              />
            </div>
          </div>
        </div>

        {/* Database Records Block */}
        <div className="cardio-card" style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', flex: 1, marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '20px', fontWeight: 'bold' }}>Database Records ({timeframe.toUpperCase()})</span>
            <span style={{ fontSize: '15px', color: '#061114' }}>Total: {recentLogs.length} Records</span>
          </div>

          <table style={{ width: '100%', fontSize: '17px', textAlign: 'left' }}>
            <thead>
              <tr style={{ color: '#0a0a0a', borderBottom: '1px solid #e2e8f0', fontSize: '15px' }}>
                <th>Time / Date</th><th>HR</th><th>BP</th><th>Pulse Int</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '17px' }}>No records found for selected timeframe.</td></tr>
              ) : (
                recentLogs.slice(0, 20).map((log, index) => (
                  <tr key={log.id || index}>
                    <td>
                      {new Date(log.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>
                    <td>{log.heart_rate}</td>
                    <td>{log.systolic_bp}/{log.diastolic_bp}</td>
                    <td>{log.pulse_interval}</td>
                    <td>{log.patient_status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
