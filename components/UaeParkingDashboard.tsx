'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

interface ParkingSlot {
  id: string;
  state: 'free' | 'available' | 'occupied';
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
  [slotId: string]: 'free' | 'available' | 'occupied';
}

// WebSocket message types
interface WebSocketMessage {
  type: 'initial_data' | 'bulk_update' | 'single_update' | 'system_status' | 'error' | 'status' | 'ping';
  data: any;
}

interface BulkUpdateData {
  updates: Partial<ParkingSlot>[];
  timestamp: number;
  updateCount: number;
}

interface InitialDataPayload {
  slots: ParkingSlot[];
  timestamp: number;
}

interface SystemStatusData {
  status: string;
  connectedClients: number;
  lastUpdate: number;
}

const UaeParkingDashboard: React.FC = () => {
  // Initialize with a consistent timestamp to avoid hydration issues
  const initialTimestamp = Date.now();
  
  // Floor navigation state
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  
  // WebSocket connection state
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [lastMessageTime, setLastMessageTime] = useState<number>(Date.now());
  const [backendStatus, setBackendStatus] = useState<any>(null);
  const [statusHistory, setStatusHistory] = useState<any[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const [customWsUrl, setCustomWsUrl] = useState('ws://192.168.0.110:8082/ws/parking');

  // Enhanced test connection function
  const testConnection = useCallback(async () => {
    const wsUrl = customWsUrl;
    console.log('🔍 Testing connection to:', wsUrl);
    
    // Test 1: HTTP connectivity
    console.log('📡 Test 1: HTTP connectivity...');
    try {
      const response = await fetch(`http://192.168.0.110:8082/`, { 
        method: 'GET',
        mode: 'no-cors'
      });
      console.log('✅ HTTP server responds:', response);
    } catch (error) {
      console.log('❌ HTTP test failed:', error);
    }
    
    // Test 2: Try different HTTP endpoints
    const httpEndpoints = [
      'http://192.168.0.110:8082/health',
      'http://192.168.0.110:8082/status',
      'http://192.168.0.110:8082/api/health',
      'http://192.168.0.110:8080/',
      'http://192.168.0.110:3000/'
    ];
    
    console.log('📡 Test 2: Testing HTTP endpoints...');
    for (const endpoint of httpEndpoints) {
      try {
        const response = await fetch(endpoint, { method: 'GET', mode: 'no-cors' });
        console.log(`✅ ${endpoint} responds:`, response);
      } catch (error) {
        console.log(`❌ ${endpoint} failed:`, error);
      }
    }
    
    // Test 3: WebSocket connection with detailed logging
    console.log('📡 Test 3: WebSocket connection...');
    const testWs = new WebSocket(wsUrl);
    
    testWs.onopen = () => {
      console.log('✅ WebSocket connection successful!');
      testWs.close();
    };
    
    testWs.onerror = (error) => {
      console.error('❌ WebSocket connection failed:', error);
      console.error('Error details:', {
        type: error.type,
        target: error.target,
        currentTarget: error.currentTarget
      });
    };
    
    testWs.onclose = (event) => {
      console.log('🔌 WebSocket connection closed:', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        type: event.type
      });
      
      // Explain the error code
      if (event.code === 1006) {
        console.error('💡 Error 1006 means:');
        console.error('   - Server is not running WebSocket service');
        console.error('   - CORS policy blocking the connection');
        console.error('   - Firewall blocking WebSocket connections');
        console.error('   - Wrong WebSocket endpoint path');
      }
    };
    
    // Test 4: Try WebSocket with different protocols
    console.log('📡 Test 4: Testing different WebSocket protocols...');
    const wsProtocols = [
      'ws://192.168.0.110:8082/ws/parking',
      'ws://192.168.0.110:8082/ws',
      'ws://192.168.0.110:8082/',
      'ws://192.168.0.110:8082/websocket',
      'ws://192.168.0.110:8080/ws/parking',
      'ws://192.168.0.110:3000/ws/parking'
    ];
    
    wsProtocols.forEach((protocol, index) => {
      setTimeout(() => {
        console.log(`Testing protocol ${index + 1}: ${protocol}`);
        const testWs2 = new WebSocket(protocol);
        
        testWs2.onopen = () => {
          console.log(`✅ Protocol ${index + 1} works: ${protocol}`);
          testWs2.close();
        };
        
        testWs2.onerror = () => {
          console.log(`❌ Protocol ${index + 1} failed: ${protocol}`);
        };
        
        testWs2.onclose = (event) => {
          console.log(`🔌 Protocol ${index + 1} closed: ${protocol} (code: ${event.code})`);
        };
      }, index * 1000); // Test each protocol with 1 second delay
    });
    
  }, [customWsUrl]);

  // Simple network test function
  const testNetworkConnectivity = useCallback(async () => {
    console.log('🌐 Testing network connectivity...');
    
    // Test 1: Basic HTTP connectivity
    try {
      const response = await fetch('http://192.168.0.110:8082/', { 
        method: 'GET',
        mode: 'no-cors'
      });
      console.log('✅ HTTP server responds on port 8082:', response);
    } catch (error) {
      console.log('❌ HTTP server not responding on port 8082:', error);
    }
    
    // Test 2: Try different ports
    const ports = [8080, 8081, 8082, 8083, 3000, 3001];
    for (const port of ports) {
      try {
        const response = await fetch(`http://192.168.0.110:${port}/`, { 
          method: 'GET',
          mode: 'no-cors'
        });
        console.log(`✅ Port ${port} responds:`, response);
      } catch (error) {
        console.log(`❌ Port ${port} not responding:`, error);
      }
    }
    
    // Test 3: WebSocket connection test
    console.log('🔌 Testing WebSocket connection...');
    const testWs = new WebSocket('ws://192.168.0.110:8082/ws/parking');
    
    testWs.onopen = () => {
      console.log('✅ WebSocket connection successful!');
      testWs.close();
    };
    
    testWs.onerror = (error) => {
      console.error('❌ WebSocket connection failed:', error);
    };
    
    testWs.onclose = (event) => {
      console.log('🔌 WebSocket closed with code:', event.code);
      if (event.code === 1006) {
        console.error('💡 Error 1006 means the WebSocket server is not running or not accessible');
      }
    };
    
  }, []);
  
  // Initialize with empty parking slots - will be populated from WebSocket
  const [parkingSlots, setParkingSlots] = useState<ParkingSlot[]>([]);

  // WebSocket connection functions
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus('connecting');
    
    // Backend developer's WebSocket server
    const possibleUrls = [
      'ws://192.168.0.110:8082/ws/parking',
      'ws://192.168.0.110:8082/ws',
      'ws://192.168.0.110:8082/parking',
      'ws://192.168.0.110:8082/',
      'ws://192.168.0.110:8080/ws/parking', // Try different port
      'ws://192.168.0.110:3000/ws/parking'  // Try different port
    ];
    
    const wsUrl = customWsUrl; // Use custom URL
    console.log('Attempting to connect to:', wsUrl);
    console.log('Alternative URLs to try:', possibleUrls.slice(1));
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');
        setWsConnection(ws);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        console.log('🔍 Raw WebSocket data received:', event.data);
        console.log('🔍 Data type:', typeof event.data);
        console.log('🔍 Data length:', event.data.length);
        
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessageTime(Date.now());
          handleWebSocketMessage(message);
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
          console.error('❌ Raw data that failed to parse:', event.data);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        console.log('Close event details:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          type: event.type
        });
        
        // Explain error codes
        if (event.code === 1006) {
          console.error('Connection failed (1006): Server may be down, network issue, or CORS problem');
        } else if (event.code === 1002) {
          console.error('Protocol error (1002): Invalid WebSocket protocol');
        } else if (event.code === 1003) {
          console.error('Unsupported data (1003): Invalid message type');
        } else if (event.code === 1000) {
          console.log('Normal closure (1000): Connection closed normally');
        }
        
        setConnectionStatus('disconnected');
        setWsConnection(null);
        
        // Attempt to reconnect if not a manual close
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionStatus('error');
    }
  }, []);

  // Handle different types of WebSocket messages
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    console.log('📨 Raw WebSocket message received:', message);
    console.log('📨 Message type:', message.type);
    console.log('📨 Message data:', message.data);
    
    switch (message.type) {
      case 'initial_data':
        console.log('Initial data message received:', message.data);
        console.log('Initial data structure:', JSON.stringify(message.data, null, 2));
        
        // Handle different possible data structures
        if (message.data && typeof message.data === 'object') {
          let slots: ParkingSlot[] = [];
          
          // Check if data has a 'slots' property
          if (message.data.slots && Array.isArray(message.data.slots)) {
            slots = message.data.slots;
          }
          // Check if data has a 'displays' property
          else if (message.data.displays && typeof message.data.displays === 'object') {
            const displaysData = message.data.displays;
            if (Array.isArray(displaysData)) {
              slots = displaysData.map((slot: any) => ({
                id: slot.id || slot.slot_id || 'Unknown',
                state: slot.state || slot.status || 'free',
                lastUpdated: slot.lastUpdated || slot.timestamp || Date.now(),
                zone: slot.zone || 'A',
                floor: slot.floor || 1,
                duration: slot.duration || 0
              }));
            } else if (typeof displaysData === 'object') {
              Object.entries(displaysData).forEach(([key, value]: [string, any]) => {
                if (typeof value === 'object' && value !== null) {
                  slots.push({
                    id: key,
                    state: value.state || value.status || 'free',
                    lastUpdated: value.lastUpdated || value.timestamp || Date.now(),
                    zone: value.zone || 'A',
                    floor: value.floor || 1,
                    duration: value.duration || 0
                  });
                }
              });
            }
          }
          // Check if the data itself is an array of slots
          else if (Array.isArray(message.data)) {
            slots = message.data.map((slot: any) => ({
              id: slot.id || slot.slot_id || 'Unknown',
              state: slot.state || slot.status || 'free',
              lastUpdated: slot.lastUpdated || slot.timestamp || Date.now(),
              zone: slot.zone || 'A',
              floor: slot.floor || 1,
              duration: slot.duration || 0
            }));
          }
          
          if (slots.length > 0) {
            console.log('Processed slots from initial_data:', slots);
            setParkingSlots(slots);
          } else {
            console.log('No slots found in initial_data message');
          }
        }
        break;

      case 'bulk_update':
        console.log('📦 Bulk update received:', message.data);
        const bulkData = message.data as BulkUpdateData;
        setParkingSlots(prevSlots => {
          const updatedSlots = [...prevSlots];
          
          bulkData.updates.forEach(update => {
            const index = updatedSlots.findIndex(slot => slot.id === update.id);
            if (index !== -1) {
              updatedSlots[index] = {
                ...updatedSlots[index],
                ...update,
                lastUpdated: update.lastUpdated || Date.now()
              };
              console.log('📦 Updated slot:', update.id, 'to state:', update.state);
            }
          });
          
          console.log('📦 Updated slots after bulk update:', updatedSlots);
          return updatedSlots;
        });
        console.log(`📦 Bulk update: ${bulkData.updateCount} slots updated`);
        break;

      case 'single_update':
        console.log('🔄 Single update received:', message.data);
        const singleUpdate = message.data as Partial<ParkingSlot>;
        setParkingSlots(prevSlots => {
          const updatedSlots = prevSlots.map(slot => 
            slot.id === singleUpdate.id 
              ? { ...slot, ...singleUpdate, lastUpdated: singleUpdate.lastUpdated || Date.now() }
              : slot
          );
          console.log('🔄 Updated slots after single update:', updatedSlots);
          return updatedSlots;
        });
        console.log('🔄 Single update for slot:', singleUpdate.id, 'new state:', singleUpdate.state);
        break;

      case 'system_status':
        const statusData = message.data as SystemStatusData;
        console.log('System status:', statusData);
        break;

      case 'status':
        console.log('Status message received:', message.data);
        // Handle status messages from backend
        if (message.data && typeof message.data === 'object') {
          console.log('Status details:', message.data);
          setBackendStatus(message.data);
          setStatusHistory(prev => [...prev.slice(-9), { 
            timestamp: Date.now(), 
            data: message.data 
          }]);

          // Process displays data for parking slots
          if (message.data.displays && typeof message.data.displays === 'object') {
            const displaysData = message.data.displays;
            console.log('Processing displays data:', displaysData);
            
            // Convert displays data to parking slots
            const newParkingSlots: ParkingSlot[] = [];
            
            // Handle different data structures from backend
            if (Array.isArray(displaysData)) {
              // If displays is an array of parking slots
              newParkingSlots.push(...displaysData.map((slot: any) => ({
                id: slot.id || slot.slot_id || 'Unknown',
                state: slot.state || slot.status || 'free',
                lastUpdated: slot.lastUpdated || slot.timestamp || Date.now(),
                zone: slot.zone || 'A',
                floor: slot.floor || 1,
                duration: slot.duration || 0
              })));
            } else if (typeof displaysData === 'object') {
              // If displays is an object with slot data
              Object.entries(displaysData).forEach(([key, value]: [string, any]) => {
                if (typeof value === 'object' && value !== null) {
                  newParkingSlots.push({
                    id: key,
                    state: value.state || value.status || 'free',
                    lastUpdated: value.lastUpdated || value.timestamp || Date.now(),
                    zone: value.zone || 'A',
                    floor: value.floor || 1,
                    duration: value.duration || 0
                  });
                }
              });
            }
            
            if (newParkingSlots.length > 0) {
              console.log('Updated parking slots from WebSocket:', newParkingSlots);
              setParkingSlots(newParkingSlots);
            }
          }
        }
        break;

      case 'ping':
        // Handle ping messages (heartbeat/keepalive)
        console.log('🏓 Ping received from server');
        console.log('🏓 Ping data:', message.data);
        break;

      case 'error':
        console.error('WebSocket error message:', message.data);
        break;

      default:
        console.warn('⚠️ Unknown message type:', message.type);
        console.warn('⚠️ Full message:', message);
        
        // Check if this might be a parking data message without proper type
        if (message.data && (message.data.slots || message.data.displays)) {
          console.log('🔄 Attempting to process as parking data without proper type...');
          // Try to process as initial_data
          const initialData = message.data;
          if (initialData.slots && Array.isArray(initialData.slots)) {
            console.log('✅ Found slots array, processing as initial_data');
            setParkingSlots(initialData.slots);
          }
        }
    }
  }, []);

  // Initialize WebSocket connection
  useEffect(() => {
    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, [connectWebSocket]);

  // Fallback simulation (only runs if WebSocket is not connected)
  const simulateRealisticParking = useCallback(() => {
    if (connectionStatus === 'connected') {
      return; // Don't simulate if we have real data
    }
    
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
  }, [connectionStatus]);

  // Simulate realistic parking updates every minute (only if not connected to WebSocket)
  useEffect(() => {
    if (connectionStatus !== 'connected') {
    const interval = setInterval(simulateRealisticParking, 60000); // Every minute
    return () => clearInterval(interval);
    }
  }, [simulateRealisticParking, connectionStatus]);

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

  // Get slots for selected floor
  const getSlotsForFloor = (floor: number) => {
    return parkingSlots.filter(slot => slot.floor === floor);
  };

  // Calculate comprehensive statistics (floor-specific or overall)
  const stats: ParkingStats = useMemo(() => {
    const slotsToAnalyze = selectedFloor ? getSlotsForFloor(selectedFloor) : parkingSlots;
    const freeSlots = slotsToAnalyze.filter(slot => slot.state === 'free' || slot.state === 'available').length;
    const occupiedSlots = slotsToAnalyze.filter(slot => slot.state === 'occupied').length;
    const totalSlots = slotsToAnalyze.length;
    const occupancyRate = totalSlots > 0 ? (occupiedSlots / totalSlots) * 100 : 0;
    
    const occupiedSlotsWithDuration = slotsToAnalyze.filter(slot => slot.state === 'occupied' && slot.duration);
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
  }, [parkingSlots, selectedFloor]);

  // Get floor statistics
  const floorStats = useMemo(() => {
    const floors = [1, 2, 3];
    return floors.map(floor => {
      const floorSlots = parkingSlots.filter(slot => slot.floor === floor);
      const freeSlots = floorSlots.filter(slot => slot.state === 'free' || slot.state === 'available').length;
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

  // Get current view slots (all or floor-specific)
  const currentViewSlots = selectedFloor ? getSlotsForFloor(selectedFloor) : parkingSlots;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 relative overflow-hidden">
      {/* UAE-Inspired Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-red-600 via-green-600 to-black transform rotate-12 scale-150"></div>
        <div className="absolute top-20 left-20 w-32 h-32 bg-red-500 rounded-full opacity-10 animate-pulse"></div>
        <div className="absolute top-40 right-32 w-24 h-24 bg-green-500 rounded-full opacity-10 animate-pulse delay-1000"></div>
        <div className="absolute bottom-32 left-40 w-20 h-20 bg-black rounded-full opacity-10 animate-pulse delay-2000"></div>
      </div>

      {/* Professional Header with UAE Elements */}
      <div className="relative bg-gradient-to-r from-red-600 via-green-600 to-black text-white shadow-lg">
        <div className="absolute inset-0 bg-black opacity-10"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* UAE Flag Icon - Subtle */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-8 bg-gradient-to-r from-red-600 via-green-600 to-black rounded shadow-md"></div>
                <span className="text-lg">🇦🇪</span>
              </div>
              
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-3">
                  <span className="text-white">UAE Parking Management</span>
                  <span className="text-xl">🏢</span>
                </h1>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span className="text-green-200 text-sm font-medium">Live Monitoring</span>
                  </div>
                  {selectedFloor && (
                    <>
                      <span className="text-white/60">•</span>
                      <button
                        onClick={() => setSelectedFloor(null)}
                        className="text-green-300 hover:text-green-100 text-sm font-medium transition-colors duration-200 flex items-center gap-1"
                      >
                        <span className="text-sm">←</span> Back to Overview
                      </button>
                      <span className="text-white/60">•</span>
                      <span className="text-green-200 font-medium">Floor {selectedFloor}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            {/* Professional Status Indicator */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md ${
                  connectionStatus === 'connected' ? 'bg-green-500' :
                  connectionStatus === 'connecting' ? 'bg-yellow-500' :
                  connectionStatus === 'error' ? 'bg-red-500' :
                  'bg-gray-500'
                }`}>
                  <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
                    <div className={`w-2 h-2 rounded-full ${
                      connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' :
                      connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                      connectionStatus === 'error' ? 'bg-red-500' :
                      'bg-gray-500'
                    }`}></div>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-green-200 text-xs font-medium">
                  {connectionStatus === 'connected' ? 'WebSocket' : 
                   connectionStatus === 'connecting' ? 'Connecting' :
                   connectionStatus === 'error' ? 'Connection Error' :
                   'Disconnected'}
              </div>
                <div className="text-white text-sm font-bold">
                  {connectionStatus === 'connected' ? 'Live Data' : 
                   connectionStatus === 'connecting' ? 'Connecting...' :
                   connectionStatus === 'error' ? 'Error' :
                   'Simulation Mode'}
            </div>
                {connectionStatus === 'connected' && (
                  <div className="text-green-300 text-xs">
                    Last update: {formatTime(lastMessageTime)}
          </div>
                )}
                {connectionStatus !== 'connected' && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button
                        onClick={connectWebSocket}
                        className="text-green-300 hover:text-green-100 text-xs underline transition-colors duration-200"
                      >
                        Reconnect
                      </button>
                      <button
                        onClick={testConnection}
                        className="text-blue-300 hover:text-blue-100 text-xs underline transition-colors duration-200"
                      >
                        Test
                      </button>
                      <button
                        onClick={testNetworkConnectivity}
                        className="text-purple-300 hover:text-purple-100 text-xs underline transition-colors duration-200"
                      >
                        Network
                      </button>
                    </div>
                    <div className="text-xs">
                      <input
                        type="text"
                        value={customWsUrl}
                        onChange={(e) => setCustomWsUrl(e.target.value)}
                        className="bg-white/10 text-white text-xs px-2 py-1 rounded border border-white/20 w-full"
                        placeholder="ws://192.168.0.110:8082/ws/parking"
                      />
                      <div className="text-white/60 text-xs mt-1">
                        Try: ws://192.168.0.110:8082/ws or ws://192.168.0.110:8082/
                      </div>
                      <div className="text-red-300 text-xs mt-1">
                        ⚠️ Still getting error 1006 - WebSocket server may not be running
                      </div>
                      <div className="text-yellow-300 text-xs mt-1">
                        🔧 Try: Click "Test" button for detailed diagnostics
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Innovative 3D Metrics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          {/* Total Capacity - UAE Flag Inspired */}
          <div className="group relative">
            <div className="absolute inset-0 bg-gradient-to-r from-red-500 via-green-500 to-black rounded-2xl transform rotate-2 group-hover:rotate-3 transition-transform duration-300"></div>
            <div className="relative bg-white rounded-2xl p-6 shadow-xl transform -rotate-1 group-hover:-rotate-2 transition-transform duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-600 uppercase tracking-wide">
                    {selectedFloor ? `Floor ${selectedFloor}` : 'Total'}
                  </p>
                  <p className="text-4xl font-black text-gray-900 mt-2">{stats.totalSlots}</p>
                  <p className="text-xs text-gray-500 mt-1">Parking Spaces</p>
                </div>
                <div className="w-16 h-16 bg-gradient-to-br from-red-500 via-green-500 to-black rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-2xl">🏢</span>
                </div>
              </div>
            </div>
          </div>

          {/* Available - Green Oasis Theme */}
          <div className="group relative">
            <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-600 rounded-2xl transform -rotate-1 group-hover:-rotate-2 transition-transform duration-300"></div>
            <div className="relative bg-white rounded-2xl p-6 shadow-xl transform rotate-1 group-hover:rotate-2 transition-transform duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-600 uppercase tracking-wide">Available</p>
                  <p className="text-4xl font-black text-green-600 mt-2">{stats.freeSlots}</p>
                  <p className="text-xs text-gray-500 mt-1">{((stats.freeSlots / stats.totalSlots) * 100).toFixed(1)}% Free</p>
                </div>
                <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-2xl">🌴</span>
                </div>
              </div>
            </div>
          </div>

          {/* Occupied - Desert Sand Theme */}
          <div className="group relative">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500 to-orange-600 rounded-2xl transform rotate-1 group-hover:rotate-2 transition-transform duration-300"></div>
            <div className="relative bg-white rounded-2xl p-6 shadow-xl transform -rotate-1 group-hover:-rotate-2 transition-transform duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-600 uppercase tracking-wide">Occupied</p>
                  <p className="text-4xl font-black text-orange-600 mt-2">{stats.occupiedSlots}</p>
                  <p className="text-xs text-gray-500 mt-1">{stats.occupancyRate.toFixed(1)}% Full</p>
                </div>
                <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-2xl">🚗</span>
                </div>
              </div>
            </div>
          </div>

          {/* Duration - Gold Theme */}
          <div className="group relative">
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-amber-600 rounded-2xl transform -rotate-2 group-hover:-rotate-3 transition-transform duration-300"></div>
            <div className="relative bg-white rounded-2xl p-6 shadow-xl transform rotate-2 group-hover:rotate-3 transition-transform duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-600 uppercase tracking-wide">Avg. Time</p>
                  <p className="text-4xl font-black text-amber-600 mt-2">{formatDuration(Math.round(stats.averageOccupancyTime))}</p>
                  <p className="text-xs text-gray-500 mt-1">Per Session</p>
                </div>
                <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-2xl">⏰</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Backend Status Display */}
        {connectionStatus === 'connected' && backendStatus && (
          <div className="mb-8">
            <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl p-6 border border-green-200 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <span className="text-2xl">📡</span>
                  Backend Status
                </h2>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-green-700">Live</span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(backendStatus).map(([key, value]) => (
                  <div key={key} className="bg-white rounded-lg p-4 shadow-sm border">
                    <div className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </div>
                    <div className="text-lg font-bold text-gray-900 mt-1">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </div>
                  </div>
                ))}
              </div>
              
              {statusHistory.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Recent Updates</h3>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {statusHistory.slice(-5).map((entry, index) => (
                      <div key={index} className="text-xs text-gray-600 bg-white rounded p-2 border">
                        <span className="font-mono">{formatTime(entry.timestamp)}</span>
                        <span className="ml-2">Status updated</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Professional Floor Navigation */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Floor Overview</h2>
            <p className="text-gray-600">Select a floor to view detailed parking information</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {floorStats.map((floor) => (
              <div
                key={floor.floor}
                className={`group relative cursor-pointer transition-all duration-300 ${
                  selectedFloor === floor.floor ? 'transform scale-105' : 'hover:scale-102'
                }`}
                onClick={() => setSelectedFloor(floor.floor)}
              >
                {/* Professional Card Design */}
                <div className={`relative bg-white rounded-xl shadow-lg border-2 transition-all duration-300 overflow-hidden ${
                  selectedFloor === floor.floor 
                    ? 'border-red-500 shadow-xl' 
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-xl'
                }`}>
                  {/* Header with Floor Number */}
                  <div className={`p-6 text-center ${
                    selectedFloor === floor.floor 
                      ? 'bg-gradient-to-r from-red-50 to-green-50' 
                      : 'bg-gray-50'
                  }`}>
                    <div className="flex items-center justify-center mb-3">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg ${
                        selectedFloor === floor.floor 
                          ? 'bg-gradient-to-r from-red-500 via-green-500 to-black' 
                          : 'bg-gradient-to-r from-gray-600 to-gray-800'
                      }`}>
                        <span className="text-2xl font-bold text-white">
                          {floor.floor}
                        </span>
                      </div>
                    </div>
                    <h3 className="text-xl font-bold text-gray-800">Floor {floor.floor}</h3>
                    <p className="text-sm text-gray-600 mt-1">Parking Level</p>
                  </div>

                  {/* Statistics Section */}
                  <div className="p-6">
                    <div className="space-y-4">
                      {/* Occupancy Rate */}
                      <div className="text-center">
                        <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-bold ${
                          floor.occupancyRate > 80 ? 'bg-red-100 text-red-800' :
                          floor.occupancyRate > 60 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {floor.occupancyRate.toFixed(1)}% Occupied
                        </div>
                      </div>

                      {/* Detailed Stats */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600">{floor.freeSlots}</div>
                          <div className="text-xs text-gray-600 uppercase tracking-wide">Available</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-red-600">{floor.occupiedSlots}</div>
                          <div className="text-xs text-gray-600 uppercase tracking-wide">Occupied</div>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-gray-600">
                          <span>Capacity</span>
                          <span>{floor.totalSlots} total</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
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

                      {/* Action Button */}
                      <div className="pt-4">
                        <div className={`w-full py-3 rounded-lg text-center font-medium transition-all duration-300 ${
                          selectedFloor === floor.floor 
                            ? 'bg-gradient-to-r from-red-500 via-green-500 to-black text-white' 
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}>
                          {selectedFloor === floor.floor ? 'Currently Viewing' : 'View Floor Details'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Selection Indicator */}
                  {selectedFloor === floor.floor && (
                    <div className="absolute top-4 right-4">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Innovative 3D Parking Slots Grid */}
        <div className="relative">
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-3xl shadow-2xl p-8 border border-gray-200">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                  <span className="text-4xl">🚗</span>
                  {selectedFloor ? `Floor ${selectedFloor} Parking` : 'All Parking Slots'}
                </h2>
                {selectedFloor && (
                  <p className="text-gray-600 mt-2 flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                    Showing {currentViewSlots.length} slots on Floor {selectedFloor}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-green-500 rounded-full shadow-lg"></div>
                    <span className="text-sm font-bold text-gray-700">Available</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-red-500 rounded-full shadow-lg"></div>
                    <span className="text-sm font-bold text-gray-700">Occupied</span>
                  </div>
                </div>
              </div>
            </div>
            
            {currentViewSlots.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🚗</div>
                <h3 className="text-xl font-bold text-gray-700 mb-2">Waiting for Parking Data</h3>
                <p className="text-gray-500 mb-4">
                  {connectionStatus === 'connected' 
                    ? 'Connected to backend. Waiting for parking slot data...' 
                    : 'Please connect to the WebSocket server to receive parking data.'}
                </p>
                {connectionStatus === 'connected' && (
                  <div className="inline-flex items-center gap-2 text-green-600">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium">Connected - Ready to receive data</span>
                  </div>
                )}
              </div>
            ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {currentViewSlots.map((slot) => (
                <div
                  key={slot.id}
                  className="group relative"
                >
                  {/* 3D Card Effect */}
                  <div className={`relative transform transition-all duration-300 group-hover:scale-110 group-hover:-translate-y-2 ${
                    slot.state === 'free' 
                      ? 'hover:rotate-1' 
                      : 'hover:-rotate-1'
                  }`}>
                    {/* Card Shadow */}
                    <div className={`absolute inset-0 rounded-2xl transform transition-all duration-300 ${
                      slot.state === 'free' 
                        ? 'bg-gradient-to-br from-green-400 to-emerald-600' 
                        : 'bg-gradient-to-br from-red-400 to-red-600'
                    } group-hover:scale-105`}></div>
                    
                    {/* Main Card */}
                    <div className={`relative bg-white rounded-2xl p-4 shadow-xl border-2 transition-all duration-300 ${
                      slot.state === 'free' 
                        ? 'border-green-200 group-hover:border-green-400' 
                        : 'border-red-200 group-hover:border-red-400'
                    }`}>
                      {/* Floor Badge - 3D Style */}
                      <div className="absolute -top-2 -right-2">
                        <div className="bg-gradient-to-r from-gray-600 to-gray-800 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg transform rotate-12">
                          F{slot.floor}
                        </div>
                      </div>

                      {/* Zone Badge */}
                      <div className="absolute -top-2 -left-2">
                        <div className="bg-gradient-to-r from-blue-500 to-blue-700 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg transform -rotate-12">
                          {slot.zone}
                        </div>
                      </div>

                      {/* Slot ID - Large and Bold */}
                      <div className="text-center mb-4 mt-2">
                        <div className="text-2xl font-black text-gray-800 transform group-hover:scale-110 transition-transform duration-300">
                          {slot.id}
                        </div>
                      </div>

                      {/* Status - 3D Button Effect */}
                      <div className="text-center mb-4">
                        <div className={`relative inline-block transform transition-all duration-300 group-hover:scale-110 ${
                          slot.state === 'free' || slot.state === 'available'
                            ? 'hover:rotate-2' 
                            : 'hover:-rotate-2'
                        }`}>
                          <div className={`absolute inset-0 rounded-full transform ${
                            slot.state === 'free' || slot.state === 'available'
                              ? 'bg-green-600' 
                              : 'bg-red-600'
                          } group-hover:scale-105`}></div>
                          <span className={`relative inline-block px-4 py-2 rounded-full text-sm font-black text-white shadow-lg ${
                            slot.state === 'free' || slot.state === 'available'
                              ? 'bg-green-500' 
                              : 'bg-red-500'
                          }`}>
                            {slot.state === 'free' || slot.state === 'available' ? '🟢 FREE' : '🔴 OCCUPIED'}
                          </span>
                        </div>
                      </div>

                      {/* Duration - Animated */}
                      {slot.duration !== undefined && (
                        <div className="text-center">
                          <div className="text-xs text-gray-500 mb-1 font-medium">
                            {slot.state === 'occupied' ? '⏱️ Parked for' : '🕐 Free for'}
                          </div>
                          <div className="text-sm font-bold text-gray-800 transform group-hover:scale-105 transition-transform duration-300">
                            {formatDuration(slot.duration)}
                          </div>
                        </div>
                      )}

                      {/* Hover Effect Overlay */}
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>

        {/* Unique Footer */}
        <div className="mt-16 text-center">
          <div className="bg-gradient-to-r from-red-600 via-green-600 to-black rounded-2xl p-6 text-white shadow-2xl">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                <span className="text-lg">🇦🇪</span>
              </div>
              <h3 className="text-xl font-bold">UAE Parking Management System</h3>
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                <span className="text-lg">🏢</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full animate-pulse ${
                  connectionStatus === 'connected' ? 'bg-green-400' : 'bg-gray-400'
                }`}></div>
                <span>{connectionStatus === 'connected' ? 'Live Monitoring' : 'Simulation Mode'}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full animate-pulse ${
                  connectionStatus === 'connected' ? 'bg-yellow-400' : 'bg-gray-400'
                }`}></div>
                <span>{connectionStatus === 'connected' ? 'Real-time Updates' : 'Simulated Updates'}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span>Last refresh: {formatTime(stats.lastUpdated)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UaeParkingDashboard;