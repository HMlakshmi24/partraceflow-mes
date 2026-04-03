'use client';

import { ReactNode } from 'react';

interface MegaKPIProps {
  value: number;
  label: string;
  trend?: string;
  status: 'win' | 'watch' | 'stop' | 'perfect';
  tooltip: string;
  emoji?: ReactNode;
  className?: string;
  unit?: string;
  helper?: string;
}

export default function MegaKPI({ 
  value, 
  label, 
  trend, 
  status, 
  tooltip, 
  emoji = '🎯', 
  className = '',
  unit = '%',
  helper
}: MegaKPIProps) {
  const statusClass = `mega-kpi ${status}`;
  const valueText = unit ? `${value}${unit}` : `${value}`;
  
  return (
    <div className={`${statusClass} ${className}`} title={tooltip}>
      {/* Emoji Face */}
      <div className="mega-kpi__emoji">
        {status === 'win' ? '😊' : 
         status === 'watch' ? '🙂' : 
         status === 'stop' ? '😟' : '🚀'}
        {emoji}
      </div>
      
      {/* GIANT NUMBER */}
      <div className="mega-kpi__number">
        {valueText}
      </div>
      
      {/* Simple Label */}
      <div className="mega-kpi__label">{label}</div>

      {helper && (
        <div className="mega-kpi__helper">{helper}</div>
      )}
      
      {/* TREND */}
      {trend && (
        <div className="mega-kpi__trend">
          <span className={`trend-arrow ${trend.startsWith('+') ? 'trend-up' : 'trend-down'}`}>
            {trend.startsWith('+') ? '📈' : '📉'}
          </span>
          <span>{trend}</span>
          <span style={{fontSize: '0.8em'}}>since yesterday</span>
        </div>
      )}
      
      {/* TOOLTIP */}
      <div className="mega-tooltip">
        {tooltip}
      </div>
      
      {/* Status Pulse */}
      {status === 'stop' && <div className="pulse-stop" />}
      {status === 'win' && <div className="pulse-win" />}
    </div>
  );
}

// Demo Usage:
/*
<MegaKPI 
  value={85} 
  label="Factory Score" 
  trend="+3%" 
  status="win" 
  tooltip="85% = EXCELLENT! 💰 $2,456 saved today. Green = Perfect day!" 
/>
*/



