'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';

interface ParkingSlot {
  id: string;
  state: 'free' | 'occupied';
  lastUpdated: number;
  zone: string;
  floor: number;
  duration?: number; // How long it's been in current state (in minutes)
}

interface ParkingStats {
  totalSlots: number;
  freeSlots: number;
  occupiedSlots: number;
  occupancyRate: number;
  averageOccupancyTime: number;
  peakHours: string[];
  lastUpdated: number;
}

interface MqttPayload {
  [slotId: string]: 'free' | 'occupied';
}

const UaeParkingDashboard: React.FC = () => {
  // Initialize with a consistent timestamp to avoid hydration issues
  const initialTimestamp = Date.now();
  
  // More realistic initial state - simulate a busy mall scenario
  const [parkingSlots, setParkingSlots] = useState<ParkingSlot[]>([
    // Floor 1 - High occupancy (busy area)
    { id: 'J01', state: 'occupied', lastUpdated: initialTimestamp, zone: 'A', floor: 1, duration: 45 },
    { id: 'J02', state: 'occupied', lastUpdated: initialTimestamp, zone: 'A', floor: 1, duration: 23 },
    { id: 'J03', state: 'free', lastUpdated: initialTimestamp, zone: 'A', floor: 1, duration: 2 },
    { id: 'J04', state: 'occupied', lastUpdated: initialTimestamp, zone: 'A', floor: 1, duration: 67 },
    { id: 'J05', state: 'occupied', lastUpdated: initialTimestamp, zone: 'B', floor: 1, duration: 12 },
    { id: 'J06', state: 'free', lastUpdated: initialTimestamp, zone: 'B', floor: 1, duration: 8 },
    { id: 'J07', state: 'occupied', lastUpdated: initialTimestamp, zone: 'B', floor: 1, duration: 34 },
    { id: 'J08', state: 'occupied', lastUpdated: initialTimestamp, zone: 'B', floor: 1, duration: 56 },
    
    // Floor 2 - Medium occupancy
    { id: 'J09', state: 'free', lastUpdated: initialTimestamp, zone: 'A', floor: 2, duration: 15 },
    { id: 'J10', state: 'occupied', lastUpdated: initialTimestamp, zone: 'A', floor: 2, duration: 28 },
    { id: 'J11', state: 'free', lastUpdated: initialTimestamp, zone: 'A', floor: 2, duration: 5 },
    { id: 'J12', state: 'free', lastUpdated: initialTimestamp, zone: 'A', floor: 2, duration: 12 },
    { id: 'J13', state: 'occupied', lastUpdated: initialTimestamp, zone: 'B', floor: 2, duration: 41 },
    { id: 'J14', state: 'free', lastUpdated: initialTimestamp, zone: 'B', floor: 2, duration: 3 },
    { id: 'J15', state: 'occupied', lastUpdated: initialTimestamp, zone: 'B', floor: 2, duration: 19 },
    { id: 'J16', state: 'free', lastUpdated: initialTimestamp, zone: 'B', floor: 2, duration: 7 },
    
    // Floor 3 - Lower occupancy (less popular area)
    { id: 'J17', state: 'free', lastUpdated: initialTimestamp, zone: 'A', floor: 3, duration: 25 },
    { id: 'J18', state: 'free', lastUpdated: initialTimestamp, zone: 'A', floor: 3, duration: 18 },
    { id: 'J19', state: 'occupied', lastUpdated: initialTimestamp, zone: 'A', floor: 3, duration: 33 },
    { id: 'J20', state: 'free', lastUpdated: initialTimestamp, zone: 'A', floor: 3, duration: 9 },
  ]);

  // More realistic simulation - gradual changes with patterns
  const simulateRealisticParking = useCallback(() => {
    setParkingSlots(prevSlots => {
      return prevSlots.map(slot => {
        const now = Date.now();
        const timeSinceUpdate = (now - slot.lastUpdated) / 1000 / 60; // minutes
        
        // Update duration
        const newDuration = (slot.duration || 0) + 1;
        
        // Realistic parking patterns based on floor and zone
        let changeProbability = 0.02; // 2% base chance per minute
        
        // Floor 1 (busy) - higher turnover
        if (slot.floor === 1) {
          changeProbability = 0.04;
        }
        // Floor 3 (quiet) - lower turnover  
        else if (slot.floor === 3) {
          changeProbability = 0.01;
        }
        
        // Longer occupied slots are more likely to become free
        if (slot.state === 'occupied' && newDuration > 60) {
          changeProbability *= 2;
        }
        
        // Longer free slots are more likely to become occupied
        if (slot.state === 'free' && newDuration > 10) {
          changeProbability *= 1.5;
        }
        
        if (Math.random() < changeProbability) {
          return {
            ...slot,
            state: slot.state === 'free' ? 'occupied' : 'free',
            lastUpdated: now,
            duration: 0
          };
        }
        
        return {
          ...slot,
          duration: newDuration
        };
      });
    });
  }, []);

  // Simulate realistic parking updates every minute
  useEffect(() => {
    const interval = setInterval(simulateRealisticParking, 60000); // Every minute
    return () => clearInterval(interval);
  }, [simulateRealisticParking]);

  // Format time to hh:mm:ss
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Format duration in a human-readable way
  const formatDuration = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  // Calculate comprehensive statistics
  const stats: ParkingStats = useMemo(() => {
    const freeSlots = parkingSlots.filter(slot => slot.state === 'free').length;
    const occupiedSlots = parkingSlots.filter(slot => slot.state === 'occupied').length;
    const totalSlots = parkingSlots.length;
    const occupancyRate = (occupiedSlots / totalSlots) * 100;
    
    const occupiedSlotsWithDuration = parkingSlots.filter(slot => slot.state === 'occupied' && slot.duration);
    const averageOccupancyTime = occupiedSlotsWithDuration.length > 0 
      ? occupiedSlotsWithDuration.reduce((sum, slot) => sum + (slot.duration || 0), 0) / occupiedSlotsWithDuration.length
      : 0;

    return {
      totalSlots,
      freeSlots,
      occupiedSlots,
      occupancyRate,
      averageOccupancyTime,
      peakHours: ['10:00-12:00', '14:00-16:00', '18:00-20:00'],
      lastUpdated: Date.now()
    };
  }, [parkingSlots]);

  // Get floor statistics
  const floorStats = useMemo(() => {
    const floors = [1, 2, 3];
    return floors.map(floor => {
      const floorSlots = parkingSlots.filter(slot => slot.floor === floor);
      const freeSlots = floorSlots.filter(slot => slot.state === 'free').length;
      const occupiedSlots = floorSlots.filter(slot => slot.state === 'occupied').length;
      const occupancyRate = (occupiedSlots / floorSlots.length) * 100;
      
      return {
        floor,
        totalSlots: floorSlots.length,
        freeSlots,
        occupiedSlots,
        occupancyRate
      };
    });
  }, [parkingSlots]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Modern Header */}
      <div className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                UAE Parking Tracker MVP 
              </h1>
              <p className="text-slate-600 mt-1">Real-time parking analytics & monitoring</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              Live
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Key Metrics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total Capacity</p>
                <p className="text-3xl font-bold text-slate-900">{stats.totalSlots}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Available</p>
                <p className="text-3xl font-bold text-green-600">{stats.freeSlots}</p>
                <p className="text-xs text-slate-500">{((stats.freeSlots / stats.totalSlots) * 100).toFixed(1)}% available</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Occupied</p>
                <p className="text-3xl font-bold text-red-600">{stats.occupiedSlots}</p>
                <p className="text-xs text-slate-500">{stats.occupancyRate.toFixed(1)}% occupancy</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Avg. Duration</p>
                <p className="text-3xl font-bold text-purple-600">{formatDuration(Math.round(stats.averageOccupancyTime))}</p>
                <p className="text-xs text-slate-500">per occupied slot</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Floor Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {floorStats.map((floor) => (
            <div key={floor.floor} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Floor {floor.floor}</h3>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                  floor.occupancyRate > 80 ? 'bg-red-100 text-red-800' :
                  floor.occupancyRate > 60 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {floor.occupancyRate.toFixed(1)}% full
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Available</span>
                  <span className="font-medium text-green-600">{floor.freeSlots}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Occupied</span>
                  <span className="font-medium text-red-600">{floor.occupiedSlots}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-500 ${
                      floor.occupancyRate > 80 ? 'bg-red-500' :
                      floor.occupancyRate > 60 ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}
                    style={{ width: `${floor.occupancyRate}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Parking Slots Grid */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-slate-900">Parking Slots</h2>
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                Available
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                Occupied
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {parkingSlots.map((slot) => (
              <div
                key={slot.id}
                className={`
                  relative rounded-lg p-4 transition-all duration-300 hover:shadow-md border-2
                  ${slot.state === 'free' 
                    ? 'bg-green-50 border-green-200 hover:border-green-300' 
                    : 'bg-red-50 border-red-200 hover:border-red-300'
                  }
                `}
              >
                {/* Floor Badge */}
                <div className="absolute top-2 right-2">
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
                    F{slot.floor}
                  </span>
                </div>

                {/* Slot ID */}
                <div className="text-center mb-3">
                  <div className="text-lg font-bold text-slate-800">
                    {slot.id}
                  </div>
                  <div className="text-xs text-slate-500">Zone {slot.zone}</div>
                </div>

                {/* Status */}
                <div className="text-center mb-3">
                  <span
                    className={`
                      inline-block px-3 py-1 rounded-full text-xs font-semibold
                      ${slot.state === 'free' 
                        ? 'bg-green-500 text-white' 
                        : 'bg-red-500 text-white'
                      }
                    `}
                  >
                    {slot.state === 'free' ? 'FREE' : 'OCCUPIED'}
                  </span>
                </div>

                {/* Duration */}
                {slot.duration !== undefined && (
                  <div className="text-center">
                    <div className="text-xs text-slate-600 mb-1">
                      {slot.state === 'occupied' ? 'Parked for' : 'Free for'}
                    </div>
                    <div className="text-sm font-medium text-slate-800">
                      {formatDuration(slot.duration)}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-slate-500">
            Realistic parking simulation • Updates every minute • Last refresh: {formatTime(stats.lastUpdated)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default UaeParkingDashboard;