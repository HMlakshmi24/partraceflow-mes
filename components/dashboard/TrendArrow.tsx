'use client';

import { ReactNode } from 'react';

interface TrendArrowProps {
  trend: string;  // "+3%" or "-1%"
  size?: 'mega' | 'large' | 'med';
}

export default function TrendArrow({ trend, size = 'large' }: TrendArrowProps) {
  const isPositive = trend.startsWith('+');
  const absValue = trend.replace(/[+%]/g, '');
  
  return (
    <span className={`trend-${size} ${isPositive ? 'trend-up' : 'trend-down'}`}>
      <span className="trend-icon">
        {isPositive ? '📈' : '📉'}
      </span>
      <span className="trend-value">{absValue}%</span>
      <span className="trend-since">vs yesterday</span>
    </span>
  );
}

